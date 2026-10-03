//! Jobs: `count` images in parallel, each with its own status, cancellable as one (GEN-04);
//! storing what the providers make as assets of the workspace; and the default provider
//! (GEN-01), which is the `images` section of the app's settings.

use std::{
    collections::HashMap,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::{
    sync::{Semaphore, watch},
    time::Instant,
};

use super::{
    Cancel, EditJob, EditRequest, EditSupport, GenerateJob, GenerateRequest, GeneratedImage,
    ImageError, ImageErrorKind, ImageEvent, ImageOutcome, ImageProvider, JobResult,
    ProviderDescriptor, ProviderStatus, Result,
};
use crate::{
    assets::{self, ImportedAsset},
    settings::Settings,
    storage::Storage,
};

/// Most images in one job. The agent's tools ask for up to 4 (SPEC 11.4).
const MAX_COUNT: u32 = 8;
/// Longest job id, in bytes.
const MAX_JOB_ID: usize = 64;
/// The section of the app's settings this service owns.
const SECTION: &str = "images";

/// Owns the providers and the running jobs. Shared by the IPC commands; testable without Tauri.
pub struct ImageService {
    providers: Vec<Slot>,
    /// Where the user's choice of default provider is kept, in the section `images`.
    settings: Arc<Settings>,
    /// The running jobs, each with the sender that cancels it.
    jobs: Mutex<HashMap<String, watch::Sender<bool>>>,
}

/// A provider and how many images it may still start right now, over all jobs.
struct Slot {
    provider: Arc<dyn ImageProvider>,
    descriptor: ProviderDescriptor,
    free: Arc<Semaphore>,
}

/// The `images` section of the settings, as far as this service reads it.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Choice {
    default_provider: Option<String>,
}

/// What each image of a job is made from.
enum Work {
    Generate(GenerateRequest),
    Edit(EditRequest),
}

type Deliver = Arc<dyn Fn(ImageEvent) + Send + Sync>;

impl ImageService {
    /// A service over `providers`; the first is the default until the user picks another.
    pub fn new(settings: Arc<Settings>, providers: Vec<Arc<dyn ImageProvider>>) -> Self {
        let providers = providers
            .into_iter()
            .map(|provider| {
                let descriptor = provider.descriptor();
                let free = Arc::new(Semaphore::new(
                    descriptor.capabilities.max_parallel.max(1) as usize
                ));
                Slot {
                    provider,
                    descriptor,
                    free,
                }
            })
            .collect();
        Self {
            providers,
            settings,
            jobs: Mutex::new(HashMap::new()),
        }
    }

    /// Takes the choice an earlier version kept in a file of its own
    /// (`<app_data>/image-providers.json`) into the settings, once, and removes the file.
    pub fn adopt_legacy_choice(&self, legacy_file: &Path) {
        let Ok(bytes) = fs::read(legacy_file) else {
            return;
        };
        let chosen = self.settings.read::<Choice>(SECTION).default_provider;
        let legacy = serde_json::from_slice::<Choice>(&bytes)
            .ok()
            .and_then(|choice| choice.default_provider);
        if let (None, Some(id)) = (chosen, legacy) {
            // Best effort: a choice that cannot be carried over is a default to pick again.
            let _ = self.remember(&id);
        }
        let _ = fs::remove_file(legacy_file);
    }

    /// The registered providers, in registration order.
    pub fn descriptors(&self) -> Vec<ProviderDescriptor> {
        self.providers
            .iter()
            .map(|slot| slot.descriptor.clone())
            .collect()
    }

    /// Checks one provider.
    pub async fn probe(&self, provider_id: &str) -> Result<ProviderStatus> {
        Ok(self.slot(Some(provider_id))?.provider.probe().await)
    }

    /// The provider a job uses when it names none: the user's choice while it is still
    /// registered, the first provider otherwise.
    pub fn default_provider(&self) -> Result<String> {
        Ok(self.slot(None)?.descriptor.id.clone())
    }

    /// Makes `provider_id` the default and remembers it across runs.
    pub fn set_default_provider(&self, provider_id: &str) -> Result<()> {
        let id = self.slot(Some(provider_id))?.descriptor.id.clone();
        self.remember(&id)
    }

