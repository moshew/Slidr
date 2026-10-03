//! The `openai-api` provider (GEN-03, ADR-051): the OpenAI Images API, called with the user's
//! own key. Faster than a CLI, paid per image, and the one provider whose edit is `exact`.
//!
//! ```text
//! generate:  POST /images/generations  { model, prompt, n: 1, size, quality }   JSON
//! edit:      POST /images/edits        model, prompt, image, mask, size, …     multipart
//! probe:     GET  /models/<model>                                               no image, no cost
//! ```
//!
//! - The key comes from the credential store on every call, so a key entered in the settings
//!   works at once and one that was removed stops working at once. It goes into the
//!   `Authorization` header and nowhere else.
//! - What the service says when it refuses is passed on only after the key is taken out of it
//!   ([`OpenAiApi::clean`]): its "incorrect key" message quotes part of the key, and an error
//!   message here can reach the agent.
//! - An edit is laid back over the source ([`exact_edit`]), so pixels outside the mask are the
//!   source's own, and the result has the source's size.
//! - A cancelled or timed-out call drops the connection. The service may still finish the
//!   image and charge for it; there is no call that takes a request back.
//! - The model takes any size whose sides are multiples of 16, so a picture is asked for in
//!   the shape the job names, and an edit in the shape of its source.
//!
//! The answers in `openai_api/` follow the service's documentation as read on 2026-10-04. Only
//! the rejected key is a recording (it takes no account to get one); there was no key to record
//! the rest with (ADR-051, "מה לא נבדק").

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use base64::Engine as _;
use reqwest::{RequestBuilder, StatusCode, multipart};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    image_providers::{
        Aspect, Cancel, Capabilities, EditRequest, EditSupport, GenerateRequest, GeneratedImage,
        ImageError, ImageErrorKind, ImageProvider, ProviderDescriptor, ProviderState,
        ProviderStatus, Result, exact_edit,
    },
    net,
    secrets::{Secret, SecretName, Secrets},
    settings::Settings,
};

const ID: &str = "openai-api";
const NAME: &str = "OpenAI API";
const BASE: &str = "https://api.openai.com/v1";
/// A development build can be pointed at a stand-in on this machine (see [`net::base_url`]).
const BASE_VARIABLE: &str = "SLIDR_OPENAI_BASE_URL";
/// The model asked for, unless the settings name another (`images.openaiModel`): the one the
/// product spec names (SPEC 11.9). The service's first image model is shut down this month.
const MODEL: &str = "gpt-image-2";
/// What the model accepts: sides in multiples of 16, at least 655,360 pixels, proportions up
/// to three to one. The service goes up to 3840x2160; past 2560x1440 it calls the size
/// experimental, so an edit of a larger picture is scaled to that.
const SIZES: exact_edit::Sizes = exact_edit::Sizes::Free {
    step: 16,
    min_pixels: 655_360,
    max_pixels: 2560 * 1440,
    max_ratio: 3.0,
};
/// The quality asked for until the settings say otherwise: a few cents an image.
const QUALITY: &str = "medium";
/// Longest prompt sent, in characters; the service's own limit is 32,000.
const MAX_PROMPT: usize = 8000;
/// A high-quality image takes up to two minutes; past this the call is given up.
const TIMEOUT: Duration = Duration::from_secs(240);
const PROBE_TIMEOUT: Duration = Duration::from_secs(20);

/// The OpenAI Images API.
pub struct OpenAiApi {
    secrets: Arc<Secrets>,
    settings: Arc<Settings>,
    base: String,
}

/// The part of the `images` settings section this provider reads.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Options {
    /// `low`, `medium`, `high` or `auto`: what an image costs and how long it takes.
    quality: Option<String>,
    /// Another model id, for when the service renames or replaces its image model.
    openai_model: Option<String>,
}

impl Options {
    fn model(&self) -> &str {
        self.openai_model
            .as_deref()
            .map(str::trim)
            .filter(|model| is_token(model))
            .unwrap_or(MODEL)
    }

