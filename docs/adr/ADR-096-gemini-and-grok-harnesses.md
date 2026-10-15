# ADR-096 — Gemini CLI and Grok CLI as harnesses

Status: Implemented on 2026-10-15.

## Context

The agent ran on three CLIs: Claude Code, Codex and GitHub Copilot. The user asked for Gemini and Grok as well, through their own CLIs, with every flow the others have: choosing the harness in the chat and in Settings, installation on approval, sign-in, the models of the account, the turns themselves with the Deck API, images, interrupt and resume.

The two CLIs are Google's Gemini CLI (`@google/gemini-cli` on npm, `gemini`) and xAI's Grok Build (`grok`, installed by `x.ai/cli/install.sh`, `install.ps1` or WinGet `xAI.GrokBuild`). Both have a headless mode that streams JSON lines, take a conversation ID chosen by the caller, resume a conversation by its ID, and reach MCP servers over HTTP.

## Decision

Both are one-shot adapters beside Codex and Copilot (`harness/one_shot.rs`, `Kind::Gemini`, `Kind::Grok`): a process per turn, in the thread's `attachments/` folder, stopped by killing it. They are registered after Copilot (`gemini-cli`, `grok-cli`).

- **The conversation's ID is the app's.** As for Copilot, `start` allocates a UUID. A turn creates the conversation under it (`--session-id`) until the CLI is known to have it, then resumes it (`--resume`). It is known when the session was asked to resume one, or once a turn reached the model; only then is it announced (`session_started`), as Codex announces its thread when it starts, so the app never keeps an ID with nothing behind it. Both CLIs refuse to create an ID they already have, and a turn that failed after the CLI recorded the conversation but before the model answered leaves one, which Gemini then also refuses to resume (it lists only conversations with an answer). The refusal comes before anything runs, so such a turn starts once more under a new ID (`retry_fresh`): nothing of it was answered or announced. A conversation the session was asked to resume and the CLI lacks is `resume_failed`, which the app handles as for the other harnesses.
- **Gemini CLI.**
  - The system prompt replaces Gemini's own, as Codex's does: `GEMINI_SYSTEM_MD` names `system.md` in the thread's folder.
  - The folder's `.gemini/settings.json` holds the Deck API as the MCP server `slidr` (`httpUrl`, `trust: true`), the token as `${SLIDR_MCP_TOKEN}` from the environment, and `tools.core`, an allowlist: `mcp_slidr_*`, and `google_web_search` and `web_fetch` with web access. Gemini turns the allowlist into a policy that denies everything else, MCP tools among them, so the app's tools must be on it. Subagents, skills, hooks and update checks are off.
  - The folder's settings apply only in a trusted folder; `GEMINI_CLI_TRUST_WORKSPACE=true` trusts it for the run without recording it (`--skip-trust` comes too late: the settings are read before the arguments). `--allowed-mcp-server-names slidr` keeps the user's own servers out. `--approval-mode yolo` approves what the allowlist leaves, since nobody could answer a prompt.
  - The prompt is the context and the request on standard input; the turn's pictures are written to the folder and named `@turn-….png`, which Gemini inlines as image data.
  - On Windows npm's `gemini.cmd` is not started: Node.js is started on `bundle/gemini.js`, so a stop ends the CLI and not only the batch file. `GEMINI_CLI_NO_RELAUNCH` keeps Gemini from starting itself again as a child process.
  - Models come from its ACP mode (`gemini --acp`, `initialize`, `session/new`), whose answer lists the account's models; error -32000 there means no usable account. `auto…` is left out, as `auto` is for Copilot: the user chooses an explicit model. Gemini names most models by their id, which is shown as "Gemini 3.1 Pro Preview". It has no effort setting.
  - Installation is npm's (`npm install --global @google/gemini-cli`); when npm is missing, WinGet installs `OpenJS.NodeJS.LTS` first. The approval says so (`installDescriptionNpm`).
  - Gemini has no sign-in command: Sign in opens a terminal on `gemini` itself, which offers Google sign-in, with a line saying to type `/quit` once signed in.
