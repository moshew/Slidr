//! The bridge end to end inside one process: real HTTP against the bound port, with a closure
//! standing in for the webview.

use std::{
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant},
};

use serde_json::{Value, json};
use tokio::{io::AsyncWriteExt, net::TcpStream, sync::mpsc, task::JoinSet};

use super::{
    Content, SessionEndpoint, ToolBridge, ToolCall, ToolDef, ToolReply, call_tool,
    client::{post, request_meta},
};

type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

/// One sample of every shape that crosses IPC; the webview's side is checked against the same
/// file (`apps/desktop/src/agent/toolBridge.test.ts`).
fn contract() -> serde_json::Result<Value> {
    let contract: Value = serde_json::from_str(include_str!("../harness/fixtures/contract.json"))?;
    Ok(contract["toolBridge"].clone())
}

/// A tool as the webview registers it, taking any arguments.
fn tool(name: &str) -> ToolDef {
    ToolDef {
        name: name.to_owned(),
        description: format!("Test tool {name}."),
        input_schema: json!({ "type": "object" })
            .as_object()
            .cloned()
            .unwrap_or_default(),
        timeout_ms: None,
    }
}

fn text(text: impl Into<String>) -> ToolReply {
    ToolReply {
        content: vec![Content::Text { text: text.into() }],
        is_error: false,
    }
}

/// The text of a reply's first part.
fn first_text(reply: &ToolReply) -> &str {
    match reply.content.first() {
        Some(Content::Text { text }) => text,
        _ => "",
    }
}

type Calls = Arc<Mutex<Vec<ToolCall>>>;

fn seen(calls: &Calls) -> Vec<ToolCall> {
    calls.lock().unwrap_or_else(PoisonError::into_inner).clone()
}

/// Connects a stand-in webview: a task that answers each call with what `run` makes of it, or
/// leaves it unanswered when `run` returns `None`. Returns the calls it received, in order.
fn connect(
    bridge: &Arc<ToolBridge>,
    run: impl Fn(&ToolCall) -> Option<ToolReply> + Send + 'static,
) -> Calls {
    let calls = Calls::default();
    let (sender, mut receiver) = mpsc::unbounded_channel::<ToolCall>();
    bridge.connect(move |call| sender.send(call).is_ok());
    let webview = Arc::downgrade(bridge);
    let received = Arc::clone(&calls);
    tokio::spawn(async move {
        while let Some(call) = receiver.recv().await {
            let reply = run(&call);
            let call_id = call.call_id.clone();
            received
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(call);
            if let (Some(reply), Some(bridge)) = (reply, webview.upgrade()) {
                bridge.reply(&call_id, reply);
            }
        }
    });
    calls
}

/// Waits until the webview has received `count` calls.
async fn received(calls: &Calls, count: usize) -> Result<(), &'static str> {
    let deadline = Instant::now() + Duration::from_secs(5);
    while seen(calls).len() < count {
        if Instant::now() > deadline {
            return Err("the call did not reach the webview");
        }
        tokio::time::sleep(Duration::from_millis(2)).await;
    }
    Ok(())
}

/// A request as protocol version 2026-07-28 sends it, which is how the agent's CLI talks
/// (ADR-002): no handshake, the version in a header and in `_meta`, the method and tool name in
/// headers.
async fn request(
    endpoint: &SessionEndpoint,
    method: &str,
    mut params: Value,
) -> std::io::Result<(u16, Value)> {
    params["_meta"] = request_meta();
    let name = params["name"].as_str().map(str::to_owned);
    let mut headers = vec![
        ("MCP-Protocol-Version", "2026-07-28"),
        ("Mcp-Method", method),
    ];
    if let Some(name) = &name {
        headers.push(("Mcp-Name", name));
    }
    let message = json!({ "jsonrpc": "2.0", "id": 7, "method": method, "params": params });
    post(&endpoint.url, &endpoint.token, &headers, &message).await
}

/// A request without any of that, as a client of an older protocol version sends it.
async fn plain_request(
    endpoint: &SessionEndpoint,
    method: &str,
    params: Value,
) -> std::io::Result<(u16, Value)> {
    let message = json!({ "jsonrpc": "2.0", "id": 7, "method": method, "params": params });
    post(&endpoint.url, &endpoint.token, &[], &message).await
}