    /// Writes the choice into the settings, next to whatever else the section holds.
    fn remember(&self, id: &str) -> Result<()> {
        let mut section = match self.settings.all().remove(SECTION) {
            Some(Value::Object(section)) => section,
            _ => serde_json::Map::new(),
        };
        section.insert("defaultProvider".into(), json!(id));
        Ok(self.settings.write(SECTION, Value::Object(section))?)
    }

    /// Generates `job.count` images and stores each as an asset of the workspace. Returns when
    /// every image is settled; `deliver` hears of each as it starts and as it settles.
    ///
    /// Fails as a whole only when nothing could start. An image that fails does not fail the
    /// others.
    pub async fn generate(
        &self,
        storage: &Arc<Storage>,
        job_id: &str,
        workspace_id: &str,
        job: GenerateJob,
        deliver: impl Fn(ImageEvent) + Send + Sync + 'static,
    ) -> Result<JobResult> {
        if job.prompt.trim().is_empty() {
            return Err(ImageError::invalid_input("the prompt is empty"));
        }
        check_count(job.count)?;
        let slot = self.slot(job.provider.as_deref())?;
        storage.assets_dir(workspace_id)?;
        let work = Work::Generate(GenerateRequest {
            prompt: job.prompt,
            aspect: job.aspect,
        });
        self.run(
            storage,
            job_id,
            workspace_id,
            slot,
            job.count,
            work,
            Arc::new(deliver),
        )
        .await
    }

    /// Makes `job.count` new images from an asset of the workspace, each stored as a new asset;
    /// the source stays. What "edit" means is the provider's `capabilities.edit`.
    pub async fn edit(
        &self,
        storage: &Arc<Storage>,
        job_id: &str,
        workspace_id: &str,
        job: EditJob,
        deliver: impl Fn(ImageEvent) + Send + Sync + 'static,
    ) -> Result<JobResult> {
        if job.instruction.trim().is_empty() {
            return Err(ImageError::invalid_input("the instruction is empty"));
        }
        check_count(job.count)?;
        let slot = self.slot(job.provider.as_deref())?;
        let ProviderDescriptor {
            name, capabilities, ..
        } = &slot.descriptor;
        if capabilities.edit == EditSupport::None {
            return Err(ImageError::new(
                ImageErrorKind::Unsupported,
                format!("{name} cannot edit images"),
            ));
        }
        if job.mask_asset_id.is_some() && !capabilities.mask {
            return Err(ImageError::new(
                ImageErrorKind::Unsupported,
                format!(
                    "{name} cannot edit inside a mask: it redraws the whole image. Edit without \
                     a mask, or use a provider that supports masks."
                ),
            ));
        }
        let assets_dir = storage.assets_dir(workspace_id)?;
        let (source, mask) = tokio::task::spawn_blocking(move || {
            let source = asset_file(&assets_dir, &job.asset_id)?;
            let mask = match &job.mask_asset_id {
                Some(id) => Some(asset_file(&assets_dir, id)?),
                None => None,
            };
            Ok::<_, ImageError>((source, mask))
        })
        .await
        .map_err(ImageError::internal)??;
        let work = Work::Edit(EditRequest {
            source,
            mask,
            instruction: job.instruction,
        });
        self.run(
            storage,
            job_id,
            workspace_id,
            slot,
            job.count,
            work,
            Arc::new(deliver),
        )
        .await
    }