- **Grok CLI.**
  - Its system prompt can only be given on the command line (`--system-prompt-override`), and the app's is about 44,000 characters, past what Windows allows a command line. So, as for Copilot, the instructions go with each request, with one line saying that the Slidr tools are on the MCP server `slidr` and are called through Grok's `use_tool` as `slidr__<tool>`.
  - The prompt is a file of ACP content blocks (`--prompt-file turn-….json`), so the turn's pictures go as image blocks; it is removed after the turn.
  - The folder's `.grok/config.toml` holds the server, its token as `${SLIDR_MCP_TOKEN}`. Grok reads a folder's configuration only once the folder is trusted; `GROK_FOLDER_TRUST=0` turns that check off for the run.
  - `--permission-mode dontAsk` runs only what is allowed: `MCPTool(slidr__*)`, and `WebSearch` and `WebFetch` with web access. The built-in tools are at most `web_search` and `web_fetch` (`--tools`); without web access, none (`--disallowed-tools`, `--disable-web-search`). No subagents, no plan mode, no cross-session memory (`GROK_MEMORY=0`), no update check.
  - Its MCP calls come through `use_tool`; the adapter shows them as the app's tool they call.
  - Models come from `grok models`, which also says whether the user is signed in; `grok-4.6` is shown as "Grok 4.6". No effort is offered, as the listing does not say which a model takes.
  - Installation is WinGet's `xAI.GrokBuild`; Sign in runs `grok login`. The official installer's `~/.grok/bin` is searched as well as PATH.
- **The app's side.** Gemini and Grok get the scoped `attachment_read` tool, as Codex and Copilot do, since they run without file tools of their own. The harnesses' names, marks and installer are in one table, `src/agent/harnessLook.ts`, which the chat's setup and Settings both read: Gemini a violet ✦, Grok a teal G.

## Consequences

- Grok sees the instructions again in every request, as Copilot does, and pays their tokens each turn.
- The user's own MCP servers configured for Grok are listed to it, but under `dontAsk` none of their tools can run in a Slidr session. Gemini does not start them at all.
- On a turn with pictures, Gemini reads every `@word` of the message as a file reference: it inlines a file of the folder so named, and spaces the others ("a@b.com" becomes "a @b.com").
- Each model listing of Gemini starts a session in one fixed folder (`slidr-connect-gemini` in the system's temporary folder), which Gemini keeps as an empty conversation of that one project.
- Automatic installation remains Windows-only, as for the other CLIs.

## Checks

- `cargo test`: the mappers of both streams (app and built-in tools, text, reasoning, failures), creating and then resuming, the arguments that limit tools, the configuration files without the token, the model listings, and the error classes.
- With the real Gemini CLI 0.64.0 and canned model replies (`--fake-responses`, no account): `real_gemini_calls_app_tool` passes. Gemini called the Deck API tool through the tool bridge, created the conversation, and a new session resumed it. A first turn that failed after Gemini recorded it was followed by a turn whose creation Gemini refused; that turn started again under a new ID and was answered, and only that ID was announced. The request it built carried Slidr's prompt as its system instruction, the picture as image data, and no built-in tool. `real_cli_discovers_models` listed the account's models with a key, and said "not logged in" without one.
- `cargo clippy` for Windows reports nothing the base did not; the Windows-only sign-in code compiles for `x86_64-pc-windows-gnu`.
- `e2e/harness-setup.spec.ts`: Gemini's installation is approved and done with npm, Grok signs in before its models load, and the chat offers all five harnesses (screenshots `test-results/harness-choice-<lang>.png` and `harness-gemini-install-<lang>.png`, looked at in Hebrew and English with Settings → Agent).
- Grok was not run: its CLI needs an xAI account for anything past `--version`. Its adapter follows the headless reference of `xai-org/grok-build`; `real_grok_calls_app_tool` and `SLIDR_DISCOVER_HARNESS=grok-cli` check it on a signed-in machine.
