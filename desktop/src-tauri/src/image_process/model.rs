//! The matting models the app can run, where it looks for their files, and running one.
//!
//! The app never fetches a model. A model is a file somebody put in one of three places, on
//! purpose: the installer (the bundle's resources), the user or a setup step (the app's data
//! folder), or a developer (a folder named by `SLIDR_MODELS_DIR`, debug builds only). The file
//! is recognised by its name; [`MODELS`] lists the names, each with what the model needs.
//!
//! Inference is `tract`, in this process and in Rust; nothing native is loaded.

use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tract_onnx::prelude::*;

use super::matte::Shape;
use crate::image_providers::{ImageError, ImageErrorKind, Result};

/// The folder of model files inside the bundle's resources and inside the app's data folder.
pub const MODELS_DIR: &str = "models";
/// Debug builds only: a folder to look in before the others.
pub const DEV_DIR_VARIABLE: &str = "SLIDR_MODELS_DIR";

/// The colour statistics of ImageNet, which the U²-Net family was trained with.
const IMAGENET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGENET_STD: [f32; 3] = [0.229, 0.224, 0.225];

/// A model the app knows how to run.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ModelSpec {
    /// Stable id: what a result names as its model.
    pub id: &'static str,
    /// Display name.
    pub name: &'static str,
    /// The file's name in a models folder.
    pub file: &'static str,
    /// The licence its authors published the weights' repository under (SPDX id).
    pub license: &'static str,
    /// The size of the published file.
    pub bytes: u64,
    pub shape: Shape,
}

/// The models, the default first: with several installed in one place, the first found is used.
///
/// All three are the ONNX files of the `rembg` project (MIT), converted from weights their
/// authors published in repositories under Apache-2.0. ADR-057 has the comparison
/// behind the order: U²-Net is whole where IS-Net makes holes (an illustration on white), is
/// three times as fast and takes half the memory; IS-Net is the finer of the two on hair and fur.
pub const MODELS: [ModelSpec; 3] = [
    ModelSpec {
        id: "u2net",
        name: "U²-Net",
        file: "u2net.onnx",
        license: "Apache-2.0",
        bytes: 175_997_641,
        shape: U2NET,
    },
    ModelSpec {
        id: "isnet-general-use",
        name: "IS-Net (general use)",
        file: "isnet-general-use.onnx",
        license: "Apache-2.0",
        bytes: 178_648_008,
        shape: Shape {
            side: 1024,
            mean: [0.5; 3],
            std: [1.0; 3],
            by_max: true,
            stretch: true,
        },
    },
    ModelSpec {
        id: "u2netp",
        name: "U²-Net (small)",
        file: "u2netp.onnx",
        license: "Apache-2.0",
        bytes: 4_574_861,
        shape: U2NET,
    },
];

const U2NET: Shape = Shape {
    side: 320,
    mean: IMAGENET_MEAN,
    std: IMAGENET_STD,
    by_max: true,
    stretch: true,
};

/// Where a model file was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Place {
    /// The folder `SLIDR_MODELS_DIR` names (debug builds).
    Dev,
    /// `models` in the app's data folder.
    AppData,
    /// `models` in the bundle's resources: it came with the installer.
    Bundle,
}

/// The folders a model may be in, in the order they are searched.
#[derive(Debug, Clone)]
pub struct Places {
    folders: Vec<(Place, PathBuf)>,
    install: PathBuf,
}

/// A model file that is there.
#[derive(Debug, Clone, PartialEq)]
pub struct Found {
    pub spec: &'static ModelSpec,
    pub path: PathBuf,
    pub place: Place,
}

impl Places {
    /// The places of an app whose data folder is `app_data` and whose bundle's resources are in
    /// `resources`. `dev` is the developer's folder, which comes first.
    ///
    /// A nearer place wins over the order of the models: a file the user installed replaces the
    /// one the installer brought, whichever the two are.
    pub fn new(app_data: &Path, resources: Option<&Path>, dev: Option<PathBuf>) -> Self {
        let install = app_data.join(MODELS_DIR);
        let mut folders = Vec::new();
        if let Some(dev) = dev {
            folders.push((Place::Dev, dev));
        }
        folders.push((Place::AppData, install.clone()));
        if let Some(resources) = resources {
            folders.push((Place::Bundle, resources.join(MODELS_DIR)));
        }
        Self { folders, install }
    }

