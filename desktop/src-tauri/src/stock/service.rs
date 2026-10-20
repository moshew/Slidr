//! Searching the sources, remembering what was found, and taking a photo into a workspace.

use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use serde::Deserialize;

use super::{
    Attribution, Found, ImportedPhoto, Result, SourceState, SourceStatus, StockError,
    StockErrorKind, StockProvider, StockQuery, StockResults,
};
use crate::{assets, settings::Settings, storage::Storage};

/// Longest query, in characters.
const MAX_QUERY: usize = 200;
/// Most photos in one page; the smallest of the libraries' own limits.
const MAX_PER_PAGE: u32 = 30;
const MAX_PAGE: u32 = 1000;
/// How many found photos are remembered: a few searches' worth of pages.
const MAX_RECENT: usize = 600;
/// The section of the app's settings this service reads.
const SECTION: &str = "stock";

/// Owns the sources and what they found lately. Shared by the IPC commands; testable without
/// Tauri.
pub struct StockService {
    sources: Vec<Arc<dyn StockProvider>>,
    settings: Arc<Settings>,
    recent: Mutex<Recent>,
}

/// The `stock` section of the settings, as far as this service reads it.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Choice {
    /// The source a search uses when it names none.
    source: Option<String>,
}

/// The photos of the latest searches, by source and id: what a thumbnail or an import refers
/// to. The oldest are forgotten first.
#[derive(Default)]
struct Recent {
    order: VecDeque<(String, String)>,
    found: HashMap<(String, String), Found>,
}

impl Recent {
    fn remember(&mut self, found: &Found) {
        let key = (found.photo.source.clone(), found.photo.id.clone());
        if self.found.insert(key.clone(), found.clone()).is_none() {
            self.order.push_back(key);
        }
        while self.order.len() > MAX_RECENT {
            if let Some(oldest) = self.order.pop_front() {
                self.found.remove(&oldest);
            }
        }
    }
}

impl StockService {
    /// A service over `sources`.
    pub fn new(settings: Arc<Settings>, sources: Vec<Arc<dyn StockProvider>>) -> Self {
        Self {
            sources,
            settings,
            recent: Mutex::new(Recent::default()),
        }
    }

    /// The sources, in registration order, each with whether it can be searched now.
    pub fn sources(&self) -> Vec<SourceStatus> {
        self.sources
            .iter()
            .map(|source| SourceStatus {
                descriptor: source.descriptor(),
                state: source.state(),
            })
            .collect()
    }

    /// The source a search uses when it names none: the user's choice while it is registered;
    /// otherwise the first source that is ready, and failing that the first.
    pub fn default_source(&self) -> Result<String> {
        Ok(self.source(None)?.descriptor().id)
    }

    /// One page of photos. What it finds is remembered, so the webview can name a photo by id.
    pub async fn search(
        &self,
        source: Option<&str>,
        mut query: StockQuery,
    ) -> Result<StockResults> {
        query.query = query.query.trim().to_owned();
        if query.query.is_empty() {
            return Err(StockError::invalid_input("the query is empty"));
        }
        if query.query.chars().count() > MAX_QUERY {
            return Err(StockError::invalid_input(format!(
                "the query is longer than {MAX_QUERY} characters"
            )));
        }
        if !(1..=MAX_PER_PAGE).contains(&query.per_page) || !(1..=MAX_PAGE).contains(&query.page) {
            return Err(StockError::invalid_input(format!(
                "perPage must be between 1 and {MAX_PER_PAGE}, and page between 1 and {MAX_PAGE}"
            )));
        }
        let source = self.source(source)?;
        let page = source.search(&query).await?;
        let mut recent = lock(&self.recent);
        for found in &page.found {
            recent.remember(found);
        }
        Ok(StockResults {
            source: source.descriptor().id,
            photos: page.found.into_iter().map(|found| found.photo).collect(),
            total: page.total,
            page: query.page,
            has_more: page.has_more,
        })
    }

