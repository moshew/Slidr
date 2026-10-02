//! Spike WG0-S2 (+ the WebView2 half of S3): a thin MCP-over-HTTP adapter in Rust (rmcp) that
//! forwards tool calls to the webview and returns the result, with Claude Code as the client.
//! Findings: docs/adr/ADR-002 and ADR-003.
//!
//! Run: `cargo run --release` from this folder. The app drives itself and exits; the report is
//! printed and written to `../out/report.txt`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use axum::extract::{Request, State as AxumState};
use axum::http::{StatusCode, header::AUTHORIZATION, request::Parts};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use rmcp::model::{
    CacheScope, CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation, ListToolsResult,
    PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
};
use rmcp::service::RequestContext;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{Mutex, Notify, RwLock, oneshot};

// ---------------------------------------------------------------------------------------------
// Bridge state: what the webview registered, and the calls waiting for an answer from it.

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolDef {
    name: String,
    description: String,
    input_schema: Map<String, Value>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ContentPart {
    Text {
        text: String,
    },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
}

struct ToolReply {
    content: Vec<ContentPart>,
    is_error: bool,
    exec_ms: f64,
}

#[derive(Default)]
struct Bridge {
    tools: RwLock<Vec<ToolDef>>,
    tools_ready: Notify,
    pending: Mutex<HashMap<String, oneshot::Sender<ToolReply>>>,
    /// session key -> bearer token (MCP-02)
    sessions: RwLock<HashMap<String, String>>,
    next_call: AtomicU64,
    /// One line per HTTP request the adapter saw (spike diagnostics).
    http_log: std::sync::Mutex<Vec<String>>,
}

#[derive(Clone)]
struct SessionKey(String);

impl Bridge {
    /// Forwards one call to the webview and waits for its answer. Returns the reply and the
    /// app-internal round-trip time.
    async fn forward(&self, app: &AppHandle, session_key: &str, name: &str, arguments: Value) -> Result<(ToolReply, Duration), String> {
        let call_id = format!("call_{}", self.next_call.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(call_id.clone(), tx);
        let started = Instant::now();
        app.emit("bridge://tool-call", json!({ "callId": call_id, "sessionKey": session_key, "name": name, "arguments": arguments }))
            .map_err(|e| e.to_string())?;
        match tokio::time::timeout(Duration::from_secs(60), rx).await {
            Ok(Ok(reply)) => Ok((reply, started.elapsed())),
            Ok(Err(_)) => Err("webview dropped the call".into()),
            Err(_) => {
                self.pending.lock().await.remove(&call_id);
                Err("tool call timed out after 60s".into())
            }
        }
    }
}

#[tauri::command]
async fn register_tools(tools: Vec<ToolDef>, bridge: State<'_, Arc<Bridge>>) -> Result<(), String> {
    *bridge.tools.write().await = tools;
    bridge.tools_ready.notify_one();
    Ok(())
}

#[tauri::command]
async fn tool_result(call_id: String, content: Vec<ContentPart>, is_error: bool, exec_ms: f64, bridge: State<'_, Arc<Bridge>>) -> Result<(), String> {
    let sender = bridge.pending.lock().await.remove(&call_id).ok_or("unknown or expired call id")?;
    sender.send(ToolReply { content, is_error, exec_ms }).map_err(|_| "caller went away".to_string())
}

// ---------------------------------------------------------------------------------------------
// The MCP adapter. No tool logic here: list what the webview registered, forward, translate.

#[derive(Clone)]
struct McpAdapter {
    bridge: Arc<Bridge>,
    app: AppHandle,
}

impl ServerHandler for McpAdapter {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_server_info(Implementation::new("slidr", "0.0.0"))
    }

    async fn list_tools(&self, _request: Option<PaginatedRequestParams>, _context: RequestContext<RoleServer>) -> Result<ListToolsResult, McpError> {
        let tools = self.bridge.tools.read().await;
        if let Ok(mut log) = self.bridge.http_log.lock() {
            log.push(format!("  handler list_tools -> {} tools", tools.len()));
        }
        // Protocol 2026-07-28 makes `ttlMs` and `cacheScope` mandatory on list results. rmcp leaves
        // them out by default, and Claude Code then rejects the whole list: the server shows as
        // "connected" with zero tools. TTL 0: the tool set depends on the session scope, never cache it.
        Ok(ListToolsResult::with_all_items(
            tools.iter().map(|t| Tool::new(t.name.clone(), t.description.clone(), Arc::new(t.input_schema.clone()))).collect(),
        )
        .with_ttl_ms(0)
        .with_cache_scope(CacheScope::Private))
    }

    async fn call_tool(&self, request: CallToolRequestParams, context: RequestContext<RoleServer>) -> Result<CallToolResponse, McpError> {
        // The auth middleware put the session key on the HTTP request; rmcp hands us its `Parts`.
        let session_key = context
            .extensions
            .get::<Parts>()
            .and_then(|parts| parts.extensions.get::<SessionKey>())
            .map(|key| key.0.clone())
            .ok_or_else(|| McpError::internal_error("no session key on the request", None))?;
        let arguments = request.arguments.map(Value::Object).unwrap_or_else(|| json!({}));
        let (reply, _) = self
            .bridge
            .forward(&self.app, &session_key, &request.name, arguments)
            .await
            .map_err(|e| McpError::internal_error(e, None))?;
        let content = reply
            .content
            .into_iter()
            .map(|part| match part {
                ContentPart::Text { text } => ContentBlock::text(text),
                ContentPart::Image { data, mime_type } => ContentBlock::image(data, mime_type),
            })
            .collect();
        Ok(if reply.is_error { CallToolResult::error(content) } else { CallToolResult::success(content) }.into())
    }
}

/// `/mcp/<sessionKey>` + `Authorization: Bearer <token>`; anything else is 401.
async fn auth(AxumState(bridge): AxumState<Arc<Bridge>>, mut request: Request, next: Next) -> Response {
    let key = request.uri().path().strip_prefix("/mcp/").unwrap_or_default().to_owned();
    let presented = request.headers().get(AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer "));
    let expected = bridge.sessions.read().await.get(&key).cloned();
    match (presented, expected) {
        (Some(presented), Some(expected)) if presented == expected => {
            request.extensions_mut().insert(SessionKey(key));
            // Built in its own block: a borrow of the request must not live across the await below.
            let line = {
                let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("-").to_owned();
                format!(
                    "{} mcp-method={} protocol={} session={} accept={}",
                    request.method(),
                    header("mcp-method"),
                    header("mcp-protocol-version"),
                    if header("mcp-session-id") == "-" { "-" } else { "yes" },
                    header("accept")
                )
            };
            let response = next.run(request).await;
            let content_type = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("-").to_owned();
            if let Ok(mut log) = bridge.http_log.lock() {
                log.push(format!("{line} -> {} {content_type}", response.status().as_u16()));
            }
            response
        }
        _ => StatusCode::UNAUTHORIZED.into_response(),
    }
}

async fn start_mcp_server(bridge: Arc<Bridge>, app: AppHandle) -> anyhow::Result<u16> {
    let adapter = McpAdapter { bridge: bridge.clone(), app };
    let service = StreamableHttpService::new(move || Ok(adapter.clone()), Arc::new(LocalSessionManager::default()), StreamableHttpServerConfig::default());
    let router = axum::Router::new()
        .route_service("/mcp/{session_key}", service)
        .layer(axum::middleware::from_fn_with_state(bridge, auth));
    // MCP-01: loopback only, random port.
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = listener.local_addr()?.port();
    tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    Ok(port)
}

// ---------------------------------------------------------------------------------------------
// Spike S3, WebView2 half: native capture through the DevTools protocol.

async fn cdp(window: &WebviewWindow, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows_core::HSTRING;

    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let method = HSTRING::from(method);
    let params = HSTRING::from(params.to_string());
    window
        .with_webview(move |webview| {
            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, json| {
                let _ = tx.send(result.map(|()| json).map_err(|e| e.to_string()));
                Ok(())
            }));
            // SAFETY: COM calls on the webview's own thread, which is where `with_webview` runs us.
            unsafe {
                if let Ok(core) = webview.controller().CoreWebView2() {
                    let _ = core.CallDevToolsProtocolMethod(&method, &params, &handler);
                }
            }
        })
        .map_err(|e| e.to_string())?;
    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(Ok(json))) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        Ok(Ok(Err(e))) => Err(format!("CDP error: {e}")),
        Ok(Err(_)) => Err("CDP callback dropped (call was not made)".into()),
        Err(_) => Err(format!("no CDP answer within {timeout:?}")),
    }
}