async fn call(endpoint: &SessionEndpoint, name: &str, input: Value) -> Result<ToolReply, String> {
    call_tool(&endpoint.url, &endpoint.token, name, &input).await
}

#[test]
fn ipc_shapes_are_the_contract() -> TestResult {
    let contract = contract()?;
    // What the webview registers: the Deck API's listing as it is, or with a limit of its own.
    let tools: Vec<ToolDef> = serde_json::from_value(contract["tools"].clone())?;
    assert_eq!(tools[0].name, "slide_get");
    assert_eq!(tools[0].input_schema["required"], json!(["slideId"]));
    assert_eq!(tools[0].timeout(), Duration::from_secs(60), "MCP-04");
    assert_eq!(tools[1].timeout(), Duration::from_secs(300));

    let endpoint = SessionEndpoint {
        session_key: "k".into(),
        url: "http://127.0.0.1:5000/t/k".into(),
        token: "secret".into(),
    };
    assert_eq!(serde_json::to_value(endpoint)?, contract["endpoint"]);
    let call = ToolCall {
        call_id: "call_1".into(),
        session_key: "k".into(),
        name: "slide_get".into(),
        input: json!({ "slideId": "s_1" }),
    };
    assert_eq!(serde_json::to_value(call)?, contract["call"]);

    let replies: Vec<ToolReply> = serde_json::from_value(contract["replies"].clone())?;
    assert_eq!(
        replies[0].content[1],
        Content::Image {
            data: "iVBORw0KGgo=".into(),
            mime_type: "image/png".into()
        }
    );
    assert!(!replies[0].is_error && replies[1].is_error);
    Ok(())
}