    fn quality(&self) -> &str {
        match self.quality.as_deref() {
            Some(quality @ ("low" | "medium" | "high" | "auto")) => quality,
            _ => QUALITY,
        }
    }

    /// Only the service's first generation of image models takes the parameter; the later
    /// ones read every input at full fidelity and reject it.
    fn takes_input_fidelity(&self) -> bool {
        self.model().starts_with("gpt-image-1")
    }
}

/// A model id is a plain token; anything else in the settings is ignored.
fn is_token(text: &str) -> bool {
    !text.is_empty()
        && text.len() <= 64
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

impl OpenAiApi {
    /// The provider, with the key and the options it reads on every call.
    pub fn new(secrets: Arc<Secrets>, settings: Arc<Settings>) -> Self {
        Self::at(net::base_url(BASE, BASE_VARIABLE), secrets, settings)
    }

    /// The provider against another base URL: a stand-in server.
    pub fn at(base: impl Into<String>, secrets: Arc<Secrets>, settings: Arc<Settings>) -> Self {
        Self {
            secrets,
            settings,
            base: base.into(),
        }
    }

    fn options(&self) -> Options {
        self.settings.read("images")
    }

    /// The user's key, or what to do about there being none.
    fn key(&self) -> Result<Secret> {
        let key = self
            .secrets
            .get(SecretName::OpenaiApi)
            .map_err(|e| ImageError::new(ImageErrorKind::NotLoggedIn, e.message))?;
        key.ok_or_else(|| {
            ImageError::new(
                ImageErrorKind::NotLoggedIn,
                "No OpenAI API key is stored. The user can enter one in Settings, or choose \
                 another image provider there.",
            )
        })
    }

    /// A request to `path` of the service, with the key. Refused before anything is sent when
    /// the base URL is not one a key may go to.
    fn request(&self, method: reqwest::Method, path: &str, key: &Secret) -> Result<RequestBuilder> {
        let url = reqwest::Url::parse(&format!("{}/{path}", self.base))
            .ok()
            .filter(net::allowed)
            .ok_or_else(|| ImageError::internal("the image service's address is not allowed"))?;
        Ok(net::client().request(method, url).bearer_auth(key.expose()))
    }

    /// Sends a request and returns the status and the body, unless the job is cancelled first.
    async fn answer(
        &self,
        request: RequestBuilder,
        timeout: Duration,
        mut cancel: Cancel,
    ) -> Result<(StatusCode, Vec<u8>)> {
        let call = async {
            let response = request.timeout(timeout).send().await?;
            let status = response.status();
            Ok::<_, reqwest::Error>((status, response.bytes().await?.to_vec()))
        };
        tokio::select! {
            () = cancel.cancelled() => Err(ImageError::cancelled()),
            answer = call => answer.map_err(|error| {
                let kind = if error.is_timeout() {
                    ImageErrorKind::Timeout
                } else {
                    ImageErrorKind::GenerationFailed
                };
                ImageError::new(kind, format!("{NAME}: {}", net::failure(&error)))
            }),
        }
    }

    /// The image in a successful answer, or the failure the answer describes.
    fn image(&self, status: StatusCode, body: &[u8]) -> Result<Vec<u8>> {
        if !status.is_success() {
            return Err(self.failure(status, body));
        }
        let none = |what: &str| {
            ImageError::new(
                ImageErrorKind::GenerationFailed,
                format!("{NAME} answered without an image ({what})"),
            )
        };
        let answer: Value = serde_json::from_slice(body).map_err(|_| none("not JSON"))?;
        let encoded = answer["data"][0]["b64_json"]
            .as_str()
            .ok_or_else(|| none("no image data"))?;
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| none("unreadable image data"))
    }

    /// What a refusal means for the user, by status and by the service's error code.
    fn failure(&self, status: StatusCode, body: &[u8]) -> ImageError {
        let answer: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
        let error = &answer["error"];
        let code = error["code"].as_str().unwrap_or_default();
        let kind = error["type"].as_str().unwrap_or_default();
        let said = self.clean(error["message"].as_str().unwrap_or_default());
        let said = if said.is_empty() {
            String::new()
        } else {
            format!(": {said}")
        };
        // The codes the service documents for billing, and the two older ones.
        let out_of_credit = matches!(
            code,
            "credit_balance_exhausted"
                | "organization_spend_limit_exceeded"
                | "project_spend_limit_exceeded"
                | "organization_usage_limit_exceeded"
                | "insufficient_quota"
                | "billing_hard_limit_reached"
        ) || kind == "insufficient_quota";
        match status.as_u16() {
            // The service's own text quotes the key; say it in our words.
            401 => ImageError::new(
                ImageErrorKind::NotLoggedIn,
                "OpenAI rejected the API key. The user can enter a valid key in Settings.",
            ),
            _ if out_of_credit => ImageError::new(
                ImageErrorKind::Quota,
                "The OpenAI account is out of credit or over its spending limit. The user can \
                 add credit, or choose another image provider in Settings.",
            ),
            429 => ImageError::new(
                ImageErrorKind::Quota,
                "OpenAI's rate limit was reached. Wait a minute before asking for more images.",
            ),
            _ if code == "moderation_blocked" || code == "content_policy_violation" => {
                // The service names the categories rather than writing a sentence.
                let categories = error["moderation_details"]["categories"]
                    .as_array()
                    .map(|list| {
                        let names: Vec<_> = list.iter().filter_map(Value::as_str).collect();
                        names.join(", ")
                    })
                    .filter(|names| !names.is_empty())
                    .map(|names| format!(" ({})", self.clean(&names)))
                    .unwrap_or_default();
                ImageError::new(
                    ImageErrorKind::GenerationFailed,
                    format!(
                        "OpenAI declined the request under its content policy{categories}{}. \
                         Change the prompt; the same request will be declined again.",
                        said.trim_end_matches('.')
                    ),
                )
            }
            // The body of this refusal carries no code, only the sentence.
            403 if said.contains("must be verified") => ImageError::new(
                ImageErrorKind::GenerationFailed,
                "OpenAI makes image models available only to a verified organization. The user \
                 can verify theirs in the OpenAI console (Settings, Organization), or choose \
                 another image provider in Settings.",
            ),
            403 | 404 => ImageError::new(
                ImageErrorKind::GenerationFailed,
                format!("OpenAI refused the request ({}){said}", status.as_u16()),
            ),
            500.. => ImageError::new(
                ImageErrorKind::GenerationFailed,
                format!(
                    "OpenAI had an error ({}); try again later.",
                    status.as_u16()
                ),
            ),
            _ => ImageError::new(
                ImageErrorKind::GenerationFailed,
                format!("OpenAI rejected the request ({}){said}", status.as_u16()),
            ),
        }
    }

    /// Text of the service with no key in it: the stored key itself, and anything shaped like
    /// one. Cut to a length that fits a message.
    fn clean(&self, text: &str) -> String {
        let text = scrub_keys(&self.secrets.redact(text));
        let short: String = text.chars().take(400).collect();
        short.trim().to_owned()
    }
}