/// Returns base64 PNG of a page region. `clip` is in CSS px of the page, plus `scale`.
async fn capture(window: &WebviewWindow, clip: Value, beyond_viewport: bool) -> Result<String, String> {
    let params = json!({ "format": "png", "clip": clip, "captureBeyondViewport": beyond_viewport });
    let result = cdp(window, "Page.captureScreenshot", params, Duration::from_secs(8)).await?;
    result["data"].as_str().map(str::to_owned).ok_or_else(|| format!("no data in {result}"))
}

#[tauri::command]
async fn capture_region(window: WebviewWindow, clip: Value) -> Result<String, String> {
    capture(&window, clip, false).await
}

fn base64_decode(data: &str) -> Vec<u8> {
    // Minimal decoder so the spike has no extra dependency; input is trusted (it came from WebView2).
    let table = |c: u8| match c {
        b'A'..=b'Z' => c - b'A',
        b'a'..=b'z' => c - b'a' + 26,
        b'0'..=b'9' => c - b'0' + 52,
        b'+' => 62,
        _ => 63,
    };
    let bytes: Vec<u8> = data.bytes().filter(|c| *c != b'=' && !c.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let n = chunk.iter().fold(0u32, |acc, c| (acc << 6) | u32::from(table(*c))) << (6 * (4 - chunk.len()));
        let decoded = n.to_be_bytes();
        out.extend_from_slice(&decoded[1..chunk.len()]);
    }
    out
}

