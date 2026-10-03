//! The app's own calls to the web (ADR-051, ADR-052): the one place that makes an HTTP client.
//!
//! Everything else the app does stays on the machine; an agent's CLI and an image CLI are
//! processes of their own. What goes through here is a provider that is a web API (images made
//! with the user's key) and stock photo search. The webview makes none of these calls, so its
//! content security policy can stay closed to the network (SEC-05): it asks Rust, and Rust talks
//! to the hosts each provider names.
//!
//! - HTTPS only, except to this machine (tests, and a development stand-in for a service).
//! - No redirects are followed: an API answers where it was asked, and a key is never carried
//!   to another host.
//! - TLS is the operating system's.

use std::{sync::OnceLock, time::Duration};

use reqwest::{Client, Url, redirect::Policy};

/// How long a connection may take to open.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// The shared client. Cheap to clone; connections are pooled per host.
pub fn client() -> Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            Client::builder()
                .user_agent(concat!("Slidr/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(CONNECT_TIMEOUT)
                .redirect(Policy::none())
                .build()
                // Fails only when the system's TLS cannot be initialised; a client without
                // settings then fails every request with the reason.
                .unwrap_or_default()
        })
        .clone()
}

/// Whether a request may go to `url`: HTTPS anywhere, plain HTTP only to this machine.
pub fn allowed(url: &Url) -> bool {
    match url.scheme() {
        "https" => true,
        "http" => is_loopback(url),
        _ => false,
    }
}

/// Whether `url` points at this machine.
pub fn is_loopback(url: &Url) -> bool {
    matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
}

/// The base URL a provider talks to: `default`, unless a development build is told otherwise
/// through the environment variable `variable`, and then only to this machine. A stand-in server
/// on the loopback interface lets the whole flow run without a real key; nothing can point a
/// release build, or any build's key, at another host this way.
pub fn base_url(default: &str, variable: &str) -> String {
    if cfg!(debug_assertions)
        && let Ok(value) = std::env::var(variable)
        && let Ok(url) = Url::parse(&value)
        && url.scheme() == "http"
        && is_loopback(&url)
    {
        return value.trim_end_matches('/').to_owned();
    }
    default.to_owned()
}

/// Why a request did not get an answer, in words for an error message. Never the URL: a query
/// string may carry what should not be shown.
pub fn failure(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "the request timed out"
    } else if error.is_connect() {
        "could not connect; check the network connection"
    } else if error.is_redirect() {
        "the service answered with a redirect, which is not followed"
    } else if error.is_body() || error.is_decode() {
        "the answer could not be read"
    } else {
        "the request failed"
    }
}

/// A stand-in for a web service, on this machine: it records what it is asked and answers
/// what the test tells it to.
#[cfg(test)]
pub mod testing {
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex, PoisonError},
        time::Duration,
    };

    use axum::{
        Router,
        body::{Body, to_bytes},
        extract::Request,
        http::{StatusCode, header::CONTENT_TYPE},
        response::Response,
    };

    /// One request the server received.
    #[derive(Debug, Clone)]
    pub struct Seen {
        pub method: String,
        pub path: String,
        /// The query string, without the question mark; empty when there is none.
        pub query: String,
        headers: HashMap<String, String>,
        pub body: Vec<u8>,
    }

    impl Seen {
        /// A request header, by its lowercase name.
        pub fn header(&self, name: &str) -> Option<String> {
            self.headers.get(name).cloned()
        }
    }

    /// What the server answers.
    pub struct Reply {
        status: u16,
        content_type: &'static str,
        body: Vec<u8>,
        delay: Duration,
    }

    impl Reply {
        /// A JSON body with a status.
        pub fn json(status: u16, body: impl Into<Vec<u8>>) -> Self {
            Self::bytes(status, "application/json", body)
        }

        /// Any body.
        pub fn bytes(status: u16, content_type: &'static str, body: impl Into<Vec<u8>>) -> Self {
            Self {
                status,
                content_type,
                body: body.into(),
                delay: Duration::ZERO,
            }
        }

        /// An empty answer that takes `delay` to come: a service that hangs.
        pub fn after(delay: Duration) -> Self {
            Self {
                delay,
                ..Self::json(200, Vec::new())
            }
        }
    }

    /// The running server; it stops when this is dropped.
    pub struct Server {
        /// `http://127.0.0.1:<port>`, without a trailing slash.
        pub base: String,
        seen: Arc<Mutex<Vec<Seen>>>,
        task: tokio::task::JoinHandle<()>,
    }

    impl Server {
        /// The requests received so far, in order.
        pub fn seen(&self) -> Vec<Seen> {
            self.seen
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone()
        }
    }

    impl Drop for Server {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    /// Starts a server on a free port of this machine that answers every request with what
    /// `answer` returns for it.
    pub async fn serve(
        answer: impl Fn(&Seen) -> Reply + Send + Sync + 'static,
    ) -> std::io::Result<Server> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let base = format!("http://{}", listener.local_addr()?);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let answer = Arc::new(answer);
        let router = Router::new().fallback({
            let seen = Arc::clone(&seen);
            move |request: Request| {
                let (seen, answer) = (Arc::clone(&seen), Arc::clone(&answer));
                async move {
                    let (parts, body) = request.into_parts();
                    let request = Seen {
                        method: parts.method.to_string(),
                        path: parts.uri.path().to_owned(),
                        query: parts.uri.query().unwrap_or_default().to_owned(),
                        headers: parts
                            .headers
                            .iter()
                            .map(|(name, value)| {
                                let value = String::from_utf8_lossy(value.as_bytes());
                                (name.as_str().to_owned(), value.into_owned())
                            })
                            .collect(),
                        body: to_bytes(body, usize::MAX)
                            .await
                            .map(|bytes| bytes.to_vec())
                            .unwrap_or_default(),
                    };
                    let reply = answer(&request);
                    seen.lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .push(request);
                    tokio::time::sleep(reply.delay).await;
                    let mut response = Response::new(Body::from(reply.body));
                    *response.status_mut() =
                        StatusCode::from_u16(reply.status).unwrap_or(StatusCode::OK);
                    if let Ok(value) = reply.content_type.parse() {
                        response.headers_mut().insert(CONTENT_TYPE, value);
                    }
                    response
                }
            }
        });
        let task = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        Ok(Server { base, seen, task })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_and_this_machine_are_allowed() -> Result<(), Box<dyn std::error::Error>> {
        for (url, expected) in [
            ("https://api.example.com/v1/images", true),
            ("http://127.0.0.1:4010/v1", true),
            ("http://localhost:4010/v1", true),
            ("http://api.example.com/v1", false),
            ("file:///c:/windows/win.ini", false),
            ("ftp://example.com/x", false),
        ] {
            assert_eq!(allowed(&Url::parse(url)?), expected, "{url}");
        }
        Ok(())
    }

    #[test]
    fn the_base_url_is_the_default_unless_a_loopback_stand_in_is_named() {
        // A variable nobody sets.
        assert_eq!(
            base_url("https://api.example.com/v1", "SLIDR_TEST_NO_SUCH_VARIABLE"),
            "https://api.example.com/v1"
        );
    }
}