    /// Cancels a running job: images not yet settled end as `cancelled`; images already stored
    /// stay. Nothing to do when the job is over.
    pub fn cancel(&self, job_id: &str) {
        if let Some(cancel) = lock(&self.jobs).get(job_id) {
            cancel.send_replace(true);
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn run(
        &self,
        storage: &Arc<Storage>,
        job_id: &str,
        workspace_id: &str,
        slot: &Slot,
        count: u32,
        work: Work,
        deliver: Deliver,
    ) -> Result<JobResult> {
        let (registered, cancel) = self.register(job_id)?;
        let work = Arc::new(work);
        let tasks: Vec<_> = (0..count)
            .map(|index| {
                tokio::spawn(one_image(
                    Arc::clone(&slot.provider),
                    Arc::clone(&slot.free),
                    Arc::clone(&work),
                    cancel.clone(),
                    Arc::clone(storage),
                    workspace_id.to_owned(),
                    index,
                    Arc::clone(&deliver),
                ))
            })
            .collect();
        let mut images = Vec::with_capacity(tasks.len());
        for (index, task) in (0..count).zip(tasks) {
            images.push(match task.await {
                Ok(outcome) => outcome,
                // The image's task panicked; the job still accounts for it.
                Err(e) => {
                    let outcome = ImageOutcome::Failed {
                        error: ImageError::internal(e),
                    };
                    deliver(ImageEvent::Finished {
                        index,
                        outcome: outcome.clone(),
                    });
                    outcome
                }
            });
        }
        drop(registered);
        Ok(JobResult {
            provider: slot.descriptor.id.clone(),
            images,
        })
    }

    /// Enters a job in the list of running ones. The id is the caller's, so that it can cancel
    /// a job whose call has not returned yet.
    fn register(&self, job_id: &str) -> Result<(Registered<'_>, Cancel)> {
        let plain = !job_id.is_empty()
            && job_id.len() <= MAX_JOB_ID
            && job_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
        if !plain {
            return Err(ImageError::invalid_input(format!(
                "invalid job id {job_id:?}: expected letters, digits, '-' and '_'"
            )));
        }
        let mut jobs = lock(&self.jobs);
        if jobs.contains_key(job_id) {
            return Err(ImageError::invalid_input(format!(
                "a job with the id {job_id} is already running"
            )));
        }
        let (sender, cancel) = Cancel::new();
        jobs.insert(job_id.to_owned(), sender);
        let registered = Registered {
            jobs: &self.jobs,
            id: job_id.to_owned(),
        };
        Ok((registered, cancel))
    }

    /// The provider `id` names, or the default one.
    fn slot(&self, id: Option<&str>) -> Result<&Slot> {
        let find = |id: &str| self.providers.iter().find(|slot| slot.descriptor.id == id);
        let found = match id {
            Some(id) => find(id),
            None => self
                .settings
                .read::<Choice>(SECTION)
                .default_provider
                .as_deref()
                .and_then(find)
                .or_else(|| self.providers.first()),
        };
        found.ok_or_else(|| {
            ImageError::new(
                ImageErrorKind::UnknownProvider,
                match id {
                    Some(id) => format!("unknown image provider: {id}"),
                    None => "no image provider is registered".into(),
                },
            )
        })
    }
}

/// A job in the list of running ones, for as long as this lives.
struct Registered<'a> {
    jobs: &'a Mutex<HashMap<String, watch::Sender<bool>>>,
    id: String,
}

impl Drop for Registered<'_> {
    /// A job whose caller went away takes its unfinished images with it.
    fn drop(&mut self) {
        if let Some(cancel) = lock(self.jobs).remove(&self.id) {
            cancel.send_replace(true);
        }
    }
}

/// One image of a job, from waiting for a free slot of the provider to the asset in the store.
#[allow(clippy::too_many_arguments)]
async fn one_image(
    provider: Arc<dyn ImageProvider>,
    free: Arc<Semaphore>,
    work: Arc<Work>,
    mut cancel: Cancel,
    storage: Arc<Storage>,
    workspace_id: String,
    index: u32,
    deliver: Deliver,
) -> ImageOutcome {
    let made = async {
        // Held until the image is stored, so no more than the provider's `max_parallel` images
        // are ever between `started` and `finished`.
        let _slot = tokio::select! {
            biased;
            () = cancel.cancelled() => return Err(ImageError::cancelled()),
            slot = free.acquire() => slot.map_err(ImageError::internal)?,
        };
        deliver(ImageEvent::Started { index });
        let began = Instant::now();
        let image = match &*work {
            Work::Generate(request) => provider.generate(request, cancel.clone()).await,
            Work::Edit(request) => provider.edit(request, cancel.clone()).await,
        }?;
        let duration_ms = u64::try_from(began.elapsed().as_millis()).unwrap_or(u64::MAX);
        let asset = store(storage, workspace_id, image).await?;
        Ok(ImageOutcome::Stored { asset, duration_ms })
    }
    .await;
    let outcome = made.unwrap_or_else(|error| ImageOutcome::Failed { error });
    deliver(ImageEvent::Finished {
        index,
        outcome: outcome.clone(),
    });
    outcome
}