    /// A small picture of a photo a search found.
    pub async fn thumbnail(&self, source: &str, id: &str) -> Result<Vec<u8>> {
        let (source, found) = self.found(source, id)?;
        source.thumbnail(&found).await
    }

    /// Takes a photo a search found into the workspace's assets, at slide size, and tells its
    /// library that it was taken.
    pub async fn import(
        &self,
        storage: &Arc<Storage>,
        workspace_id: &str,
        source: &str,
        id: &str,
    ) -> Result<ImportedPhoto> {
        let (source, found) = self.found(source, id)?;
        // Before the download: a closed workspace should not cost a request.
        storage.assets_dir(workspace_id)?;
        let bytes = source.image(&found).await?;
        let descriptor = source.descriptor();
        let name = format!("{}-{}", descriptor.id, found.photo.id);
        let asset = tokio::task::spawn_blocking({
            let (storage, workspace_id) = (Arc::clone(storage), workspace_id.to_owned());
            move || {
                // Looked up now: a workspace closed since must not be written.
                let dir = storage.assets_dir(&workspace_id)?;
                assets::import_bytes(&dir, Some(name), &bytes)
            }
        })
        .await
        .map_err(StockError::internal)??;
        // The photo is in the deck whether or not the library hears of it: a failed report
        // must not undo what the user did.
        let _ = source.taken(&found).await;
        Ok(ImportedPhoto {
            asset,
            attribution: Attribution {
                author: found.photo.author.clone(),
                url: found.credit_url.clone(),
                license: descriptor.license,
            },
            description: found.photo.description.clone(),
        })
    }

    /// The source `id` names, or the default one.
    fn source(&self, id: Option<&str>) -> Result<&Arc<dyn StockProvider>> {
        let find = |id: &str| self.sources.iter().find(|s| s.descriptor().id == id);
        let found = match id {
            Some(id) => find(id),
            None => self
                .settings
                .read::<Choice>(SECTION)
                .source
                .as_deref()
                .and_then(find)
                .or_else(|| {
                    self.sources
                        .iter()
                        .find(|source| source.state() == SourceState::Ready)
                })
                .or_else(|| self.sources.first()),
        };
        found.ok_or_else(|| {
            StockError::new(
                StockErrorKind::UnknownSource,
                match id {
                    Some(id) => format!("unknown photo source: {id}"),
                    None => "no photo source is registered".into(),
                },
            )
        })
    }