/// Discovery, the tool list and two calls, in the wire form the agent's CLI uses.
#[tokio::test]
async fn lists_and_calls_the_way_the_cli_does() -> TestResult {
    let bridge = ToolBridge::new();
    let calls = connect(&bridge, |call| {
        Some(match call.name.as_str() {
            "slide_render" => ToolReply {
                content: vec![
                    Content::Text {
                        text: r#"{"slideId":"s_1"}"#.into(),
                    },
                    Content::Image {
                        data: "iVBORw0KGgo=".into(),
                        mime_type: "image/png".into(),
                    },
                ],
                is_error: false,
            },
            _ => text(r#"{"id":"s_1","name":"פתיחה"}"#),
        })
    });
    let tools: Vec<ToolDef> = serde_json::from_value(contract()?["tools"].clone())?;
    let endpoint = bridge
        .open(vec![tools[0].clone(), tool("slide_render")])
        .await?;
    assert!(endpoint.url.starts_with("http://127.0.0.1:"));
    assert!(
        endpoint
            .url
            .ends_with(&format!("/mcp/{}", endpoint.session_key))
    );
    assert_eq!((endpoint.session_key.len(), endpoint.token.len()), (32, 32));
    assert_ne!(endpoint.session_key, endpoint.token);

    let (status, discovered) = request(&endpoint, "server/discover", json!({})).await?;
    assert_eq!(status, 200, "{discovered}");
    let result = &discovered["result"];
    assert!(
        result["supportedVersions"]
            .as_array()
            .is_some_and(|versions| versions.contains(&json!("2026-07-28")))
    );
    assert!(result["capabilities"]["tools"].is_object());
    assert_eq!(
        result["_meta"]["io.modelcontextprotocol/serverInfo"]["name"],
        "slidr"
    );

    let (status, listed) = request(&endpoint, "tools/list", json!({})).await?;
    assert_eq!(status, 200, "{listed}");
    let result = &listed["result"];
    // ADR-002's trap: without these two the CLI drops the list and the model invents its calls.
    assert_eq!(result["ttlMs"], 0);
    assert_eq!(result["cacheScope"], "private");
    assert_eq!(
        result["tools"],
        json!([
            {
                "name": "slide_get",
                "description": "The full model of one slide.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "slideId": { "type": "string" } },
                    "required": ["slideId"]
                }
            },
            {
                "name": "slide_render",
                "description": "Test tool slide_render.",
                "inputSchema": { "type": "object" }
            }
        ]),
        "what the webview registered, and nothing else of it"
    );

    let arguments = json!({ "slideId": "s_1", "note": "שלום", "nested": { "n": [1, 2.5, null] } });
    let params = json!({ "name": "slide_get", "arguments": arguments });
    let (status, called) = request(&endpoint, "tools/call", params).await?;
    assert_eq!(status, 200, "{called}");
    assert_eq!(
        called["result"]["content"],
        json!([{ "type": "text", "text": r#"{"id":"s_1","name":"פתיחה"}"# }])
    );
    assert_eq!(called["result"]["isError"], false);

    let params = json!({ "name": "slide_render", "arguments": {} });
    let (_, rendered) = request(&endpoint, "tools/call", params).await?;
    assert_eq!(
        rendered["result"]["content"][1],
        json!({ "type": "image", "data": "iVBORw0KGgo=", "mimeType": "image/png" })
    );

    let calls = seen(&calls);
    assert_eq!(calls.len(), 2);
    assert_eq!(
        calls[0],
        ToolCall {
            call_id: calls[0].call_id.clone(),
            session_key: endpoint.session_key.clone(),
            name: "slide_get".into(),
            input: arguments,
        }
    );
    assert_ne!(calls[0].call_id, calls[1].call_id);
    assert_eq!(calls[1].input, json!({}));
    Ok(())
}

/// A client of an earlier protocol version: `initialize`, then requests with no version on them.
#[tokio::test]
async fn serves_a_client_that_starts_with_a_handshake() -> TestResult {
    let bridge = ToolBridge::new();
    connect(&bridge, |call| Some(text(format!("ran {}", call.name))));
    let endpoint = bridge.open(vec![tool("slide_get")]).await?;

    let params = json!({
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": { "name": "test", "version": "0" }
    });
    let (status, initialized) = plain_request(&endpoint, "initialize", params).await?;
    assert_eq!(status, 200, "{initialized}");
    assert_eq!(initialized["result"]["serverInfo"]["name"], "slidr");
    assert_eq!(initialized["result"]["protocolVersion"], "2025-06-18");
    assert!(initialized["result"]["capabilities"]["tools"].is_object());

    let (status, listed) = plain_request(&endpoint, "tools/list", json!({})).await?;
    assert_eq!(status, 200, "{listed}");
    assert_eq!(listed["result"]["tools"][0]["name"], "slide_get");

    let params = json!({ "name": "slide_get", "arguments": { "slideId": "s_1" } });
    let (status, called) = plain_request(&endpoint, "tools/call", params).await?;
    assert_eq!(status, 200, "{called}");
    assert_eq!(called["result"]["content"][0]["text"], "ran slide_get");
    Ok(())
}

/// ADR-002 left this unmeasured: several sessions at once, each with its own tools, its own
/// token, and its own calls.
#[tokio::test(flavor = "multi_thread")]
async fn sessions_reach_only_their_own_tools_and_calls() -> TestResult {
    let bridge = ToolBridge::new();
    let calls = connect(&bridge, |call| {
        Some(text(format!("{} {}", call.session_key, call.input["n"])))
    });
    let deck = bridge
        .open(vec![tool("slide_get"), tool("slide_delete")])
        .await?;
    let slide = bridge
        .open(vec![tool("slide_get"), tool("text_set")])
        .await?;
    let object = bridge.open(vec![tool("element_get")]).await?;
    let port = |endpoint: &SessionEndpoint| endpoint.url.split('/').nth(2).map(str::to_owned);
    assert_eq!(port(&deck), port(&slide), "one server for all sessions");

    // Each session lists what was registered for it.
    for (endpoint, expected) in [
        (&deck, json!(["slide_get", "slide_delete"])),
        (&slide, json!(["slide_get", "text_set"])),
        (&object, json!(["element_get"])),
    ] {
        let (_, listed) = request(endpoint, "tools/list", json!({})).await?;
        let names: Vec<&Value> = listed["result"]["tools"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|tool| &tool["name"])
            .collect();
        assert_eq!(json!(names), expected);
    }

    // Thirty calls at once, ten per session: every answer is the one made for its own session.
    let mut running = JoinSet::new();
    for n in 0..10 {
        for (endpoint, name) in [
            (&deck, "slide_delete"),
            (&slide, "text_set"),
            (&object, "element_get"),
        ] {
            let endpoint = endpoint.clone();
            running.spawn(async move {
                let reply = call(&endpoint, name, json!({ "n": n })).await;
                (endpoint.session_key, n, reply)
            });
        }
    }
    let mut answered = 0;
    while let Some(joined) = running.join_next().await {
        let (session_key, n, reply) = joined?;
        assert_eq!(reply?, text(format!("{session_key} {n}")));
        answered += 1;
    }
    assert_eq!(answered, 30);
    let per_session = |endpoint: &SessionEndpoint| {
        seen(&calls)
            .iter()
            .filter(|call| call.session_key == endpoint.session_key)
            .count()
    };
    assert_eq!(
        [&deck, &slide, &object].map(per_session),
        [10, 10, 10],
        "MCP-02"
    );

    // A tool of another session is not there to call, and the webview never hears of it.
    let reply = call(&object, "slide_delete", json!({})).await?;
    assert!(reply.is_error);
    assert_eq!(
        first_text(&reply),
        "There is no tool named \"slide_delete\" in this session."
    );
    assert_eq!(seen(&calls).len(), 30);

    // One session's token does not open another's path.
    let crossed = SessionEndpoint {
        token: deck.token.clone(),
        ..slide.clone()
    };
    assert_eq!(request(&crossed, "tools/list", json!({})).await?.0, 401);
    Ok(())
}

#[tokio::test]
async fn refuses_a_wrong_token_an_unknown_key_and_a_closed_session() -> TestResult {
    let bridge = ToolBridge::new();
    let calls = connect(&bridge, |_| Some(text("ok")));
    let endpoint = bridge.open(vec![tool("slide_get")]).await?;
    let with = |url: &str, token: &str| SessionEndpoint {
        session_key: endpoint.session_key.clone(),
        url: url.to_owned(),
        token: token.to_owned(),
    };
    let list = |endpoint: SessionEndpoint| async move {
        request(&endpoint, "tools/list", json!({})).await
    };

    assert_eq!(list(endpoint.clone()).await?.0, 200);
    let unknown = endpoint
        .url
        .replace(&endpoint.session_key, "0123456789abcdef");
    for refused in [
        with(&endpoint.url, "not-the-token"),
        with(&endpoint.url, ""),
        with(&endpoint.url, &endpoint.token[..31]),
        with(&unknown, &endpoint.token),
        with(&endpoint.url.replace("/mcp/", "/mcp/x/"), &endpoint.token),
    ] {
        let url = refused.url.clone();
        let (status, body) = list(refused).await?;
        assert_eq!((status, body), (401, Value::Null), "{url}");
    }
    let refused = call(
        &with(&endpoint.url, "not-the-token"),
        "slide_get",
        json!({}),
    )
    .await;
    assert_eq!(refused, Err("the tool endpoint answered 401".into()));
    assert!(seen(&calls).is_empty(), "nothing reached the webview");

    // A closed session is as unknown as one that never was. Closing twice is harmless.
    bridge.close(&endpoint.session_key);
    bridge.close(&endpoint.session_key);
    assert_eq!(list(endpoint.clone()).await?.0, 401);
    // The server goes on serving the others.
    let next = bridge.open(vec![tool("slide_get")]).await?;
    assert_eq!(list(next).await?.0, 200);
    Ok(())
}

/// MCP-04: the limit is the tool's own when it sets one.
#[tokio::test]
async fn a_call_waits_no_longer_than_its_tool_allows() -> TestResult {
    let bridge = ToolBridge::new();
    let calls = connect(&bridge, |_| None);
    let slow = ToolDef {
        timeout_ms: Some(80),
        ..tool("image_generate")
    };
    let endpoint = bridge.open(vec![slow]).await?;

    let began = Instant::now();
    let reply = call(&endpoint, "image_generate", json!({})).await?;
    let waited = began.elapsed();
    assert!(waited >= Duration::from_millis(80), "{waited:?}");
    assert!(waited < Duration::from_secs(10), "{waited:?}");
    assert!(reply.is_error);
    assert_eq!(
        first_text(&reply),
        "image_generate did not answer within 0.08 s. It may still finish in the app, so look \
         at the deck before calling it again."
    );
    // The webview's answer arrives too late, and is told so.
    let call_id = seen(&calls)[0].call_id.clone();
    assert!(!bridge.reply(&call_id, text("late")));
    assert!(bridge.lock().waiting.is_empty());
    Ok(())
}

#[tokio::test]
async fn a_failed_tool_reaches_the_agent_as_an_error_it_can_read() -> TestResult {
    let bridge = ToolBridge::new();
    connect(&bridge, |_| {
        Some(ToolReply {
            content: vec![Content::Text {
                text: "Slide \"s_9\" does not exist. It may have been deleted.".into(),
            }],
            is_error: true,
        })
    });
    let endpoint = bridge.open(vec![tool("slide_get")]).await?;
    let params = json!({ "name": "slide_get", "arguments": { "slideId": "s_9" } });
    let (status, called) = request(&endpoint, "tools/call", params).await?;
    // A result, not a protocol error: agents show the latter without its message.
    assert_eq!(status, 200);
    assert!(called["error"].is_null(), "{called}");
    assert_eq!(called["result"]["isError"], true);
    assert_eq!(
        called["result"]["content"],
        json!([{ "type": "text",
                 "text": "Slide \"s_9\" does not exist. It may have been deleted." }])
    );
    Ok(())
}

#[tokio::test]
async fn an_unknown_tool_is_answered_without_the_webview() -> TestResult {
    let bridge = ToolBridge::new();
    let calls = connect(&bridge, |_| Some(text("ok")));
    let endpoint = bridge.open(vec![tool("slide_get")]).await?;
    let params = json!({ "name": "slide_explode", "arguments": {} });
    let (status, called) = request(&endpoint, "tools/call", params).await?;
    assert_eq!(status, 200);
    assert_eq!(called["result"]["isError"], true);
    assert_eq!(
        called["result"]["content"][0]["text"],
        "There is no tool named \"slide_explode\" in this session."
    );
    assert!(seen(&calls).is_empty());
    Ok(())
}

#[tokio::test]
async fn a_call_before_the_webview_connects_or_after_it_is_gone_fails_at_once() -> TestResult {
    let bridge = ToolBridge::new();
    let endpoint = bridge.open(vec![tool("slide_get")]).await?;
    let reply = call(&endpoint, "slide_get", json!({})).await?;
    assert!(reply.is_error);
    assert_eq!(first_text(&reply), "The app is not ready to run tools yet.");

    bridge.connect(|_| false);
    let reply = call(&endpoint, "slide_get", json!({})).await?;
    assert!(reply.is_error);
    assert_eq!(
        first_text(&reply),
        "slide_get was not run: the app window is not available."
    );
    assert!(bridge.lock().waiting.is_empty());
    Ok(())
}

/// The webview reloads: it connects again, and what the page before it was asked is lost.
#[tokio::test]
async fn a_reloaded_webview_takes_over() -> TestResult {
    let bridge = ToolBridge::new();
    let before = connect(&bridge, |_| None);
    let endpoint = bridge.open(vec![tool("slide_get")]).await?;

    let waiting = {
        let endpoint = endpoint.clone();
        tokio::spawn(async move { call(&endpoint, "slide_get", json!({ "n": 1 })).await })
    };
    received(&before, 1).await?;
    let after = connect(&bridge, |call| {
        Some(text(format!("reloaded {}", call.input["n"])))
    });

    // The call the old page never answered fails now, not after its 60 s.
    let dropped = tokio::time::timeout(Duration::from_secs(5), waiting).await???;
    assert!(dropped.is_error);
    assert_eq!(
        first_text(&dropped),
        "slide_get was dropped: its session closed or the app window reloaded."
    );
    // The session is still open, and its calls go to the new page only.
    let reply = call(&endpoint, "slide_get", json!({ "n": 2 })).await?;
    assert_eq!(reply, text("reloaded 2"));
    assert_eq!(seen(&before).len(), 1);
    assert_eq!(seen(&after).len(), 1);
    assert_eq!(seen(&after)[0].session_key, endpoint.session_key);
    Ok(())
}

#[tokio::test]
async fn closing_a_session_fails_its_waiting_call() -> TestResult {
    let bridge = ToolBridge::new();
    let calls = connect(&bridge, |_| None);
    let closing = bridge.open(vec![tool("slide_get")]).await?;
    let staying = bridge.open(vec![tool("slide_get")]).await?;

    let spawn = |endpoint: &SessionEndpoint| {
        let endpoint = endpoint.clone();
        tokio::spawn(async move { call(&endpoint, "slide_get", json!({})).await })
    };
    let (closed, kept) = (spawn(&closing), spawn(&staying));
    received(&calls, 2).await?;
    bridge.close(&closing.session_key);

    let reply = tokio::time::timeout(Duration::from_secs(5), closed).await???;
    assert!(reply.is_error);
    assert_eq!(
        first_text(&reply),
        "slide_get was dropped: its session closed or the app window reloaded."
    );
    assert_eq!(
        call(&closing, "slide_get", json!({})).await,
        Err("the tool endpoint answered 401".into())
    );
    // The other session's call is still waiting, and its answer still arrives.
    let other = seen(&calls)
        .into_iter()
        .find(|call| call.session_key == staying.session_key)
        .ok_or("the other session's call")?;
    assert!(bridge.reply(&other.call_id, text("still here")));
    assert_eq!(kept.await??, text("still here"));
    Ok(())
}

/// An interrupted turn: the agent drops its connection in the middle of a call.
#[tokio::test]
async fn a_call_the_agent_gives_up_is_forgotten() -> TestResult {
    let bridge = ToolBridge::new();
    let calls = connect(&bridge, |_| None);
    let endpoint = bridge.open(vec![tool("slide_get")]).await?;

    let authority = endpoint.url.split('/').nth(2).ok_or("no authority")?;
    let path = endpoint
        .url
        .split_once(authority)
        .map_or("", |(_, path)| path);
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": { "name": "slide_get", "arguments": {} } })
    .to_string();
    let mut connection = TcpStream::connect(authority).await?;
    connection
        .write_all(
            format!(
                "POST {path} HTTP/1.1\r\nHost: {authority}\r\nAuthorization: Bearer {}\r\n\
                 Content-Type: application/json\r\nAccept: application/json, text/event-stream\r\n\
                 Content-Length: {}\r\n\r\n{body}",
                endpoint.token,
                body.len()
            )
            .as_bytes(),
        )
        .await?;
    received(&calls, 1).await?;
    assert_eq!(bridge.lock().waiting.len(), 1);
    drop(connection);

    let deadline = Instant::now() + Duration::from_secs(5);
    while !bridge.lock().waiting.is_empty() {
        assert!(Instant::now() < deadline, "the call is still waiting");
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert!(!bridge.reply(&seen(&calls)[0].call_id, text("too late")));
    Ok(())
}

/// What the bridge adds to a call: HTTP on loopback, the protocol, the session lookup and the
/// hand-over, with a webview that answers at once. The IPC leg to a real webview is not in it.
/// Run: `cargo test -p slidr --release measures_the_round_trip -- --ignored --nocapture`.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "a measurement, not a check"]
async fn measures_the_round_trip() -> TestResult {
    let bridge = ToolBridge::new();
    let image = "A".repeat(200 * 1024);
    connect(&bridge, move |call| {
        Some(if call.name == "slide_render" {
            ToolReply {
                content: vec![Content::Image {
                    data: image.clone(),
                    mime_type: "image/png".into(),
                }],
                is_error: false,
            }
        } else {
            text(r#"{"id":"s_1"}"#)
        })
    });
    let endpoint = bridge
        .open(vec![tool("slide_get"), tool("slide_render")])
        .await?;
    for (name, label) in [
        ("slide_get", "text result"),
        ("slide_render", "200 KB image result"),
    ] {
        let mut samples = Vec::new();
        for n in 0..520 {
            let began = Instant::now();
            let reply = call(&endpoint, name, json!({ "slideId": "s_1" })).await?;
            assert!(!reply.is_error);
            // The first calls warm the connection path up.
            if n >= 20 {
                samples.push(began.elapsed().as_secs_f64() * 1000.0);
            }
        }
        samples.sort_by(f64::total_cmp);
        let at = |q: f64| samples[((samples.len() - 1) as f64 * q).round() as usize];
        println!(
            "{label}: n={} median={:.3} ms p95={:.3} ms max={:.3} ms",
            samples.len(),
            at(0.5),
            at(0.95),
            at(1.0)
        );
    }
    Ok(())
}