/// Puts what a provider made into the workspace's content-addressed store.
async fn store(
    storage: Arc<Storage>,
    workspace_id: String,
    image: GeneratedImage,
) -> Result<ImportedAsset> {
    if !infer::is_image(&image.bytes) {
        return Err(ImageError::new(
            ImageErrorKind::GenerationFailed,
            "the provider returned a file that is not an image",
        ));
    }
    tokio::task::spawn_blocking(move || {
        // Looked up now, not when the job began: a workspace closed since must not be written.
        let dir = storage.assets_dir(&workspace_id)?;
        assets::import_bytes(&dir, None, &image.bytes)
    })
    .await
    .map_err(ImageError::internal)?
    .map_err(ImageError::from)
}

/// The file of asset `id` in a workspace's store: `<id>.<ext>`, a raster image.
fn asset_file(assets_dir: &Path, id: &str) -> Result<PathBuf> {
    // The id is compared with file names; anything but a plain token could not be one.
    let plain = !id.is_empty() && id.len() <= 128 && id.bytes().all(|b| b.is_ascii_alphanumeric());
    if !plain {
        return Err(ImageError::invalid_input(format!(
            "invalid asset id {id:?}"
        )));
    }
    let entries = fs::read_dir(assets_dir).map_err(|e| ImageError::io("read the assets", &e))?;
    let file = entries
        .flatten()
        .map(|entry| entry.path())
        .find(|path| path.file_stem() == Some(OsStr::new(id)) && path.is_file())
        .ok_or_else(|| {
            ImageError::new(
                ImageErrorKind::NotFound,
                format!("asset {id} is not in the workspace"),
            )
        })?;
    let raster = infer::get_from_path(&file)
        .ok()
        .flatten()
        .is_some_and(|found| found.matcher_type() == infer::MatcherType::Image);
    if raster {
        Ok(file)
    } else {
        Err(ImageError::invalid_input(format!(
            "asset {id} is not a raster image; only those can be edited"
        )))
    }
}