    /// A photo of the recent searches, with its source.
    fn found(&self, source: &str, id: &str) -> Result<(Arc<dyn StockProvider>, Found)> {
        let provider = Arc::clone(self.source(Some(source))?);
        let found = lock(&self.recent)
            .found
            .get(&(source.to_owned(), id.to_owned()))
            .cloned()
            .ok_or_else(|| {
                StockError::new(
                    StockErrorKind::NotFound,
                    "the photo is not among the recent search results; search again",
                )
            })?;
        Ok((provider, found))
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use async_trait::async_trait;
    use serde_json::json;

    use super::*;
    use crate::stock::{Page, SourceDescriptor, StockPhoto, mock::MockStock};

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    /// The mock under another id, without a key, counting the photos reported as taken.
    struct Keyless {
        inner: MockStock,
        taken: Mutex<Vec<String>>,
        ready: bool,
    }

    impl Keyless {
        fn new(ready: bool) -> Self {
            Self {
                inner: MockStock::new(Duration::ZERO),
                taken: Mutex::new(Vec::new()),
                ready,
            }
        }
    }

    #[async_trait]
    impl StockProvider for Keyless {
        fn descriptor(&self) -> SourceDescriptor {
            SourceDescriptor {
                id: "library".into(),
                name: "Library".into(),
                home_url: "https://example.com/library".into(),
                license: "Library License".into(),
                key: None,
            }
        }

        fn state(&self) -> SourceState {
            if self.ready {
                SourceState::Ready
            } else {
                SourceState::NoKey
            }
        }

        async fn search(&self, query: &StockQuery) -> Result<Page> {
            let mut page = self.inner.search(query).await?;
            for found in &mut page.found {
                found.photo.source = "library".into();
                found.credit_url = found.photo.author_url.clone();
            }
            Ok(page)
        }

        async fn thumbnail(&self, found: &Found) -> Result<Vec<u8>> {
            self.inner.thumbnail(found).await
        }

        async fn image(&self, found: &Found) -> Result<Vec<u8>> {
            self.inner.image(found).await
        }

        async fn taken(&self, found: &Found) -> Result<()> {
            lock(&self.taken).push(found.photo.id.clone());
            // A report that fails must not fail the import.
            Err(StockError::new(StockErrorKind::Network, "offline"))
        }
    }

    struct Bench {
        root: tempfile::TempDir,
        settings: Arc<Settings>,
        storage: Arc<Storage>,
        workspace: String,
    }

    fn bench() -> std::result::Result<Bench, Box<dyn std::error::Error>> {
        let root = tempfile::tempdir()?;
        let storage = Arc::new(Storage::new(root.path().to_path_buf()));
        let workspace = storage.new_workspace()?.id;
        Ok(Bench {
            settings: Arc::new(Settings::open(root.path().join("settings.json"))),
            storage,
            workspace,
            root,
        })
    }

    fn query(text: &str) -> StockQuery {
        StockQuery {
            query: text.into(),
            page: 1,
            per_page: 6,
            orientation: None,
        }
    }

    #[tokio::test]
    async fn a_search_names_photos_by_id_and_keeps_their_addresses_in_rust() -> TestResult {
        let bench = bench()?;
        let service = StockService::new(
            Arc::clone(&bench.settings),
            vec![Arc::new(MockStock::new(Duration::ZERO))],
        );
        let results = service.search(None, query("  wheat field ")).await?;
        assert_eq!(results.source, "mock");
        assert_eq!(
            (results.total, results.page, results.has_more),
            (57, 1, true)
        );
        assert_eq!(results.photos.len(), 6);

        // What crosses to the webview: the photo and its credit, no address of a picture.
        let sent = serde_json::to_value(&results)?;
        let first = &sent["photos"][0];
        let mut keys: Vec<_> = first
            .as_object()
            .ok_or("not an object")?
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "author",
                "authorUrl",
                "color",
                "description",
                "height",
                "id",
                "pageUrl",
                "source",
                "width"
            ]
        );
        assert_eq!(first["description"], "wheat field, photo 1");

