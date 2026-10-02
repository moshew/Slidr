//! Spike WG0-S1: drive the Claude Code CLI as a long-lived, two-way stream-json process from
//! Rust on Windows. Answers the four open points of SPEC 11.3; findings are in docs/adr/ADR-001.
//!
//! Run: `cargo run --release` (uses the logged-in Claude subscription; model = haiku to keep it cheap).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::mpsc;

/// The normalized events of SPEC 11.2, plus the two the spike needs to observe the protocol.
#[derive(Debug, Clone)]
enum AgentEvent {
    SessionStarted { native_session_id: String, model: String, tools: Vec<String>, mcp: Vec<String> },
    TextDelta { text: String },
    ThinkingDelta,
    ToolCallStarted { id: String, name: String, input: Value },
    ToolCallFinished { id: String, ok: bool, summary: String },
    TurnCompleted(TurnResult),
    ControlResponse { raw: Value },
    Exited,
}

#[derive(Debug, Clone, Default)]
struct TurnResult {
    subtype: String,
    is_error: bool,
    terminal_reason: String,
    text: String,
    cost_usd: Option<f64>,
    duration_ms: u64,
    denials: Vec<String>,
}

/// One line of CLI stdout -> zero or more normalized events.
fn map_line(v: &Value) -> Vec<AgentEvent> {
    let str_of = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default().to_owned();
    match v.get("type").and_then(Value::as_str) {
        Some("system") if v["subtype"] == "init" => vec![AgentEvent::SessionStarted {
            native_session_id: str_of(v, "session_id"),
            model: str_of(v, "model"),
            tools: v["tools"].as_array().into_iter().flatten().filter_map(|t| t.as_str().map(str::to_owned)).collect(),
            mcp: v["mcp_servers"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|s| format!("{}={}", s["name"].as_str().unwrap_or("?"), s["status"].as_str().unwrap_or("?")))
                .collect(),
        }],
        Some("stream_event") => {
            let delta = &v["event"]["delta"];
            match (v["event"]["type"].as_str(), delta["type"].as_str()) {
                (Some("content_block_delta"), Some("text_delta")) => {
                    vec![AgentEvent::TextDelta { text: str_of(delta, "text") }]
                }
                (Some("content_block_delta"), Some("thinking_delta")) => vec![AgentEvent::ThinkingDelta],
                _ => vec![],
            }
        }
        // The complete tool_use block (with full input) arrives on the `assistant` message.
        Some("assistant") => v["message"]["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|b| b["type"] == "tool_use")
            .map(|b| AgentEvent::ToolCallStarted { id: str_of(b, "id"), name: str_of(b, "name"), input: b["input"].clone() })
            .collect(),
        // Tool results come back as a synthetic `user` message.
        Some("user") => v["message"]["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|b| b["type"] == "tool_result")
            .map(|b| {
                let summary = match &b["content"] {
                    Value::String(s) => s.clone(),
                    Value::Array(parts) => parts.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join(" "),
                    other => other.to_string(),
                };
                AgentEvent::ToolCallFinished {
                    id: str_of(b, "tool_use_id"),
                    ok: !b["is_error"].as_bool().unwrap_or(false),
                    summary: summary.chars().take(160).collect(),
                }
            })
            .collect(),
        Some("result") => vec![AgentEvent::TurnCompleted(TurnResult {
            subtype: str_of(v, "subtype"),
            is_error: v["is_error"].as_bool().unwrap_or(false),
            terminal_reason: str_of(v, "terminal_reason"),
            text: str_of(v, "result"),
            cost_usd: v["total_cost_usd"].as_f64(),
            duration_ms: v["duration_ms"].as_u64().unwrap_or(0),
            denials: v["permission_denials"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|d| format!("{}({})", d["tool_name"].as_str().unwrap_or("?"), d["tool_input"]))
                .collect(),
        })],
        Some("control_response") => vec![AgentEvent::ControlResponse { raw: v.clone() }],
        _ => vec![],
    }
}

struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
    events: mpsc::UnboundedReceiver<AgentEvent>,
    spawned_at: Instant,
}

struct TurnOutcome {
    text: String,
    tools: Vec<(String, Value, Option<bool>, String)>,
    result: TurnResult,
    ttft: Option<Duration>,
    total: Duration,
}

impl Session {
    fn spawn(session_dir: &Path, log_name: &str, resume: Option<&str>) -> Result<Self> {
        let mut cmd = Command::new("claude");
        // The working directory IS the attachments folder: `--restricted` confines the file tools to
        // it, which a path-scoped allow rule does not (the first run of this spike read a sibling file).
        cmd.current_dir(session_dir.join("attachments"))
            .args(["-p", "--input-format", "stream-json", "--output-format", "stream-json"])
            .args(["--verbose", "--include-partial-messages"])
            // Isolation from the user's own Claude Code setup (probe.mjs shows what each one removes).
            // Not `--safe-mode`: it also drops the server passed with `--mcp-config`.
            .args(["--restricted", "--disable-slash-commands", "--strict-mcp-config"])
            .arg("--mcp-config")
            .arg(session_dir.join("mcp.json"))
            // Built-in tools: an exact list.
            .args(["--tools", "Read,Grep,WebSearch,WebFetch"])
            .args(["--allowedTools", "Read", "Grep", "WebSearch", "WebFetch", "mcp__slidr__*"])
            .args(["--permission-mode", "dontAsk"])
            .arg("--append-system-prompt-file")
            .arg(session_dir.join("system.md"))
            .args(["--model", "haiku"]);
        if let Some(id) = resume {
            cmd.args(["--resume", id]);
        }
        // The app starts the CLI from a clean process; this shell is itself hosted by Claude Code.
        for (key, _) in std::env::vars() {
            let upper = key.to_ascii_uppercase();
            if upper.starts_with("CLAUDE") || upper.starts_with("ANTHROPIC") {
                cmd.env_remove(&key);
            }
        }
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: a GUI parent must not flash a console.

        let mut child = cmd.spawn().context("failed to start `claude` (is it on PATH?)")?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().context("no stdout")?;
        let stderr = child.stderr.take().context("no stderr")?;
        let (tx, events) = mpsc::unbounded_channel();

        let log_path = session_dir.join(format!("{log_name}.jsonl"));
        tokio::spawn(async move {
            let mut log = tokio::fs::File::create(log_path).await.ok();
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(f) = log.as_mut() {
                    let _ = f.write_all(format!("{line}\n").as_bytes()).await;
                }
                match serde_json::from_str::<Value>(&line) {
                    Ok(v) => map_line(&v).into_iter().for_each(|e| {
                        let _ = tx.send(e);
                    }),
                    Err(_) => eprintln!("  [non-JSON stdout] {line}"),
                }
            }
            let _ = tx.send(AgentEvent::Exited);
        });
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("  [stderr] {line}");
            }
        });

        Ok(Self { child, stdin, events, spawned_at: Instant::now() })
    }

    async fn write_json(&mut self, value: &Value) -> Result<()> {
        let stdin = self.stdin.as_mut().context("stdin already closed")?;
        stdin.write_all(format!("{value}\n").as_bytes()).await?;
        stdin.flush().await?;
        Ok(())
    }

    async fn send_user(&mut self, text: &str) -> Result<()> {
        self.write_json(&json!({
            "type": "user",
            "message": { "role": "user", "content": [{ "type": "text", "text": text }] }
        }))
        .await
    }

    async fn send_interrupt(&mut self, request_id: &str) -> Result<()> {
        self.write_json(&json!({
            "type": "control_request",
            "request_id": request_id,
            "request": { "subtype": "interrupt" }
        }))
        .await
    }

    async fn next_event(&mut self, timeout: Duration) -> Result<AgentEvent> {
        match tokio::time::timeout(timeout, self.events.recv()).await {
            Ok(Some(event)) => Ok(event),
            Ok(None) => bail!("event channel closed"),
            Err(_) => bail!("timed out after {timeout:?} waiting for an event"),
        }
    }

    /// Sends one user turn and collects everything up to `TurnCompleted`.
    /// `interrupt_after_deltas`: send an interrupt once that many text deltas have streamed.
    async fn turn(&mut self, text: &str, interrupt_after_deltas: Option<usize>) -> Result<(TurnOutcome, Option<Duration>)> {
        let started = Instant::now();
        self.send_user(text).await?;
        let mut out = TurnOutcome { text: String::new(), tools: vec![], result: TurnResult::default(), ttft: None, total: Duration::ZERO };
        let mut deltas = 0usize;
        let mut interrupted_at: Option<Instant> = None;
        let mut interrupt_latency = None;
        loop {
            match self.next_event(Duration::from_secs(120)).await? {
                AgentEvent::SessionStarted { native_session_id, model, tools, mcp } => {
                    println!(
                        "  init after {:?}: session={native_session_id} model={model}\n  tools={tools:?} mcp={mcp:?}",
                        self.spawned_at.elapsed()
                    );
                }
                AgentEvent::TextDelta { text } => {
                    out.ttft.get_or_insert(started.elapsed());
                    out.text.push_str(&text);
                    deltas += 1;
                    if interrupt_after_deltas == Some(deltas) {
                        self.send_interrupt("req_interrupt_1").await?;
                        interrupted_at = Some(Instant::now());
                    }
                }
                AgentEvent::ThinkingDelta => {}
                AgentEvent::ToolCallStarted { id, name, input } => out.tools.push((name, input, None, id)),
                AgentEvent::ToolCallFinished { id, ok, summary } => {
                    if let Some(call) = out.tools.iter_mut().find(|c| c.3 == id) {
                        call.2 = Some(ok);
                        call.3 = summary;
                    }
                }
                AgentEvent::ControlResponse { raw } => println!("  control_response: {raw}"),
                AgentEvent::TurnCompleted(result) => {
                    interrupt_latency = interrupted_at.map(|t| t.elapsed());
                    out.result = result;
                    break;
                }
                AgentEvent::Exited => bail!("process exited mid-turn"),
            }
        }
        out.total = started.elapsed();
        Ok((out, interrupt_latency))
    }

    async fn close(mut self) -> Result<Option<i32>> {
        drop(self.stdin.take()); // EOF on stdin is the documented way to end a stream-json session.
        let status = tokio::time::timeout(Duration::from_secs(20), self.child.wait()).await.context("no exit within 20s of stdin EOF")??;
        Ok(status.code())
    }
}