/// PNG width/height from the IHDR chunk.
fn png_size(png: &[u8]) -> (u32, u32) {
    if png.len() < 24 {
        return (0, 0);
    }
    (u32::from_be_bytes([png[16], png[17], png[18], png[19]]), u32::from_be_bytes([png[20], png[21], png[22], png[23]]))
}

fn stats(mut samples: Vec<f64>) -> String {
    samples.sort_by(f64::total_cmp);
    let at = |q: f64| samples[((samples.len() - 1) as f64 * q).round() as usize];
    format!("n={} min={:.1} median={:.1} p95={:.1} max={:.1} ms", samples.len(), samples[0], at(0.5), at(0.95), samples[samples.len() - 1])
}

async fn native_capture_series(report: &mut String, out_dir: &Path, label: &str, window: &WebviewWindow, clip: Value, beyond: bool) {
    let mut times = vec![];
    let mut last = None;
    for i in 0..21 {
        let started = Instant::now();
        match capture(window, clip.clone(), beyond).await {
            Ok(data) => {
                // First call is reported separately as "cold".
                let ms = started.elapsed().as_secs_f64() * 1000.0;
                if i == 0 {
                    let _ = writeln!(report, "  {label}: cold {ms:.1} ms");
                } else {
                    times.push(ms);
                }
                last = Some(data);
            }
            Err(e) => {
                let _ = writeln!(report, "  {label}: FAILED on call {i}: {e}");
                return;
            }
        }
    }
    if let Some(data) = last {
        let png = base64_decode(&data);
        let (w, h) = png_size(&png);
        let path = out_dir.join(format!("{label}.png"));
        let _ = std::fs::write(&path, &png);
        let _ = writeln!(report, "  {label}: warm {} | {w}x{h}, {} KB -> {}", stats(times), png.len() / 1024, path.display());
    }
}

