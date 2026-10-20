//! A client of the bridge's own server: one tool call as one HTTP exchange, in the form protocol
//! version 2026-07-28 gives it (no handshake; the version travels with the request). For an agent
//! that lives in this process, which is the scripted harness, and for the tests. A real agent
//! brings its own client.

use std::io;

use serde_json::{Value, json};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use super::ToolReply;

const PROTOCOL_VERSION: &str = "2026-07-28";

/// What every request of that version carries in `params._meta`.
pub(super) fn request_meta() -> Value {
    json!({
        "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientCapabilities": {},
    })
}

/// Calls `name` with the arguments `input` at a session's endpoint (`url` and `token` of a
/// `SessionEndpoint`). `Err` is a call that did not get through: the endpoint refused it or
/// could not be reached. A tool that ran and failed is a reply with `is_error`.
pub async fn call_tool(
    url: &str,
    token: &str,
    name: &str,
    input: &Value,
) -> std::result::Result<ToolReply, String> {
    let plain = |c: char| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.';
    if name.is_empty() || !name.chars().all(plain) {
        // It travels in a header.
        return Err(format!("invalid tool name {name:?}"));
    }
    let message = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": { "name": name, "arguments": input, "_meta": request_meta() },
    });
    let headers = [
        ("MCP-Protocol-Version", PROTOCOL_VERSION),
        ("Mcp-Method", "tools/call"),
        ("Mcp-Name", name),
    ];
    let (status, body) = post(url, token, &headers, &message)
        .await
        .map_err(|e| format!("could not reach the tool endpoint: {e}"))?;
    if let Some(error) = body["error"]["message"].as_str() {
        return Err(error.to_owned());
    }
    if status != 200 {
        return Err(format!("the tool endpoint answered {status}"));
    }
    serde_json::from_value(body["result"].clone())
        .map_err(|e| format!("the tool endpoint sent a result this client cannot read: {e}"))
}

/// One HTTP/1.1 exchange with the local server: `message` as the JSON body of a POST to `url`.
/// Returns the status and the body: parsed when it is JSON, `Null` when empty, otherwise the
/// text. The server answers a request with one complete JSON body and closes when asked, so
/// reading to the end of the connection is the whole response.
pub(super) async fn post(
    url: &str,
    token: &str,
    headers: &[(&str, &str)],
    message: &Value,
) -> io::Result<(u16, Value)> {
    let invalid = |what: &str| io::Error::new(io::ErrorKind::InvalidData, what.to_owned());
    let (authority, path) = url
        .strip_prefix("http://")
        .and_then(|rest| rest.split_once('/'))
        .ok_or_else(|| invalid("not a local tool endpoint URL"))?;
    let body = message.to_string();
    let mut request = format!(
        "POST /{path} HTTP/1.1\r\nHost: {authority}\r\nAuthorization: Bearer {token}\r\n\
         Content-Type: application/json\r\nAccept: application/json, text/event-stream\r\n\
         Content-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (name, value) in headers {
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    request.push_str("\r\n");
    request.push_str(&body);

    let mut stream = TcpStream::connect(authority).await?;
    stream.write_all(request.as_bytes()).await?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await?;

    let end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| invalid("the response has no header end"))?;
    let head = String::from_utf8_lossy(&response[..end]);
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| invalid("the response has no status"))?;
    let text = String::from_utf8_lossy(&response[end + 4..]);
    let body = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text.into_owned()))
    };
    Ok((status, body))
}