        let id = results.photos[0].id.clone();
        let thumbnail = service.thumbnail("mock", &id).await?;
        assert!(infer::is_image(&thumbnail));
        let missing = service.thumbnail("mock", "nope").await.err();
        assert_eq!(missing.map(|e| e.kind), Some(StockErrorKind::NotFound));
        let unknown = service.thumbnail("nowhere", &id).await.err();
        assert_eq!(unknown.map(|e| e.kind), Some(StockErrorKind::UnknownSource));
        Ok(())
    }

    #[tokio::test]
    async fn a_malformed_search_is_rejected_before_any_source_is_asked() -> TestResult {
        let bench = bench()?;
        let service = StockService::new(
            Arc::clone(&bench.settings),
            vec![Arc::new(MockStock::new(Duration::ZERO))],
        );
        let long = "x".repeat(MAX_QUERY + 1);
        for (text, page, per_page) in [
            ("", 1, 6),
            ("   ", 1, 6),
            (&long[..], 1, 6),
            ("a", 0, 6),
            ("a", 1, 31),
            ("a", 1, 0),
        ] {
            let bad = StockQuery {
                query: text.into(),
                page,
                per_page,
                orientation: None,
            };
            let error = service.search(None, bad).await.err();
            assert_eq!(
                error.map(|e| e.kind),
                Some(StockErrorKind::InvalidInput),
                "{page} {per_page}"
            );
        }
        let none = StockService::new(Arc::clone(&bench.settings), Vec::new());
        let error = none.search(None, query("a")).await.err();
        assert_eq!(error.map(|e| e.kind), Some(StockErrorKind::UnknownSource));
        Ok(())
    }

    #[tokio::test]
    async fn a_photo_taken_becomes_an_asset_with_its_credit() -> TestResult {
        let bench = bench()?;
        let library = Arc::new(Keyless::new(true));
        let service = StockService::new(
            Arc::clone(&bench.settings),
            vec![Arc::clone(&library) as Arc<dyn StockProvider>],
        );
        let results = service.search(None, query("harbour")).await?;
        let photo: &StockPhoto = &results.photos[0];

        let taken = service
            .import(&bench.storage, &bench.workspace, "library", &photo.id)
            .await?;
        let assets = bench.storage.assets_dir(&bench.workspace)?;
        assert!(assets.join(&taken.asset.file).is_file());
        assert_eq!(taken.asset.mime, "image/png");
        assert_eq!(
            taken.attribution,
            Attribution {
                author: photo.author.clone(),
                // Where this library's terms point the credit.
                url: photo.author_url.clone(),
                license: "Library License".into(),
            }
        );
        assert_eq!(taken.description.as_deref(), Some("harbour, photo 1"));
        // The library was told, and its failing to hear did not fail the import.
        assert_eq!(
            lock(&library.taken).as_slice(),
            std::slice::from_ref(&photo.id)
        );

        // The shape the webview receives.
        let sent = serde_json::to_value(&taken)?;
        assert_eq!(
            sent["attribution"],
            json!({ "author": photo.author, "url": photo.author_url, "license": "Library License" })
        );
        assert_eq!(sent["asset"]["kind"], "image");

        // A workspace that is not open is refused before anything is fetched.
        let closed = service
            .import(&bench.storage, "no-such-workspace", "library", &photo.id)
            .await
            .err();
        assert_eq!(
            closed.map(|e| e.kind),
            Some(StockErrorKind::UnknownWorkspace)
        );
        let _ = &bench.root;
        Ok(())
    }

    #[tokio::test]
    async fn the_default_source_is_the_choice_then_the_first_that_is_ready() -> TestResult {
        let bench = bench()?;
        let sources = |ready: bool| -> Vec<Arc<dyn StockProvider>> {
            vec![
                Arc::new(Keyless::new(ready)),
                Arc::new(MockStock::new(Duration::ZERO)),
            ]
        };
        // The first source has no key: the next ready one is used.
        let service = StockService::new(Arc::clone(&bench.settings), sources(false));
        assert_eq!(service.default_source()?, "mock");
        let states: Vec<_> = service.sources().into_iter().map(|s| s.state).collect();
        assert_eq!(states, [SourceState::NoKey, SourceState::Ready]);
        // With a key, the first.
        let service = StockService::new(Arc::clone(&bench.settings), sources(true));
        assert_eq!(service.default_source()?, "library");
        // The user's choice wins while it is registered.
        bench.settings.write("stock", json!({ "source": "mock" }))?;
        assert_eq!(service.default_source()?, "mock");
        bench.settings.write("stock", json!({ "source": "gone" }))?;
        assert_eq!(service.default_source()?, "library");
        // A status as the webview lists it: the descriptor's fields and the state, flat.
        let listed = serde_json::to_value(service.sources())?;
        assert_eq!(
            listed[0],
            json!({
                "id": "library",
                "name": "Library",
                "homeUrl": "https://example.com/library",
                "license": "Library License",
                "state": "ready"
            })
        );
        Ok(())
    }

    #[tokio::test]
    async fn only_the_latest_photos_are_remembered() -> TestResult {
        let bench = bench()?;
        let service = StockService::new(
            Arc::clone(&bench.settings),
            vec![Arc::new(MockStock::new(Duration::ZERO))],
        );
        let first = service.search(None, query("first")).await?.photos[0]
            .id
            .clone();
        for n in 0..=(MAX_RECENT / 6) {
            service.search(None, query(&format!("query {n}"))).await?;
        }
        let forgotten = service.thumbnail("mock", &first).await.err();
        assert_eq!(forgotten.map(|e| e.kind), Some(StockErrorKind::NotFound));
        assert!(lock(&service.recent).found.len() <= MAX_RECENT);
        Ok(())
    }
}