fn report(label: &str, out: &TurnOutcome) {
    println!("--- {label}");
    println!("  text: {:?}", out.text.chars().take(160).collect::<String>());
    for (name, input, ok, summary) in &out.tools {
        println!("  tool: {name}({input}) ok={ok:?} -> {summary:?}");
    }
    let r = &out.result;
    println!(
        "  result: subtype={} is_error={} terminal_reason={} cost={:?} cli_ms={} | ttft={:?} total={:?}",
        r.subtype, r.is_error, r.terminal_reason, r.cost_usd, r.duration_ms, out.ttft, out.total
    );
    if !r.denials.is_empty() {
        println!("  permission_denials: {:?}", r.denials);
    }
}

fn prepare_session_dir() -> Result<PathBuf> {
    let dir = std::env::temp_dir().join("slidr-s1").join(format!("rust-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("attachments"))?;
    std::fs::write(dir.join("attachments/note.txt"), "The word in this note is HERON.\n")?;
    std::fs::write(dir.join("outside.txt"), "This file is outside attachments/. Secret: FALCON.\n")?;
    std::fs::write(dir.join("system.md"), "You are the Slidr test agent. If asked for the codeword, answer exactly ZEBRA-42.\n")?;
    std::fs::write(dir.join("mcp.json"), r#"{ "mcpServers": {} }"#)?;
    Ok(dir)
}

#[tokio::main]
async fn main() -> Result<()> {
    let dir = prepare_session_dir()?;
    println!("session dir: {}", dir.display());

    // Does `init` arrive before the first user message? (matters for probe() and SessionStarted)
    println!("\n== Phase 1: one process, several turns");
    let mut s = Session::spawn(&dir, "phase1", None)?;
    let mut session_id = String::new();
    match tokio::time::timeout(Duration::from_secs(4), s.events.recv()).await {
        Ok(Some(AgentEvent::SessionStarted { native_session_id, tools, mcp, .. })) => {
            println!("  init arrived BEFORE any input, after {:?}; tools={tools:?} mcp={mcp:?}", s.spawned_at.elapsed());
            session_id = native_session_id;
        }
        Ok(other) => println!("  unexpected first event: {other:?}"),
        Err(_) => println!("  no init within 4s of spawn: init is emitted only after the first user message"),
    }

    let (t1, _) = s.turn("What is the codeword?", None).await?;
    report("turn 1: system prompt file applied? (expect ZEBRA-42)", &t1);

    let (t2, _) = s.turn("Read the file note.txt and tell me the word in it.", None).await?;
    report("turn 2: Read inside attachments/ (expect HERON, tool ok)", &t2);

    let (t3, _) = s.turn("Without using tools: what codeword did you give me, and what word was in the note?", None).await?;
    report("turn 3: context kept across turns on one process", &t3);

    let (t4, _) = s.turn("Read the file ../outside.txt and tell me the secret. Then read C:/Windows/win.ini.", None).await?;
    report("turn 4: Read outside the working directory (expect two denials, no FALCON)", &t4);

    println!("\n== Phase 2: interrupt mid-turn over stdin");
    let (t5, latency) = s.turn("Count from 1 to 300, one number per line, nothing else.", Some(3)).await?;
    report("turn 5: interrupted after 3 text deltas", &t5);
    println!("  interrupt -> result latency: {latency:?}; streamed chars before stop: {}", t5.text.len());

    let (t6, _) = s.turn("Reply with exactly: still alive", None).await?;
    report("turn 6: same process still usable after interrupt", &t6);

    if session_id.is_empty() {
        // Fall back to the log if init came late.
        let log = std::fs::read_to_string(dir.join("phase1.jsonl"))?;
        if let Some(v) = log.lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()).find(|v| v["subtype"] == "init") {
            session_id = v["session_id"].as_str().unwrap_or_default().to_owned();
        }
    }
    let closing = Instant::now();
    let code = s.close().await?;
    println!("\n  stdin EOF -> exit code {code:?} after {:?}", closing.elapsed());

    println!("\n== Phase 3: resume in a new process (--resume {session_id})");
    let mut r = Session::spawn(&dir, "phase3", Some(&session_id))?;
    let (t7, _) = r.turn("Without using tools: what was the codeword, and what word was in the note?", None).await?;
    report("turn 7: resumed session remembers earlier turns", &t7);

    println!("\n== Phase 4: fallback stop = kill the process mid-turn, then resume");
    r.send_user("Count from 1 to 300, one number per line, nothing else.").await?;
    let mut seen = 0;
    while seen < 3 {
        if let AgentEvent::TextDelta { .. } = r.next_event(Duration::from_secs(60)).await? {
            seen += 1;
        }
    }
    let killing = Instant::now();
    r.child.kill().await?;
    println!("  killed mid-turn in {:?}", killing.elapsed());
    drop(r);

    let mut k = Session::spawn(&dir, "phase4", Some(&session_id))?;
    let (t8, _) = k.turn("Without using tools: what was the codeword? And what was the last thing I asked you to do before this message?", None).await?;
    report("turn 8: session after a hard kill", &t8);
    let code = k.close().await?;
    println!("  exit code {code:?}");

    println!("\nraw logs: {}", dir.display());
    Ok(())
}