    /// The developer's folder: read from the environment in a debug build, never in a release.
    pub fn dev_dir() -> Option<PathBuf> {
        Self::dev_dir_of(std::env::var_os(DEV_DIR_VARIABLE), cfg!(debug_assertions))
    }

    /// The developer's folder, given the variable's value and the kind of build.
    fn dev_dir_of(value: Option<OsString>, debug_build: bool) -> Option<PathBuf> {
        value
            .filter(|value| debug_build && !value.is_empty())
            .map(PathBuf::from)
    }

    /// The first model file there is.
    pub fn find(&self) -> Option<Found> {
        let files: Vec<&str> = MODELS.iter().map(|spec| spec.file).collect();
        let (index, path, place) = self.find_file(&files)?;
        Some(Found {
            spec: &MODELS[index],
            path,
            place,
        })
    }

    /// The first of `files` there is, as its place in the list, its path and where it was
    /// found: in the nearest place that holds any of them, and there the first of the list.
    /// The matting models and the upscaling models (`upscale.rs`) are both found this way.
    pub fn find_file(&self, files: &[&str]) -> Option<(usize, PathBuf, Place)> {
        self.folders.iter().find_map(|(place, folder)| {
            files.iter().enumerate().find_map(|(index, file)| {
                let path = folder.join(file);
                path.is_file().then_some((index, path, *place))
            })
        })
    }

    /// Where a model file goes when it is installed after the app: the data folder's `models`.
    pub fn install_dir(&self) -> &Path {
        &self.install
    }
}

/// How many threads a run uses: half the logical processors, eight at most. More gains nothing
/// (measured for ADR-057), and the app stays responsive.
pub(super) fn threads() -> usize {
    let logical = std::thread::available_parallelism().map_or(2, usize::from);
    (logical / 2).clamp(1, 8)
}