/// Replaces anything that looks like an API key (`sk-…`, masked or not) with a marker.
fn scrub_keys(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("sk-") {
        // Only at the start of a word: "task-" is not a key.
        let starts_word = rest[..at]
            .chars()
            .next_back()
            .is_none_or(|c| !c.is_alphanumeric());
        let tail = &rest[at..];
        let len = tail
            .char_indices()
            .find(|(_, c)| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '*' | '.')))
            .map_or(tail.len(), |(i, _)| i);
        out.push_str(&rest[..at]);
        if starts_word && len >= 8 {
            out.push_str("[redacted]");
            // A sentence's full stop is not part of the key.
            if tail[..len].ends_with('.') {
                out.push('.');
            }
        } else {
            out.push_str(&tail[..len]);
        }
        rest = &tail[len..];
    }
    out.push_str(rest);
    out
}

fn check_prompt(prompt: &str) -> Result<()> {
    if prompt.chars().count() > MAX_PROMPT {
        return Err(ImageError::invalid_input(format!(
            "the prompt is longer than {MAX_PROMPT} characters"
        )));
    }
    Ok(())
}

fn size_text((width, height): (u32, u32)) -> String {
    format!("{width}x{height}")
}

/// The size asked for each shape (GEN-05): the shape exactly, sides in multiples of 16, and
/// about as many pixels as a slide has, so a full-bleed picture is not blown up.
fn size_for(aspect: Aspect) -> (u32, u32) {
    match aspect {
        Aspect::Wide => (1792, 1008),
        Aspect::Landscape => (1536, 1152),
        Aspect::Square => (1280, 1280),
        Aspect::Portrait => (1152, 1536),
        Aspect::Tall => (1008, 1792),
    }
}

