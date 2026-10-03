//! The IPC surface of the tool bridge. Thin: the logic is in [`ToolBridge`].
//!
//! Argument names are camelCase on the JavaScript side (`onCall`, `sessionKey`, `callId`).
//! Calls reach the webview on the `Channel` it passed to `tool_bridge_connect`, in order, and it
//! answers each with `tool_bridge_reply`. The webview's side is
//! `apps/desktop/src/agent/toolBridge.ts`.

use std::sync::Arc;

use tauri::{State, ipc::Channel};

use super::{SessionEndpoint, ToolBridge, ToolCall, ToolDef, ToolReply};
use crate::harness::Result;

type Bridge<'a> = State<'a, Arc<ToolBridge>>;

/// `tool_bridge_connect({ onCall })`: this webview runs the tools from now on.
#[tauri::command]
pub async fn tool_bridge_connect(bridge: Bridge<'_>, on_call: Channel<ToolCall>) -> Result<()> {
    // Fails only when the webview is gone.
    bridge.connect(move |call| on_call.send(call).is_ok());
    Ok(())
}

/// `tool_bridge_open({ tools })`: opens a session that offers `tools`; returns its endpoint.
#[tauri::command]
pub async fn tool_bridge_open(bridge: Bridge<'_>, tools: Vec<ToolDef>) -> Result<SessionEndpoint> {
    bridge.open(tools).await
}

/// `tool_bridge_close({ sessionKey })`: ends the session.
#[tauri::command]
pub async fn tool_bridge_close(bridge: Bridge<'_>, session_key: String) -> Result<()> {
    bridge.close(&session_key);
    Ok(())
}

/// `tool_bridge_reply({ callId, reply })`: the answer to a call. `false`: nothing waited for it.
#[tauri::command]
pub async fn tool_bridge_reply(
    bridge: Bridge<'_>,
    call_id: String,
    reply: ToolReply,
) -> Result<bool> {
    Ok(bridge.reply(&call_id, reply))
}
