//! The protocol side of the bridge: an MCP server over Streamable HTTP (rmcp on axum), bound to
//! 127.0.0.1 on a random port (MCP-01, SEC-01). Every session has a path and a bearer token of
//! its own (MCP-02); a request that does not carry both gets 401 before the protocol sees it.
//!
//! No sessions on the protocol level and plain JSON answers: each request stands alone, as in
//! protocol version 2026-07-28, so closing a bridge session leaves nothing behind here.

use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{StatusCode, header::AUTHORIZATION, request::Parts},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    model::{
        CacheScope, CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock,
        Implementation, ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig,
        Tool,
    },
    service::RequestContext,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::never::NeverSessionManager,
    },
};
use serde_json::Value;

use super::{Content, ToolBridge};
use crate::harness::{AgentError, Result};

/// A session's endpoint is `http://127.0.0.1:<port>/mcp/<session key>` (SPEC 11.3).
pub(super) const PATH: &str = "/mcp/";
/// The server's name in the handshake. The agent's own name for it comes from its harness
/// adapter, which writes it into the agent's configuration.
const SERVER_NAME: &str = "slidr";

/// The session a request belongs to, put on it by [`auth`].
#[derive(Clone)]
struct SessionKey(String);

/// Serves one request. No tool logic: list what the session registered, forward, translate.
struct Adapter {
    bridge: Arc<ToolBridge>,
}

impl ServerHandler for Adapter {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(SERVER_NAME, env!("CARGO_PKG_VERSION")))
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        context: RequestContext<RoleServer>,
    ) -> std::result::Result<ListToolsResult, ErrorData> {
        let tools = self
            .bridge
            .tools(&session_key(&context)?)
            .ok_or_else(|| ErrorData::invalid_request("this session has ended", None))?;
        let tools = tools
            .iter()
            .map(|tool| {
                Tool::new(
                    tool.name.clone(),
                    tool.description.clone(),
                    Arc::new(tool.input_schema.clone()),
                )
            })
            .collect();
        // Protocol 2026-07-28 requires `ttlMs` and `cacheScope` on a list result, and rmcp
        // leaves them out unless asked. Without them the agent's CLI drops the whole list
        // without a word: the server shows as connected, there are no tools, and the model makes
        // its tool calls up (ADR-002). Never cached, and private: the list is this session's.
        Ok(ListToolsResult::with_all_items(tools)
            .with_ttl_ms(0)
            .with_cache_scope(CacheScope::Private))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> std::result::Result<CallToolResponse, ErrorData> {
        let session_key = session_key(&context)?;
        let input = Value::Object(request.arguments.unwrap_or_default());
        let reply = tokio::select! {
            reply = self.bridge.call(&session_key, &request.name, input) => reply,
            // The agent gave the call up (its turn was interrupted, its process ended). Nobody
            // reads this answer; leaving here is what forgets the waiting call.
            () = context.ct.cancelled() => {
                return Err(ErrorData::internal_error("the call was cancelled", None));
            }
        };
        let content = reply
            .content
            .into_iter()
            .map(|part| match part {
                Content::Text { text } => ContentBlock::text(text),
                Content::Image { data, mime_type } => ContentBlock::image(data, mime_type),
            })
            .collect();
        // A failed tool is a result the agent reads, not a protocol error, which agents show
        // without its message.
        let result = if reply.is_error {
            CallToolResult::error(content)
        } else {
            CallToolResult::success(content)
        };
        Ok(result.into())
    }
}

/// The session key [`auth`] put on the HTTP request; rmcp hands the request's `Parts` on.
fn session_key(context: &RequestContext<RoleServer>) -> std::result::Result<String, ErrorData> {
    context
        .extensions
        .get::<Parts>()
        .and_then(|parts| parts.extensions.get::<SessionKey>())
        .map(|key| key.0.clone())
        .ok_or_else(|| ErrorData::internal_error("the request carries no session key", None))
}

/// MCP-02: the path names an open session and the bearer token is that session's, or 401.
async fn auth(State(bridge): State<Arc<ToolBridge>>, mut request: Request, next: Next) -> Response {
    let key = request
        .uri()
        .path()
        .strip_prefix(PATH)
        .unwrap_or_default()
        .to_owned();
    let token = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if !token.is_some_and(|token| bridge.authorized(&key, token)) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    request.extensions_mut().insert(SessionKey(key));
    next.run(request).await
}

/// Binds the server and serves it for the rest of the process. Returns its port.
pub(super) async fn start(bridge: Arc<ToolBridge>) -> Result<u16> {
    // MCP-01: loopback only, a port the system picks. rmcp also checks the `Host` header
    // against loopback names by default, which keeps DNS rebinding out.
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| AgentError::io("start the tool server", &e))?;
    let port = listener
        .local_addr()
        .map_err(|e| AgentError::io("read the tool server's port", &e))?
        .port();
    let service = {
        let bridge = Arc::clone(&bridge);
        StreamableHttpService::new(
            move || {
                Ok(Adapter {
                    bridge: Arc::clone(&bridge),
                })
            },
            Arc::new(NeverSessionManager::default()),
            StreamableHttpServerConfig::default()
                .with_legacy_session_mode(false)
                .with_json_response(true),
        )
    };
    let router = axum::Router::new()
        .route_service(&format!("{PATH}{{session_key}}"), service)
        .layer(middleware::from_fn_with_state(bridge, auth));
    tokio::spawn(async move {
        // Ends only with the process.
        let _ = axum::serve(listener, router).await;
    });
    Ok(port)
}