#[async_trait]
impl ImageProvider for OpenAiApi {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: ID.into(),
            name: NAME.into(),
            capabilities: Capabilities {
                edit: EditSupport::Exact,
                mask: true,
                // The service can leave the background out, but a job cannot ask for it yet.
                transparent: false,
                max_parallel: 4,
            },
        }
    }

    async fn probe(&self) -> ProviderStatus {
        let status = |state, account: Option<&str>, detail: Option<String>| ProviderStatus {
            state,
            version: None,
            account: account.map(Into::into),
            detail,
        };
        let key = match self.key() {
            Ok(key) => key,
            Err(error) => return status(ProviderState::NotLoggedIn, None, Some(error.message)),
        };
        let options = self.options();
        let model = options.model().to_owned();
        let request = match self.request(reqwest::Method::GET, &format!("models/{model}"), &key) {
            Ok(request) => request,
            Err(error) => return status(ProviderState::Unavailable, None, Some(error.message)),
        };
        // Nothing cancels a probe.
        let (_never, cancel) = Cancel::new();
        match self.answer(request, PROBE_TIMEOUT, cancel).await {
            Ok((code, body)) if code.is_success() => {
                // The service announces the end of a model in the model's own record.
                let ends = serde_json::from_slice::<Value>(&body)
                    .ok()
                    .and_then(|record| record["shutdown_date"].as_str().map(str::to_owned))
                    .filter(|date| is_token(date))
                    .map(|date| format!("OpenAI shuts the image model {model} down on {date}."));
                ProviderStatus {
                    version: Some(model),
                    ..status(ProviderState::Ready, Some("API key"), ends)
                }
            }
            Ok((code, body)) => {
                let error = self.failure(code, &body);
                let state = match (error.kind, code.as_u16()) {
                    (ImageErrorKind::NotLoggedIn, _) => ProviderState::NotLoggedIn,
                    // The key is good; the limit is about how often, not whether.
                    (_, 429) => ProviderState::Ready,
                    _ => ProviderState::Unavailable,
                };
                let detail = if code.as_u16() == 404 {
                    format!("The key has no access to the image model {model}.")
                } else {
                    error.message
                };
                status(state, Some("API key"), Some(detail))
            }
            Err(error) => status(
                ProviderState::Unavailable,
                Some("API key"),
                Some(error.message),
            ),
        }
    }

    async fn generate(&self, request: &GenerateRequest, cancel: Cancel) -> Result<GeneratedImage> {
        check_prompt(&request.prompt)?;
        let key = self.key()?;
        let options = self.options();
        let body = json!({
            "model": options.model(),
            "prompt": request.prompt,
            "n": 1,
            "size": size_text(size_for(request.aspect)),
            "quality": options.quality(),
        });
        let call = self
            .request(reqwest::Method::POST, "images/generations", &key)?
            .json(&body);
        let (status, answer) = self.answer(call, TIMEOUT, cancel).await?;
        Ok(GeneratedImage {
            bytes: self.image(status, &answer)?,
        })
    }

    async fn edit(&self, request: &EditRequest, cancel: Cancel) -> Result<GeneratedImage> {
        check_prompt(&request.instruction)?;
        let key = self.key()?;
        let options = self.options();

        let (source, mask) = (request.source.clone(), request.mask.clone());
        let prepared = tokio::task::spawn_blocking(move || {
            let reading = |e: std::io::Error| ImageError::io("read the image to edit", &e);
            let source = std::fs::read(&source).map_err(reading)?;
            let mask = mask.map(std::fs::read).transpose().map_err(reading)?;
            exact_edit::prepare(&source, mask.as_deref(), SIZES)
        })
        .await
        .map_err(ImageError::internal)??;

        let file = |bytes: Vec<u8>, name: &'static str| {
            multipart::Part::bytes(bytes)
                .file_name(name)
                .mime_str("image/png")
                .map_err(ImageError::internal)
        };
        let mut form = multipart::Form::new()
            .text("model", options.model().to_owned())
            .text("prompt", request.instruction.clone())
            .text("n", "1")
            .text("size", size_text(prepared.canvas))
            .text("quality", options.quality().to_owned())
            .part("image", file(prepared.picture.clone(), "image.png")?);
        if options.takes_input_fidelity() {
            // Keep what is not asked to change as close to the source as the model can.
            form = form.text("input_fidelity", "high");
        }
        if let Some(mask) = &prepared.mask {
            form = form.part("mask", file(mask.clone(), "mask.png")?);
        }
        let call = self
            .request(reqwest::Method::POST, "images/edits", &key)?
            .multipart(form);
        let (status, answer) = self.answer(call, TIMEOUT, cancel).await?;
        let drawn = self.image(status, &answer)?;
        let bytes = tokio::task::spawn_blocking(move || prepared.finish(&drawn))
            .await
            .map_err(ImageError::internal)??;
        Ok(GeneratedImage { bytes })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use image::{DynamicImage, Rgba, RgbaImage};

    use super::*;
    use crate::{
        net::testing::{Reply, Seen, Server, serve},
        secrets,
    };

    type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

    const KEY: &str = "sk-test-0123456789abcdefghijklmnop";

    fn fixture(name: &str) -> Vec<u8> {
        match name {
            "model" => include_bytes!("openai_api/model.json").to_vec(),
            "invalid-key" => include_bytes!("openai_api/error-invalid-key.json").to_vec(),
            "quota" => include_bytes!("openai_api/error-quota.json").to_vec(),
            "rate-limit" => include_bytes!("openai_api/error-rate-limit.json").to_vec(),
            "moderation" => include_bytes!("openai_api/error-moderation.json").to_vec(),
            "unverified" => include_bytes!("openai_api/error-unverified.json").to_vec(),
            "shutting-down" => include_bytes!("openai_api/model-shutting-down.json").to_vec(),
            _ => Vec::new(),
        }
    }

    fn png(width: u32, height: u32, colour: [u8; 4]) -> Vec<u8> {
        let image = RgbaImage::from_pixel(width, height, Rgba(colour));
        let mut out = Vec::new();
        let written = DynamicImage::ImageRgba8(image)
            .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png);
        assert!(written.is_ok());
        out
    }

    /// The service's answer to a generation or an edit: the documented shape, around `image`.
    fn generation(image: &[u8]) -> Vec<u8> {
        let template = include_str!("openai_api/generation.json");
        let encoded = base64::engine::general_purpose::STANDARD.encode(image);
        template
            .replace("<base64 of the PNG>", &encoded)
            .into_bytes()
    }

    struct Bench {
        server: Server,
        provider: OpenAiApi,
        settings: Arc<Settings>,
        root: tempfile::TempDir,
    }

    async fn bench(
        key: Option<&str>,
        answer: impl Fn(&Seen) -> Reply + Send + Sync + 'static,
    ) -> std::result::Result<Bench, Box<dyn std::error::Error>> {
        let root = tempfile::tempdir()?;
        let server = serve(answer).await?;
        let settings = Arc::new(Settings::open(root.path().join("settings.json")));
        let keys: Vec<_> = key.iter().map(|k| (SecretName::OpenaiApi, *k)).collect();
        let provider = OpenAiApi::at(
            format!("{}/v1", server.base),
            Arc::new(secrets::memory(&keys)),
            Arc::clone(&settings),
        );
        Ok(Bench {
            server,
            provider,
            settings,
            root,
        })
    }

    fn cancel() -> Cancel {
        let (sender, cancel) = Cancel::new();
        // Nobody cancels: the sender has to outlive the call.
        std::mem::forget(sender);
        cancel
    }

    fn wide(prompt: &str) -> GenerateRequest {
        GenerateRequest {
            prompt: prompt.into(),
            aspect: Aspect::Wide,
        }
    }

    #[test]
    fn the_descriptor_says_exact_edits_with_a_mask() {
        let provider = OpenAiApi::at(
            "http://127.0.0.1:9/v1",
            Arc::new(secrets::memory(&[])),
            Arc::new(Settings::open(PathBuf::from("unused.json"))),
        );
        let descriptor = provider.descriptor();
        assert_eq!(descriptor.id, "openai-api");
        assert_eq!(descriptor.capabilities.edit, EditSupport::Exact);
        assert!(descriptor.capabilities.mask);
    }

    #[tokio::test]
    async fn generates_with_the_key_in_the_header_and_nowhere_else() -> TestResult {
        let picture = png(48, 32, [200, 30, 30, 255]);
        let body = generation(&picture);
        let bench = bench(Some(KEY), move |_| Reply::json(200, body.clone())).await?;
        bench
            .settings
            .write("images", json!({ "quality": "low" }))?;

        let made = bench
            .provider
            .generate(&wide("wind turbines at sunrise"), cancel())
            .await?;
        assert_eq!(made.bytes, picture);

        let seen = bench.server.seen();
        let [call] = &seen[..] else {
            return Err(format!("expected one request, saw {}", seen.len()).into());
        };
        assert_eq!(
            (call.method.as_str(), call.path.as_str()),
            ("POST", "/v1/images/generations")
        );
        assert_eq!(call.header("authorization"), Some(format!("Bearer {KEY}")));
        let sent: Value = serde_json::from_slice(&call.body)?;
        assert_eq!(
            sent,
            json!({
                "model": "gpt-image-2",
                "prompt": "wind turbines at sunrise",
                "n": 1,
                "size": "1792x1008",
                "quality": "low",
            })
        );
        assert!(!String::from_utf8_lossy(&call.body).contains(KEY));
        assert!(!call.path.contains(KEY) && !call.query.contains(KEY));
        Ok(())
    }

    #[tokio::test]
    async fn the_shape_asked_for_picks_the_size_and_the_settings_pick_the_model() -> TestResult {
        let body = generation(&png(8, 8, [0, 0, 0, 255]));
        let bench = bench(Some(KEY), move |_| Reply::json(200, body.clone())).await?;
        bench.settings.write(
            "images",
            json!({ "openaiModel": "gpt-image-9", "quality": "ultra" }),
        )?;
        for (aspect, size) in [
            (Aspect::Wide, "1792x1008"),
            (Aspect::Landscape, "1536x1152"),
            (Aspect::Square, "1280x1280"),
            (Aspect::Portrait, "1152x1536"),
            (Aspect::Tall, "1008x1792"),
        ] {
            let request = GenerateRequest {
                prompt: "a barn".into(),
                aspect,
            };
            bench.provider.generate(&request, cancel()).await?;
            let seen = bench.server.seen();
            let sent: Value = serde_json::from_slice(&seen.last().ok_or("no request")?.body)?;
            assert_eq!(sent["size"], size, "{aspect:?}");
            // The shape asked for exactly, in sides the service accepts.
            let (width, height) = size_for(aspect);
            let (w, h) = aspect.ratio();
            assert_eq!(width * h, height * w, "{aspect:?}");
            assert!(width % 16 == 0 && height % 16 == 0, "{aspect:?}");
            assert_eq!(sent["model"], "gpt-image-9");
            // A quality the service does not know falls back to the usual one.
            assert_eq!(sent["quality"], "medium");
        }
        Ok(())
    }

    #[tokio::test]
    async fn without_a_key_nothing_is_sent() -> TestResult {
        let bench = bench(None, |_| Reply::json(200, Vec::new())).await?;
        let error = bench
            .provider
            .generate(&wide("a barn"), cancel())
            .await
            .err()
            .ok_or("generated without a key")?;
        assert_eq!(error.kind, ImageErrorKind::NotLoggedIn);
        assert!(error.message.contains("Settings"));
        let status = bench.provider.probe().await;
        assert_eq!(status.state, ProviderState::NotLoggedIn);
        assert!(bench.server.seen().is_empty());
        Ok(())
    }

    #[tokio::test]
    async fn refusals_are_sorted_by_what_the_user_can_do() -> TestResult {
        for (status, name, kind, says) in [
            (
                401,
                "invalid-key",
                ImageErrorKind::NotLoggedIn,
                "rejected the API key",
            ),
            (429, "quota", ImageErrorKind::Quota, "out of credit"),
            (429, "rate-limit", ImageErrorKind::Quota, "rate limit"),
            (
                400,
                "moderation",
                ImageErrorKind::GenerationFailed,
                "content policy (harassment)",
            ),
            (
                403,
                "unverified",
                ImageErrorKind::GenerationFailed,
                "verified organization",
            ),
            (
                503,
                "",
                ImageErrorKind::GenerationFailed,
                "had an error (503)",
            ),
        ] {
            let body = fixture(name);
            let bench = bench(Some(KEY), move |_| Reply::json(status, body.clone())).await?;
            let error = bench
                .provider
                .generate(&wide("a barn"), cancel())
                .await
                .err()
                .ok_or("generated")?;
            assert_eq!(error.kind, kind, "{name}");
            assert!(error.message.contains(says), "{name}: {}", error.message);
            assert!(!error.message.contains("sk-"), "{name}: {}", error.message);
        }
        Ok(())
    }

    #[tokio::test]
    async fn a_key_the_service_echoes_never_reaches_the_message() -> TestResult {
        // A refusal that quotes the whole key, and a masked one, in a status that passes the
        // service's text on.
        let said = format!(
            r#"{{"error":{{"message":"Bad request for {KEY} (also sk-proj-****abcd1234). Fix the task-list.","type":"invalid_request_error","code":null}}}}"#
        );
        let bench = bench(Some(KEY), move |_| {
            Reply::json(400, said.clone().into_bytes())
        })
        .await?;
        let error = bench
            .provider
            .generate(&wide("a barn"), cancel())
            .await
            .err()
            .ok_or("generated")?;
        assert_eq!(
            error.message,
            "OpenAI rejected the request (400): Bad request for [redacted] (also [redacted]). \
             Fix the task-list."
        );
        Ok(())
    }

    #[test]
    fn anything_shaped_like_a_key_is_scrubbed() {
        for (text, expected) in [
            ("key sk-abc123def456 here", "key [redacted] here"),
            ("sk-proj-ab****************yz12.", "[redacted]."),
            ("a task-force and a risk-", "a task-force and a risk-"),
            ("sk-x", "sk-x"),
            ("no keys", "no keys"),
        ] {
            assert_eq!(scrub_keys(text), expected, "{text}");
        }
    }

    #[tokio::test]
    async fn probe_asks_for_the_model_and_reads_the_answer() -> TestResult {
        let bench = bench(Some(KEY), |seen| {
            assert_eq!(seen.path, "/v1/models/gpt-image-2");
            Reply::json(200, fixture("model"))
        })
        .await?;
        let status = bench.provider.probe().await;
        assert_eq!(status.state, ProviderState::Ready);
        assert_eq!(status.version.as_deref(), Some("gpt-image-2"));
        assert_eq!(status.account.as_deref(), Some("API key"));
        assert_eq!(status.detail, None);
        assert_eq!(
            bench.server.seen()[0].header("authorization"),
            Some(format!("Bearer {KEY}"))
        );

        let rejected = self::bench(Some(KEY), |_| Reply::json(401, fixture("invalid-key"))).await?;
        let status = rejected.provider.probe().await;
        assert_eq!(status.state, ProviderState::NotLoggedIn);
        assert!(!status.detail.unwrap_or_default().contains("sk-"));

        let unknown = self::bench(Some(KEY), |_| Reply::json(404, Vec::new())).await?;
        let status = unknown.provider.probe().await;
        assert_eq!(status.state, ProviderState::Unavailable);
        assert!(status.detail.unwrap_or_default().contains("gpt-image-2"));

        // A model the service is about to shut down still works, and says when it ends.
        let ending = self::bench(Some(KEY), |_| Reply::json(200, fixture("shutting-down"))).await?;
        ending
            .settings
            .write("images", json!({ "openaiModel": "gpt-image-1" }))?;
        let status = ending.provider.probe().await;
        assert_eq!(status.state, ProviderState::Ready);
        assert!(status.detail.unwrap_or_default().contains("2026-10-23"));
        Ok(())
    }

    #[tokio::test]
    async fn an_edit_sends_picture_and_mask_and_keeps_the_pixels_outside_the_mask() -> TestResult {
        // The service paints its whole canvas magenta.
        let body = generation(&png(1536, 1024, [255, 0, 255, 255]));
        let bench = bench(Some(KEY), move |_| Reply::json(200, body.clone())).await?;

        // A 16:9 source in one colour, and a mask that opens its left half.
        let (w, h) = (640, 360);
        let source = bench.root.path().join("source.png");
        std::fs::write(&source, png(w, h, [20, 120, 220, 255]))?;
        let mask_image = RgbaImage::from_fn(w, h, |x, _| {
            Rgba([0, 0, 0, if x < w / 2 { 0 } else { 255 }])
        });
        let mut mask_bytes = Vec::new();
        DynamicImage::ImageRgba8(mask_image).write_to(
            &mut std::io::Cursor::new(&mut mask_bytes),
            image::ImageFormat::Png,
        )?;
        let mask = bench.root.path().join("mask.png");
        std::fs::write(&mask, mask_bytes)?;

        let edited = bench
            .provider
            .edit(
                &EditRequest {
                    source,
                    mask: Some(mask),
                    instruction: "replace the sky".into(),
                },
                cancel(),
            )
            .await?;
        let edited = image::load_from_memory(&edited.bytes)?.to_rgba8();
        assert_eq!(edited.dimensions(), (w, h));
        assert_eq!(
            edited.get_pixel(40, 180),
            &Rgba([255, 0, 255, 255]),
            "inside the mask"
        );
        let kept = (w / 2..w)
            .flat_map(|x| (0..h).map(move |y| (x, y)))
            .all(|(x, y)| edited.get_pixel(x, y) == &Rgba([20, 120, 220, 255]));
        assert!(kept, "every pixel outside the mask is the source's");

        let seen = bench.server.seen();
        let [call] = &seen[..] else {
            return Err("expected one request".into());
        };
        assert_eq!(call.path, "/v1/images/edits");
        assert!(
            call.header("content-type")
                .unwrap_or_default()
                .starts_with("multipart/form-data")
        );
        let sent = String::from_utf8_lossy(&call.body).into_owned();
        for part in [
            "name=\"model\"",
            "name=\"prompt\"",
            "replace the sky",
            "name=\"size\"",
            // The source's own shape, scaled up to the fewest pixels the service takes.
            "1088x608",
            "name=\"image\"; filename=\"image.png\"",
            "name=\"mask\"; filename=\"mask.png\"",
        ] {
            assert!(sent.contains(part), "{part}");
        }
        assert!(!sent.contains(KEY));
        // The model reads its input at full fidelity on its own, and rejects the parameter.
        assert!(!sent.contains("input_fidelity"));
        Ok(())
    }

    #[tokio::test]
    async fn a_cancelled_call_returns_at_once() -> TestResult {
        // A service that never answers in time.
        let bench = bench(Some(KEY), |_| Reply::after(Duration::from_secs(30))).await?;
        let (job, cancel) = Cancel::new();
        let provider = Arc::new(bench.provider);
        let running = tokio::spawn({
            let provider = Arc::clone(&provider);
            async move { provider.generate(&wide("a barn"), cancel).await }
        });
        tokio::time::sleep(Duration::from_millis(300)).await;
        job.send_replace(true);
        let began = std::time::Instant::now();
        let error = running.await?.err().ok_or("generated")?;
        assert_eq!(error.kind, ImageErrorKind::Cancelled);
        assert!(began.elapsed() < Duration::from_secs(2));
        Ok(())
    }
}