fn check_count(count: u32) -> Result<()> {
    if (1..=MAX_COUNT).contains(&count) {
        Ok(())
    } else {
        Err(ImageError::invalid_input(format!(
            "count must be between 1 and {MAX_COUNT}, not {count}"
        )))
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::sync::mpsc;

    use super::*;
    use crate::image_providers::{Aspect, mock::MockProvider};

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const DELAY: Duration = Duration::from_millis(1000);

    /// A storage with one open workspace, a service over the mock, and the events it delivers.
    struct Bench {
        _root: tempfile::TempDir,
        storage: Arc<Storage>,
        workspace: String,
        assets: PathBuf,
        service: Arc<ImageService>,
        sender: mpsc::UnboundedSender<ImageEvent>,
        events: mpsc::UnboundedReceiver<ImageEvent>,
    }

    fn bench(parallel: u32) -> std::result::Result<Bench, Box<dyn std::error::Error>> {
        let root = tempfile::tempdir()?;
        let storage = Arc::new(Storage::new(root.path().to_path_buf()));
        let workspace = storage.new_workspace()?;
        let mock = MockProvider::new(DELAY).with_parallel(parallel);
        let service = Arc::new(ImageService::new(
            Arc::new(Settings::open(root.path().join("settings.json"))),
            vec![Arc::new(mock)],
        ));
        let (sender, events) = mpsc::unbounded_channel();
        Ok(Bench {
            assets: storage.assets_dir(&workspace.id)?,
            workspace: workspace.id,
            storage,
            service,
            sender,
            events,
            _root: root,
        })
    }

    impl Bench {
        fn generate_job(prompt: &str, count: u32) -> GenerateJob {
            GenerateJob {
                prompt: prompt.into(),
                count,
                aspect: Aspect::Wide,
                provider: None,
            }
        }

        async fn generate(&self, job_id: &str, prompt: &str, count: u32) -> Result<JobResult> {
            let sender = self.sender.clone();
            self.service
                .generate(
                    &self.storage,
                    job_id,
                    &self.workspace,
                    Self::generate_job(prompt, count),
                    move |event| {
                        let _ = sender.send(event);
                    },
                )
                .await
        }

        /// The events delivered so far, as `started 0`, `stored 0`, `cancelled 1`, ...
        fn seen(&mut self) -> Vec<String> {
            let mut seen = Vec::new();
            while let Ok(event) = self.events.try_recv() {
                seen.push(match event {
                    ImageEvent::Started { index } => format!("started {index}"),
                    ImageEvent::Finished { index, outcome } => {
                        format!("{} {index}", status(&outcome))
                    }
                });
            }
            seen
        }

        fn stored_files(&self) -> std::io::Result<usize> {
            Ok(fs::read_dir(&self.assets)?.count())
        }
    }

    fn status(outcome: &ImageOutcome) -> String {
        match outcome {
            ImageOutcome::Stored { .. } => "stored".into(),
            ImageOutcome::Failed { error } => serde_json::to_value(error.kind)
                .ok()
                .and_then(|kind| kind.as_str().map(str::to_owned))
                .unwrap_or_default(),
        }
    }

    fn statuses(result: &JobResult) -> Vec<String> {
        result.images.iter().map(status).collect()
    }

    #[tokio::test(start_paused = true)]
    async fn a_job_runs_its_images_in_parallel_and_stores_each_as_an_asset() -> TestResult {
        let mut bench = bench(4)?;
        let began = Instant::now();
        let result = bench.generate("job-1", "a red barn", 4).await?;
        // Four images took the time of the slowest one, not of four.
        assert!(began.elapsed() < DELAY * 2, "{:?}", began.elapsed());

        assert_eq!(result.provider, "mock");
        assert_eq!(statuses(&result), ["stored"; 4]);
        let mut ids = Vec::new();
        for outcome in &result.images {
            let ImageOutcome::Stored { asset, duration_ms } = outcome else {
                return Err("not stored".into());
            };
            assert_eq!(asset.kind, assets::AssetKind::Image);
            assert_eq!((asset.width, asset.height), (Some(320.0), Some(180.0)));
            assert!(bench.assets.join(&asset.file).is_file());
            assert!(*duration_ms >= 1000, "{duration_ms}");
            ids.push(asset.id.clone());
        }
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 4, "four different pictures, four assets");

        // Every image started before any finished, and each got its own two events.
        let seen = bench.seen();
        assert_eq!(seen.len(), 8);
        assert!(seen[..4].iter().all(|event| event.starts_with("started")));
        for index in 0..4 {
            assert!(seen.contains(&format!("started {index}")));
            assert!(seen[4..].contains(&format!("stored {index}")));
        }
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn images_beyond_the_providers_limit_wait_their_turn() -> TestResult {
        let mut bench = bench(2)?;
        let began = Instant::now();
        let result = bench.generate("job-1", "a red barn", 4).await?;
        assert_eq!(statuses(&result), ["stored"; 4]);
        assert!(began.elapsed() >= DELAY * 2, "two rounds of two");
        // Never more than two between a `started` and its end.
        let mut running = 0_i32;
        for event in bench.seen() {
            running += if event.starts_with("started") { 1 } else { -1 };
            assert!((0..=2).contains(&running), "{running} at once");
        }
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn one_failed_image_does_not_fail_the_others() -> TestResult {
        let mut bench = bench(4)?;
        // `mock:flaky`: the third image the mock is asked for fails.
        let result = bench.generate("job-1", "a barn mock:flaky", 4).await?;
        assert_eq!(
            statuses(&result),
            ["stored", "stored", "generation_failed", "stored"]
        );
        assert_eq!(bench.stored_files()?, 3);
        assert!(bench.seen().contains(&"generation_failed 2".to_owned()));

        let all = bench.generate("job-2", "a barn mock:quota", 2).await?;
        assert_eq!(statuses(&all), ["quota", "quota"]);
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn cancelling_a_job_ends_its_unfinished_images() -> TestResult {
        let mut bench = bench(2)?;
        let job = {
            let service = Arc::clone(&bench.service);
            let storage = Arc::clone(&bench.storage);
            let workspace = bench.workspace.clone();
            let sender = bench.sender.clone();
            tokio::spawn(async move {
                service
                    .generate(
                        &storage,
                        "job-1",
                        &workspace,
                        Bench::generate_job("a red barn", 4),
                        move |event| {
                            let _ = sender.send(event);
                        },
                    )
                    .await
            })
        };
        // The first two are done, the other two have just started.
        tokio::time::sleep(DELAY * 3 / 2 + Duration::from_millis(400)).await;
        assert_eq!(
            bench.generate("job-1", "x", 1).await.err().map(|e| e.kind),
            Some(ImageErrorKind::InvalidInput),
            "the id is taken while the job runs"
        );
        bench.service.cancel("job-1");
        let result = job.await??;
        assert_eq!(
            statuses(&result),
            ["stored", "stored", "cancelled", "cancelled"]
        );
        assert_eq!(bench.stored_files()?, 2);
        let mut seen = bench.seen();
        assert_eq!(
            seen[..6],
            [
                "started 0",
                "started 1",
                "stored 0",
                "started 2",
                "stored 1",
                "started 3"
            ]
        );
        seen.drain(..6);
        seen.sort();
        assert_eq!(seen, ["cancelled 2", "cancelled 3"]);

        // Cancelled while waiting for a slot: the image never starts.
        let job = {
            let service = Arc::clone(&bench.service);
            let storage = Arc::clone(&bench.storage);
            let workspace = bench.workspace.clone();
            tokio::spawn(async move {
                let job = Bench::generate_job("mock:hang", 3);
                service
                    .generate(&storage, "job-2", &workspace, job, |_| {})
                    .await
            })
        };
        tokio::time::sleep(Duration::from_millis(100)).await;
        bench.service.cancel("job-2");
        assert_eq!(statuses(&job.await??), ["cancelled"; 3]);
        // The id is free again, and cancelling a job that is over does nothing.
        bench.service.cancel("job-2");
        assert_eq!(
            statuses(&bench.generate("job-2", "again", 1).await?),
            ["stored"]
        );
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn edit_makes_new_assets_from_one_of_the_workspace() -> TestResult {
        let bench = bench(4)?;
        let source = assets::import_bytes(&bench.assets, None, &assets::tiny_png(1200, 800))?;
        let edit = |asset_id: &str, mask: Option<&str>| EditJob {
            asset_id: asset_id.into(),
            instruction: "make it night".into(),
            mask_asset_id: mask.map(Into::into),
            count: 2,
            provider: None,
        };
        let run = |job_id: &'static str, job: EditJob| {
            bench
                .service
                .edit(&bench.storage, job_id, &bench.workspace, job, |_| {})
        };

        let result = run("edit-1", edit(&source.id, None)).await?;
        assert_eq!(statuses(&result), ["stored", "stored"]);
        let ImageOutcome::Stored { asset, .. } = &result.images[0] else {
            return Err("not stored".into());
        };
        // The mock keeps the shape of the source; the source itself stays.
        assert_eq!((asset.width, asset.height), (Some(320.0), Some(213.0)));
        assert_ne!(asset.id, source.id);
        assert!(bench.assets.join(&source.file).is_file());

        let kind = |result: Result<JobResult>| result.err().map(|e| e.kind);
        assert_eq!(
            kind(run("edit-2", edit(&"0".repeat(64), None)).await),
            Some(ImageErrorKind::NotFound)
        );
        assert_eq!(
            kind(run("edit-3", edit("../deck", None)).await),
            Some(ImageErrorKind::InvalidInput)
        );
        assert_eq!(
            kind(run("edit-4", edit(&source.id, Some(&"0".repeat(64)))).await),
            Some(ImageErrorKind::NotFound),
            "the mock takes masks, so a missing mask is what fails"
        );
        let svg = assets::import_bytes(&bench.assets, None, b"<svg width=\"1\" height=\"1\"/>")?;
        assert_eq!(
            kind(run("edit-5", edit(&svg.id, None)).await),
            Some(ImageErrorKind::InvalidInput)
        );
        Ok(())
    }

    /// A provider with the limits of the default one (ADR-004): edit redraws, no masks.
    struct Redrawing(MockProvider);

    #[async_trait::async_trait]
    impl ImageProvider for Redrawing {
        fn descriptor(&self) -> ProviderDescriptor {
            let mut descriptor = self.0.descriptor();
            descriptor.id = "redrawing".into();
            descriptor.name = "Redrawing".into();
            descriptor.capabilities.edit = EditSupport::Regenerate;
            descriptor.capabilities.mask = false;
            descriptor
        }

        async fn probe(&self) -> ProviderStatus {
            self.0.probe().await
        }

        async fn generate(
            &self,
            request: &GenerateRequest,
            cancel: Cancel,
        ) -> Result<GeneratedImage> {
            self.0.generate(request, cancel).await
        }

        async fn edit(&self, request: &EditRequest, cancel: Cancel) -> Result<GeneratedImage> {
            assert!(request.mask.is_none(), "the service never passes a mask");
            self.0.edit(request, cancel).await
        }
    }

    #[tokio::test(start_paused = true)]
    async fn a_mask_is_refused_by_a_provider_that_cannot_use_it() -> TestResult {
        let root = tempfile::tempdir()?;
        let storage = Arc::new(Storage::new(root.path().to_path_buf()));
        let workspace = storage.new_workspace()?.id;
        let assets_dir = storage.assets_dir(&workspace)?;
        let source = assets::import_bytes(&assets_dir, None, &assets::tiny_png(800, 800))?;
        let mask = assets::import_bytes(&assets_dir, None, &assets::tiny_png(800, 801))?;
        let service = ImageService::new(
            Arc::new(Settings::open(root.path().join("settings.json"))),
            vec![Arc::new(Redrawing(MockProvider::new(DELAY)))],
        );
        let edit = |mask: Option<String>| EditJob {
            asset_id: source.id.clone(),
            instruction: "replace the sky".into(),
            mask_asset_id: mask,
            count: 1,
            provider: None,
        };
        let masked = service
            .edit(&storage, "edit-1", &workspace, edit(Some(mask.id)), |_| {})
            .await;
        let Err(error) = masked else {
            return Err("a masked edit was accepted".into());
        };
        assert_eq!(error.kind, ImageErrorKind::Unsupported);
        assert!(
            error
                .message
                .starts_with("Redrawing cannot edit inside a mask"),
            "{}",
            error.message
        );
        // Without the mask it runs, as a redraw.
        let plain = service
            .edit(&storage, "edit-2", &workspace, edit(None), |_| {})
            .await?;
        assert_eq!(statuses(&plain), ["stored"]);
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn rejects_bad_jobs_before_anything_starts() -> TestResult {
        let mut bench = bench(4)?;
        let kind = |result: Result<JobResult>| result.err().map(|e| e.kind);
        assert_eq!(
            kind(bench.generate("job-1", "  ", 1).await),
            Some(ImageErrorKind::InvalidInput)
        );
        for count in [0, MAX_COUNT + 1] {
            assert_eq!(
                kind(bench.generate("job-1", "a barn", count).await),
                Some(ImageErrorKind::InvalidInput)
            );
        }
        for job_id in ["", "a b", "../x", &"j".repeat(MAX_JOB_ID + 1)] {
            assert_eq!(
                kind(bench.generate(job_id, "a barn", 1).await),
                Some(ImageErrorKind::InvalidInput),
                "{job_id:?}"
            );
        }
        let mut job = Bench::generate_job("a barn", 1);
        job.provider = Some("nope".into());
        let unknown =
            bench
                .service
                .generate(&bench.storage, "job-1", &bench.workspace, job, |_| {});
        assert_eq!(kind(unknown.await), Some(ImageErrorKind::UnknownProvider));
        let closed = bench.service.generate(
            &bench.storage,
            "job-1",
            "no-such-workspace",
            Bench::generate_job("a barn", 1),
            |_| {},
        );
        assert_eq!(kind(closed.await), Some(ImageErrorKind::UnknownWorkspace));
        assert!(bench.seen().is_empty());
        assert_eq!(bench.stored_files()?, 0);
        Ok(())
    }

    #[tokio::test(start_paused = true)]
    async fn a_workspace_closed_during_the_job_is_not_written_to() -> TestResult {
        let bench = bench(4)?;
        let job = {
            let service = Arc::clone(&bench.service);
            let storage = Arc::clone(&bench.storage);
            let workspace = bench.workspace.clone();
            tokio::spawn(async move {
                let job = Bench::generate_job("a red barn", 1);
                service
                    .generate(&storage, "job-1", &workspace, job, |_| {})
                    .await
            })
        };
        tokio::time::sleep(DELAY / 2).await;
        bench.storage.close(&bench.workspace)?;
        assert_eq!(statuses(&job.await??), ["unknown_workspace"]);
        assert!(!bench.assets.exists());
        Ok(())
    }

    #[test]
    fn the_default_provider_is_remembered() -> TestResult {
        let root = tempfile::tempdir()?;
        let file = root.path().join("data").join("settings.json");
        let service = |providers: Vec<Arc<dyn ImageProvider>>| {
            ImageService::new(Arc::new(Settings::open(file.clone())), providers)
        };
        let both = || -> Vec<Arc<dyn ImageProvider>> {
            vec![
                Arc::new(Redrawing(MockProvider::new(DELAY))),
                Arc::new(MockProvider::new(DELAY)),
            ]
        };

        let first = service(both());
        assert_eq!(
            first
                .descriptors()
                .iter()
                .map(|d| &d.id[..])
                .collect::<Vec<_>>(),
            ["redrawing", "mock"]
        );
        assert_eq!(
            first.default_provider()?,
            "redrawing",
            "the first, until chosen"
        );
        assert_eq!(
            first.set_default_provider("nope").err().map(|e| e.kind),
            Some(ImageErrorKind::UnknownProvider)
        );
        first.set_default_provider("mock")?;
        assert_eq!(first.default_provider()?, "mock");

        // The next run of the app reads the choice back.
        assert_eq!(service(both()).default_provider()?, "mock");
        // A choice that is no longer registered falls back to the first provider.
        let without = service(vec![Arc::new(Redrawing(MockProvider::new(DELAY)))]);
        assert_eq!(without.default_provider()?, "redrawing");
        assert_eq!(
            service(Vec::new()).default_provider().err().map(|e| e.kind),
            Some(ImageErrorKind::UnknownProvider)
        );
        // A damaged file is "no choice yet".
        fs::write(&file, b"{ not json")?;
        assert_eq!(service(both()).default_provider()?, "redrawing");
        Ok(())
    }

    #[test]
    fn the_choice_sits_in_the_settings_next_to_the_other_image_options() -> TestResult {
        let root = tempfile::tempdir()?;
        let settings = Arc::new(Settings::open(root.path().join("settings.json")));
        settings.write("images", json!({ "quality": "high" }))?;
        let providers: Vec<Arc<dyn ImageProvider>> = vec![
            Arc::new(Redrawing(MockProvider::new(DELAY))),
            Arc::new(MockProvider::new(DELAY)),
        ];
        let service = ImageService::new(Arc::clone(&settings), providers);

        // The choice an earlier version kept in a file of its own is taken over, once.
        let legacy = root.path().join("image-providers.json");
        fs::write(&legacy, br#"{ "defaultProvider": "mock" }"#)?;
        service.adopt_legacy_choice(&legacy);
        assert_eq!(service.default_provider()?, "mock");
        assert!(!legacy.exists());
        assert_eq!(
            settings.all().get("images"),
            Some(&json!({ "quality": "high", "defaultProvider": "mock" }))
        );

        // A choice made since is not replaced by an old file that turns up again.
        service.set_default_provider("redrawing")?;
        fs::write(&legacy, br#"{ "defaultProvider": "mock" }"#)?;
        service.adopt_legacy_choice(&legacy);
        assert_eq!(service.default_provider()?, "redrawing");
        // The webview writes the same section; the service reads what is there now.
        settings.write("images", json!({ "defaultProvider": "mock" }))?;
        assert_eq!(service.default_provider()?, "mock");
        Ok(())
    }
}