/// Runs the model in `file` on `tensor` (the picture as [`super::matte::input`] made it) and
/// returns its first output. Blocking, for seconds. The model is loaded for the run and
/// dropped after it: nothing of it stays in memory.
pub fn run(file: &Path, spec: &ModelSpec, tensor: &[f32]) -> Result<Vec<f32>> {
    let side = spec.shape.side as usize;
    let unusable = |error: TractError| {
        ImageError::new(
            ImageErrorKind::NotInstalled,
            format!(
                "the model file {} could not be loaded ({error:#}); install it again",
                file.display()
            ),
        )
    };
    let failed = |error: TractError| {
        ImageError::new(
            ImageErrorKind::GenerationFailed,
            format!("the model {} failed on this picture: {error:#}", spec.id),
        )
    };
    let plan = tract_onnx::onnx()
        .model_for_path(file)
        .and_then(|model| model.with_input_fact(0, f32::fact([1, 3, side, side]).into()))
        .and_then(InferenceModel::into_optimized)
        .and_then(TypedModel::into_runnable)
        .map_err(unusable)?;
    let input = Tensor::from_shape(&[1, 3, side, side], tensor).map_err(failed)?;
    let pool = multithread::Executor::multithread_with_name(threads(), "slidr-matte");
    let outputs = multithread::multithread_tract_scope(pool, || plan.run(tvec!(input.into())))
        .map_err(failed)?;
    let first = outputs
        .first()
        .ok_or_else(|| ImageError::internal("the model returned nothing"))?;
    let values = first.to_plain_array_view::<f32>().map_err(failed)?;
    Ok(values.iter().copied().collect())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    #[test]
    fn the_models_have_ids_and_files_of_their_own() {
        for (i, spec) in MODELS.iter().enumerate() {
            assert_eq!(spec.file, format!("{}.onnx", spec.id));
            assert!(spec.shape.side.is_multiple_of(32), "{}", spec.id);
            assert!(MODELS[..i].iter().all(|other| other.id != spec.id));
        }
    }

    #[test]
    fn a_model_is_found_in_the_nearest_place_that_has_one() -> TestResult {
        let root = tempfile::tempdir()?;
        let (data, resources, dev) = (
            root.path().join("data"),
            root.path().join("resources"),
            root.path().join("dev"),
        );
        let places = Places::new(&data, Some(&resources), Some(dev.clone()));
        assert_eq!(places.install_dir(), data.join("models"));
        assert_eq!(places.find(), None, "no folder exists yet");

        let put = |folder: &Path, file: &str| -> std::io::Result<PathBuf> {
            fs::create_dir_all(folder)?;
            let path = folder.join(file);
            fs::write(&path, b"onnx")?;
            Ok(path)
        };
        // Other files in a models folder are not models.
        put(&resources.join("models"), "readme.txt")?;
        fs::create_dir_all(data.join("models").join("u2net.onnx"))?;
        assert_eq!(places.find(), None, "a folder of that name is not a file");

        // The installer brought the small model.
        let bundled = put(&resources.join("models"), "u2netp.onnx")?;
        let found = places.find().ok_or("not found")?;
        assert_eq!(
            (found.spec.id, found.place, found.path),
            ("u2netp", Place::Bundle, bundled)
        );
        // The user installed another: the data folder is nearer than the installer's.
        fs::remove_dir(data.join("models").join("u2net.onnx"))?;
        let chosen = put(&data.join("models"), "isnet-general-use.onnx")?;
        let found = places.find().ok_or("not found")?;
        assert_eq!(
            (found.spec.id, found.place, found.path),
            ("isnet-general-use", Place::AppData, chosen)
        );
        // With two in one folder, the one that is first in the list is used.
        let default = put(&data.join("models"), "u2net.onnx")?;
        let found = places.find().ok_or("not found")?;
        assert_eq!(
            (found.spec.id, found.place, found.path),
            ("u2net", Place::AppData, default)
        );
        // A developer's folder comes before both, even with a lesser model.
        let own = put(&dev, "u2netp.onnx")?;
        let found = places.find().ok_or("not found")?;
        assert_eq!(
            (found.spec.id, found.place, found.path),
            ("u2netp", Place::Dev, own)
        );

        // An app without a bundle and without a developer looks in its data folder only.
        let plain = Places::new(&data, None, None);
        assert_eq!(plain.find().map(|f| f.place), Some(Place::AppData));
        Ok(())
    }

    #[test]
    fn the_developers_folder_is_read_in_a_debug_build_only() {
        let named = || Some(OsString::from("D:/models"));
        assert_eq!(
            Places::dev_dir_of(named(), true),
            Some(PathBuf::from("D:/models"))
        );
        assert_eq!(Places::dev_dir_of(named(), false), None, "a release build");
        assert_eq!(Places::dev_dir_of(Some(OsString::new()), true), None);
        assert_eq!(Places::dev_dir_of(None, true), None);
    }

    #[test]
    fn a_file_that_is_not_a_model_is_reported_as_not_installed() -> TestResult {
        let root = tempfile::tempdir()?;
        let file = root.path().join("u2netp.onnx");
        fs::write(&file, b"this is not a model")?;
        let spec = &MODELS[2];
        let side = spec.shape.side as usize;
        let Err(error) = run(&file, spec, &vec![0.0; 3 * side * side]) else {
            return Err("a text file ran as a model".into());
        };
        assert_eq!(error.kind, ImageErrorKind::NotInstalled);
        assert!(error.message.contains("u2netp.onnx"), "{}", error.message);
        assert!(
            error.message.ends_with("install it again"),
            "{}",
            error.message
        );
        Ok(())
    }

    #[test]
    fn places_serialize_as_the_contract_names_them() -> TestResult {
        assert_eq!(
            serde_json::to_value([Place::Dev, Place::AppData, Place::Bundle])?,
            serde_json::json!(["dev", "app_data", "bundle"])
        );
        Ok(())
    }
}