// ---------------------------------------------------------------------------------------------
// The scripted run.

async fn raw_http(port: u16, path: &str, token: &str, session: Option<&str>, body: &str) -> String {
    let session_header = session.map(|id| format!("Mcp-Session-Id: {id}
")).unwrap_or_default();
    let request = format!(
        "POST {path} HTTP/1.1
Host: 127.0.0.1:{port}
Authorization: Bearer {token}
Content-Type: application/json
Accept: application/json, text/event-stream
{session_header}Content-Length: {}
Connection: close

{body}",
        body.len()
    );
    let Ok(mut stream) = tokio::net::TcpStream::connect(("127.0.0.1", port)).await else {
        return "connect failed".into();
    };
    let _ = stream.write_all(request.as_bytes()).await;
    let mut response = Vec::new();
    // SSE responses stay open; a short read window is enough to see the first event.
    let _ = tokio::time::timeout(Duration::from_millis(1500), stream.read_to_end(&mut response)).await;
    String::from_utf8_lossy(&response).into_owned()
}

async fn raw_http_status(port: u16, path: &str, token: &str) -> String {
    let body = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#;
    raw_http(port, path, token, None, body).await.lines().next().unwrap_or("no response").to_owned()
}

async fn run_claude(report: &mut String, session_dir: &Path, prompt: &str) -> anyhow::Result<()> {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.current_dir(session_dir.join("attachments"))
        .args(["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"])
        // Not `--safe-mode`: it also drops the server passed with `--mcp-config` (probe M1 vs M2).
        .args(["--restricted", "--disable-slash-commands"])
        .arg("--strict-mcp-config")
        .arg("--mcp-config")
        .arg(session_dir.join("mcp.json"))
        .args(["--tools", ""])
        .args(["--allowedTools", "mcp__slidr__*"])
        .args(["--permission-mode", "dontAsk"])
        .args(["--model", "haiku"])
        .arg("--debug-file")
        .arg(session_dir.join("cli-debug.log"));
    for (key, _) in std::env::vars() {
        let upper = key.to_ascii_uppercase();
        if upper.starts_with("CLAUDE") || upper.starts_with("ANTHROPIC") {
            cmd.env_remove(&key);
        }
    }
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let started = Instant::now();
    let mut child = cmd.spawn()?;
    let mut stdin = child.stdin.take().ok_or_else(|| anyhow::anyhow!("no stdin"))?;
    let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("no stdout"))?;
    let message = json!({ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": prompt }] } });
    stdin.write_all(format!("{message}\n").as_bytes()).await?;
    stdin.flush().await?;

    let mut log = tokio::fs::File::create(session_dir.join("claude.jsonl")).await?;
    let mut lines = BufReader::new(stdout).lines();
    let mut tool_started: HashMap<String, (String, Instant)> = HashMap::new();
    while let Some(line) = tokio::time::timeout(Duration::from_secs(180), lines.next_line()).await?? {
        log.write_all(format!("{line}\n").as_bytes()).await?;
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        match v["type"].as_str() {
            Some("system") if v["subtype"] == "init" => {
                writeln!(report, "  init after {:?}: mcp_servers={} tools={}", started.elapsed(), v["mcp_servers"], v["tools"])?;
            }
            Some("assistant") => {
                for block in v["message"]["content"].as_array().into_iter().flatten().filter(|b| b["type"] == "tool_use") {
                    let name = block["name"].as_str().unwrap_or_default().to_owned();
                    writeln!(report, "  tool_use {name} {}", block["input"])?;
                    tool_started.insert(block["id"].as_str().unwrap_or_default().to_owned(), (name, Instant::now()));
                }
            }
            Some("user") => {
                for block in v["message"]["content"].as_array().into_iter().flatten().filter(|b| b["type"] == "tool_result") {
                    let id = block["tool_use_id"].as_str().unwrap_or_default();
                    let kinds: Vec<String> = block["content"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .map(|part| match part["type"].as_str() {
                            Some("text") => format!("text({:?})", part["text"].as_str().unwrap_or_default().chars().take(70).collect::<String>()),
                            Some("image") => format!("image({} base64 chars)", part["source"]["data"].as_str().map_or(0, str::len)),
                            other => format!("{other:?}"),
                        })
                        .collect();
                    if let Some((name, at)) = tool_started.remove(id) {
                        writeln!(report, "  tool_result {name}: is_error={} seen by CLI after {:.0} ms -> {}", block["is_error"], at.elapsed().as_secs_f64() * 1000.0, kinds.join(", "))?;
                    }
                }
            }
            Some("result") => {
                writeln!(report, "  result: subtype={} turns={} cost={} total={:?}", v["subtype"], v["num_turns"], v["total_cost_usd"], started.elapsed())?;
                writeln!(report, "  answer: {}", v["result"])?;
                writeln!(report, "  permission_denials: {}", v["permission_denials"])?;
                break;
            }
            _ => {}
        }
    }
    drop(stdin);
    let _ = tokio::time::timeout(Duration::from_secs(15), child.wait()).await;
    Ok(())
}

async fn scenario(app: AppHandle, bridge: Arc<Bridge>, out_dir: PathBuf) -> anyhow::Result<String> {
    let mut report = String::new();
    let main = app.get_webview_window("main").ok_or_else(|| anyhow::anyhow!("no main window"))?;

    let port = start_mcp_server(bridge.clone(), app.clone()).await?;
    let (key, token) = ("sess_a1b2c3", "tok_5f1d8e3a9c");
    bridge.sessions.write().await.insert(key.into(), token.into());
    writeln!(report, "MCP adapter listening on 127.0.0.1:{port}")?;

    tokio::time::timeout(Duration::from_secs(20), bridge.tools_ready.notified()).await?;
    writeln!(report, "tools registered by the webview: {:?}", bridge.tools.read().await.iter().map(|t| t.name.clone()).collect::<Vec<_>>())?;

    writeln!(report, "\n== A. app-internal round trip (Rust -> webview -> Rust), no MCP, no Claude")?;
    for (name, runs) in [("echo_text", 50), ("render_canvas", 20), ("render_slide", 20)] {
        let (mut total, mut exec) = (vec![], vec![]);
        for _ in 0..runs {
            let (reply, elapsed) = bridge.forward(&app, key, name, json!({ "text": "ping" })).await.map_err(anyhow::Error::msg)?;
            anyhow::ensure!(!reply.is_error, "{name} returned an error");
            total.push(elapsed.as_secs_f64() * 1000.0);
            exec.push(reply.exec_ms);
        }
        writeln!(report, "  {name}: round trip {} | of which tool execution in JS: {}", stats(total), stats(exec))?;
    }

    writeln!(report, "\n== B. access control")?;
    writeln!(report, "  right key, right token : {}", raw_http_status(port, &format!("/mcp/{key}"), token).await)?;
    writeln!(report, "  right key, wrong token : {}", raw_http_status(port, &format!("/mcp/{key}"), "nope").await)?;
    writeln!(report, "  unknown key            : {}", raw_http_status(port, "/mcp/sess_other", token).await)?;

    writeln!(report, "\n== B2. raw MCP handshake against the adapter")?;
    let path = format!("/mcp/{key}");
    let indent = |text: &str, max: usize| text.lines().map(|l| format!("    {}", l.chars().take(max).collect::<String>())).collect::<Vec<_>>().join("\n");
    let init = raw_http(port, &path, token, None, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"raw","version":"0"}}}"#).await;
    writeln!(report, "  initialize ->\n{}", indent(&init, 500))?;
    let session = init.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("mcp-session-id:").map(|v| v.trim().to_owned()));
    let _ = raw_http(port, &path, token, session.as_deref(), r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).await;
    let list = raw_http(port, &path, token, session.as_deref(), r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#).await;
    writeln!(report, "  tools/list ->\n{}", indent(&list, 700))?;
    let discover = raw_http(port, &path, token, session.as_deref(), r#"{"jsonrpc":"2.0","id":3,"method":"server/discover"}"#).await;
    writeln!(report, "  server/discover ->\n{}", indent(&discover, 400))?;

    writeln!(report, "\n== C. Claude Code calls the tools through the adapter")?;
    let session_dir = std::env::temp_dir().join("slidr-s2").join(format!("run-{}", std::process::id()));
    std::fs::create_dir_all(session_dir.join("attachments"))?;
    std::fs::write(
        session_dir.join("mcp.json"),
        json!({ "mcpServers": { "slidr": { "type": "http", "url": format!("http://127.0.0.1:{port}/mcp/{key}"), "headers": { "Authorization": format!("Bearer {token}") } } } }).to_string(),
    )?;
    let prompt = "Use the slidr tools. 1) Call echo_text with text 'hello bridge'. 2) Call render_canvas. 3) Call render_slide. \
                  Then answer in three short lines: (a) the exact text echo_text returned, (b) the code word written in the canvas image, \
                  (c) the code word on the white card in the slide screenshot and the Hebrew headline of the slide.";
    if let Err(e) = run_claude(&mut report, &session_dir, prompt).await {
        writeln!(report, "  CLAUDE RUN FAILED: {e:#}")?;
    }
    writeln!(report, "  raw log: {}", session_dir.join("claude.jsonl").display())?;
    writeln!(report, "  --- HTTP requests seen by the adapter (handshake of B2 first, then the CLI):")?;
    for line in bridge.http_log.lock().map(|log| log.clone()).unwrap_or_default() {
        writeln!(report, "    {line}")?;
    }
    writeln!(report, "  --- CLI debug log, MCP lines:")?;
    for line in std::fs::read_to_string(session_dir.join("cli-debug.log")).unwrap_or_default().lines().filter(|l| l.to_ascii_lowercase().contains("mcp")).take(40) {
        writeln!(report, "    {}", line.chars().take(420).collect::<String>())?;
    }

    writeln!(report, "\n== D. native capture (CDP Page.captureScreenshot through WebView2), 20 warm calls each")?;
    let rect = cdp(&main, "Runtime.evaluate", json!({ "expression": "JSON.stringify((r => ({x:r.x,y:r.y,width:r.width,height:r.height,dpr:devicePixelRatio}))(document.getElementById('slide').getBoundingClientRect()))", "returnByValue": true }), Duration::from_secs(5))
        .await
        .map_err(anyhow::Error::msg)?;
    let rect: Value = serde_json::from_str(rect["result"]["value"].as_str().unwrap_or("{}"))?;
    writeln!(report, "  slide rect on screen (CSS px) and devicePixelRatio: {rect}")?;
    let dpr = rect["dpr"].as_f64().unwrap_or(1.0);
    let width = rect["width"].as_f64().unwrap_or(960.0);
    let clip = |target_width: f64| json!({ "x": rect["x"], "y": rect["y"], "width": rect["width"], "height": rect["height"], "scale": target_width / (width * dpr) });
    native_capture_series(&mut report, &out_dir, "main-visible-960", &main, clip(960.0), false).await;
    native_capture_series(&mut report, &out_dir, "main-visible-1920", &main, clip(1920.0), false).await;

    // A slide the user is not looking at: rendered at scale 1 in a second, never-shown window.
    let hidden = WebviewWindowBuilder::new(&app, "hidden", WebviewUrl::App("capture.html".into())).visible(false).inner_size(800.0, 600.0).build()?;
    tokio::time::sleep(Duration::from_millis(1500)).await;
    let full = |target_width: f64| json!({ "x": 0, "y": 0, "width": 1920, "height": 1080, "scale": target_width / (1920.0 * dpr) });
    native_capture_series(&mut report, &out_dir, "hidden-window-960", &hidden, full(960.0), true).await;
    native_capture_series(&mut report, &out_dir, "hidden-window-1920", &hidden, full(1920.0), true).await;

    // The browser half of S3 found that a capture taken right after a content change is slow
    // (about 1.1 s) in a page the browser considers hidden. This is the real use: swap the slide
    // in the capture surface, then take the picture.
    writeln!(report, "\n== E. capture immediately after changing the content (10 swaps each)")?;
    for (label, window, clip_value, beyond, speed) in [
        ("hidden window", &hidden, full(960.0), true, false),
        ("hidden window, optimizeForSpeed", &hidden, full(960.0), true, true),
        ("visible main window", &main, clip(960.0), false, false),
    ] {
        let mut times = vec![];
        let mut seen = String::new();
        for i in 0..10 {
            let word = format!("SWAP-{i}{i}{i}");
            let started = Instant::now();
            let swap = json!({ "expression": format!("document.querySelector('.card').textContent = '{word}'; document.querySelector('.card').textContent"), "returnByValue": true });
            let swapped = cdp(window, "Runtime.evaluate", swap, Duration::from_secs(5)).await.map_err(anyhow::Error::msg)?;
            let params = json!({ "format": "png", "clip": clip_value, "captureBeyondViewport": beyond, "optimizeForSpeed": speed });
            let shot = cdp(window, "Page.captureScreenshot", params, Duration::from_secs(8)).await.map_err(anyhow::Error::msg)?;
            times.push(started.elapsed().as_secs_f64() * 1000.0);
            seen = swapped["result"]["value"].as_str().unwrap_or_default().to_owned();
            if i == 9 {
                let png = base64_decode(shot["data"].as_str().unwrap_or_default());
                let name = format!("after-change-{}.png", label.replace([' ', ','], "-"));
                let _ = std::fs::write(out_dir.join(&name), &png);
                writeln!(report, "  {label}: swap + capture {} | last picture ({} KB) should show {seen}: {name}", stats(times.clone()), png.len() / 1024)?;
            }
        }
    }

    main.minimize()?;
    tokio::time::sleep(Duration::from_millis(800)).await;
    native_capture_series(&mut report, &out_dir, "main-minimized-960", &main, clip(960.0), false).await;
    let mut times = vec![];
    for i in 0..10 {
        let started = Instant::now();
        let swap = json!({ "expression": format!("document.querySelector('.card').textContent = 'MIN-{i}{i}{i}'"), "returnByValue": true });
        cdp(&main, "Runtime.evaluate", swap, Duration::from_secs(5)).await.map_err(anyhow::Error::msg)?;
        let shot = capture(&main, clip(960.0), false).await.map_err(anyhow::Error::msg)?;
        times.push(started.elapsed().as_secs_f64() * 1000.0);
        if i == 9 {
            let _ = std::fs::write(out_dir.join("after-change-minimized.png"), base64_decode(&shot));
        }
    }
    writeln!(report, "  minimised main window: swap + capture {} | last picture should show MIN-999: after-change-minimized.png", stats(times))?;
    main.unminimize()?;

    Ok(report)
}

fn main() {
    let bridge = Arc::new(Bridge::default());
    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../out");
    let _ = std::fs::create_dir_all(&out_dir);

    tauri::Builder::default()
        .manage(bridge.clone())
        .invoke_handler(tauri::generate_handler![register_tools, tool_result, capture_region])
        .setup(move |app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let report = match scenario(handle.clone(), bridge, out_dir.clone()).await {
                    Ok(report) => report,
                    Err(e) => format!("SCENARIO FAILED: {e:#}"),
                };
                println!("{report}");
                let _ = std::fs::write(out_dir.join("report.txt"), &report);
                handle.exit(0);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start the spike app");
}
