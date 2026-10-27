# Architecture

`indesign-nutria-mcp` is an MCP server that drives Adobe InDesign on the same
machine. This document describes the real process topology, the request
lifecycle, and the seams between the pieces.

It exists because the topology is not a detail. On the plugin-free macOS path
there are **four separate processes** between the agent and InDesign, and a
change can be green across a thousand mocked tests while one of those seams is
broken. That is not hypothetical — see [Why the live smoke test
exists](#why-the-live-smoke-test-exists).

---

## The one invariant

**The MCP transport is always stdio.** The server speaks newline-delimited
JSON-RPC on stdin/stdout to whatever host launched it (Claude Desktop, Claude
Code, OpenCode, a test harness). Nothing else is ever written to stdout —
diagnostics go to stderr via the logger.

Independently of that, **the bridge to InDesign is a WebSocket listener** on
`127.0.0.1:8120` by default. The `server.transport` config value chooses the MCP
transport; it does **not** gate the bridge. (Gating the bridge on
`transport === 'websocket'` meant the default configuration never opened it at
all — one of the bugs fixed in `v1.4.2`.)

The one exception is Windows COM mode, where InDesign is driven in-process and
there is no listener at all.

---

## The macOS plugin-free path — four processes

This is the path `npm run smoke:macos` exercises, and the one most users run.

```
         stdio                              WebSocket                     execFile
 (newline-delimited JSON-RPC)      ({ "id", "code", "timeout" })   (path to a temp .jsx)

 ┌───────────┐                    ┌──────────────────────────┐           ┌────────────────────┐
 │ MCP host  │ ◄────────────────► │  indesign-nutria-mcp     │ ◄───────► │  bridge-proxy.mjs  │
 │ (Claude,  │                    │  ① McpServer   (stdio)   │           │  ② writes .jsx      │
 │  OpenCode)│                    │  ② BridgeServer :8120 ws │           │    spawns osascript │
 └───────────┘                    └──────────────────────────┘           └─────────┬──────────┘
                                                                                   │ argv
                                                       ┌───────────────────────────▼────────┐
                                                       │  ③ osascript -l JavaScript         │
                                                       │     jxa-driver.js                  │
                                                       │     Application(app).doScript(code)│
                                                       └───────────────────────────┬────────┘
                                                                                   │ Apple Events
                                                       ┌───────────────────────────▼────────┐
                                                       │  ④ Adobe InDesign                  │
                                                       └────────────────────────────────────┘
```

| # | Process | Started by | Role |
|---|---------|-----------|------|
| ① | `indesign-nutria-mcp` | the MCP host | MCP server (stdio) **and** WebSocket bridge on `:8120` |
| ② | `bridge-proxy.mjs` | you (`./start-bridge.sh` or `node bridge-proxy.mjs`) | WebSocket **client**; runs each script via `osascript` |
| ③ | `osascript` + `jxa-driver.js` | the proxy, per call | JavaScript for Automation; calls `app.doScript` |
| ④ | Adobe InDesign | you | executes the ExtendScript against the live document |

### Request lifecycle

1. The host sends a `tools/call` over stdio.
2. The handler builds an ExtendScript snippet and calls
   `ScriptExecutor.execute()`, which runs it through `wrapExtendScript()` (see
   [script bundle](#how-a-script-is-wrapped)) and emits a `request` event.
3. `BridgeServer` serialises `{ id, code, timeout }` and broadcasts it to every
   connected WebSocket client. **If nothing is connected it fails fast** with
   `bridge_not_connected` instead of letting the call hang until timeout.
4. The proxy receives the request, writes `code` to a temp `.jsx` file, and
   spawns `osascript -l JavaScript jxa-driver.js <file> <appName>`. A **FIFO
   queue with concurrency 1** keeps InDesign, which is single-threaded, from
   being swamped; the proxy's event loop stays free for pings and signals.
5. The driver reads the file, calls `Application(appName).doScript(code)`, and
   returns the result. The proxy reads the child's **stdout** (the driver's
   `run()` return value) and sends `{ type: 'result', id, result }` back over
   the WebSocket.
6. `ScriptExecutor` matches the `id`, clears the timeout, and resolves the
   pending promise.

### How a script is wrapped

`wrapExtendScript()` prepends a **trusted bundle** to the user code:

```
JSON polyfill   +   DOM helpers   +   SECURITY_STUBS (defines __blocked)
──────────────────────────────────────────────────────────────────────────
user code (only this part is passed through sanitizeCode())
```

- The bundle is **never sanitised**. Running the filter over the JSON polyfill
  once mangled its `JSON.parse` fallback and broke every execution.
- `app.scriptPreferences.undoMode` is set around the code when an undo group is
  active, so a group collapses into one undo step.
- `debug: true` wraps the code in `try/catch` that reports `__extendscript_error`
  with line/file/stack.

`ComScriptExecutor` (Windows) shares the exact same `wrapExtendScript` and adds
a leading `app.scriptPreferences.userInteractionLevel = NEVER_INTERACT` so no
modal can hang the bridge.

## The UXP-panel path

If you load `plugin/` in the UXP Developer Tool, the panel running **inside
InDesign** connects to the same `:8120` WebSocket and calls
`app.doScript`/`evaluateScript` itself. Processes ② and ③ above disappear; the
bridge hop is unchanged. This path is richer — the panel also polls the
document and pushes `document_changed` events, which feed
`changes_getStatus` — which is why the panel remains the recommended setup when
you can load it.

The panel and the proxy are **interchangeable clients of the same bridge**. You
pick one per machine; you do not run both.

## The Windows COM path

```
 ┌───────────┐   stdio   ┌──────────────────────────┐  stdin/stdout   ┌──────────────────┐
 │ MCP host  │ ◄───────► │  indesign-nutria-mcp     │ ◄─────────────► │  cscript.exe     │
 └───────────┘           │  ComScriptExecutor       │  (one temp .jsx │  run_jsx_        │
                         │  (no WebSocket listener) │   path per line)│  persistent.vbs  │
                         └──────────────────────────┘                 └────────┬─────────┘
                                                                               │ COM DoScript
                                                                      ┌────────▼─────────┐
                                                                      │   Adobe InDesign │
                                                                      └──────────────────┘
```

Enabled with `COM_BRIDGE_ENABLED=true`. A single persistent `cscript` process
holds one live COM connection; `ComScriptExecutor` writes each script to a temp
`.jsx` and pipes the path, so stdout lines map 1:1 to submissions. There is no
WebSocket listener in this mode. See [WINDOWS.md](../WINDOWS.md).

---

## The response contract

Every bridge message is one of three shapes:

| Direction | Shape |
|-----------|-------|
| plugin → server | `{ type: 'result', id, result }` or `{ type: 'error', id, error }` |
| plugin → server (push) | `{ type: 'event', name, payload }` |
| server → plugin | `{ id, code, timeout }` |

`parseBridgeMessage` **normalises at the boundary**: legacy `success`/`response`
spellings from older plugins are accepted, an unknown type with a valid `id`
becomes a loud error, and only what cannot be routed at all is dropped (with a
warning). Before this, an unknown type fell into the success branch and resolved
silently — the exact behaviour that hid bridge errors on macOS for months.

InDesign-side failures travel as a JSON string `{ "__bridge_error": "..." }`,
which the proxy turns into a canonical `type: 'error'` before it reaches the
server.

### The error envelope

Handlers do not return prose on failure. `withErrorHandling` classifies the
message into a typed `InDesignErrorEnvelope`:

```json
{
  "ok": false,
  "code": "invalid_reference",
  "message": "Object is invalid",
  "suggested_next_tool": "document_getInfo"
}
```

Codes cover the classes an agent can branch on: `bridge_not_connected`,
`execution_timeout`, `script_blocked_by_policy`, `document_not_found`,
`page_not_found`, `invalid_reference`, `missing_font`, `link_missing`,
`output_too_large`, and more. Every `suggested_next_tool` must name a tool that
is actually registered — `tests/contract/errorRecovery.test.ts` enforces that,
because a hint pointing at a nonexistent tool is worse than no hint. See
[src/errors/envelope.ts](../src/errors/envelope.ts).

Two codes — `BRIDGE_ERROR` and `EXTENDSCRIPT_RUNTIME_ERROR` — are the bridge's
catch-alls for "the script failed". They carry no more information than the
script's own message, so they deliberately yield to the message rules and only
fall back to themselves when nothing matches. The *specific* transport codes
(timeout, cancelled, output too large) stay authoritative. This matters because
the macOS bridge labels every InDesign-side failure `BRIDGE_ERROR`; treating it
as authoritative made the whole rules table unreachable in production.

### The success envelope (behind a flag)

Failures are always enveloped. Success is not, by default — the shape change is
breaking for a host that reads fields off `content[0].text`, so it ships behind
`responseEnvelope.success` (env: `RESPONSE_ENVELOPE_SUCCESS`, default `false`):

```json
{ "ok": true, "name": "brochure.indd", "pages": 4 }
```

Object results are **spread** (`{ ...data, ok: true }`) so a host that already
reads `parsed.name` keeps working; arrays and scalars are nested under `result`,
because spreading an array loses it and a result carrying its own `ok` key would
collide. `formatResponse` and `ChangesHandler.getStatus` are the only two
success builders, so turning the flag on covers every tool without a per-handler
opt-in. Image content from `preview_document` bypasses both and is never wrapped.

## The workflow contract

On `initialize`, the server advertises `INDESIGN_MCP_INSTRUCTIONS` (from
`src/prompts/instructions.ts`) alongside the tool list. Tools say *what* the
server can do; the instructions say *how it expects to be driven* — read state
first, prefer typed tools over raw script execution, and so on. This is the only
guidance the host receives before it starts choosing tools.

---

## Trust boundaries

Two independent filters guard the path from an agent's arguments to code that
runs inside InDesign:

- **`sanitizeCode()`** rewrites dangerous ExtendScript calls —
  `require(`, `eval(`, `Function(`, `exec(`, `spawn(`, `fork(`, and
  `process.exit` / `process.kill` — into `__blocked(name, …)`. `__blocked`
  lives in the trusted bundle and **throws** a named error, which the envelope
  reports as `script_blocked_by_policy`. Neutralisation keeps the parentheses
  balanced so the script still parses; a previous version substituted a bare
  comment and turned the rejection into a misleading `Expected: ;`.
- **`validateFilePath()`** rejects `..` traversal and access to system
  directories *before* InDesign ever sees a path, on the raw string as well as
  after normalisation. Every file-touching tool runs it up front.

`script_run` and `export_executeScript` bypass the typed tools on purpose and
have **no cancellation** — a hung script leaves the bridge busy and every later
call queues behind it. Prefer typed tools.

## Health and liveness

`BridgeServer` runs a health check every 30 s: it pings open sockets and closes
any connection that has been silent for 120 s (`code 4001`). This catches a
proxy that died without a clean close, so the next tool call fails fast with
`bridge_not_connected` rather than hanging.

---

## Why the live smoke test exists

`npm test` runs 1000+ mocked tests in seconds and catches regressions in
handlers, the protocol and startup. It **cannot** see the seams between the four
macOS processes: it never spawns `osascript`, never opens a real WebSocket to a
real InDesign, and never round-trips a script through the JXA driver.

That gap shipped a P0 in `v1.4.2`: 965 tests passed against a build whose bridge
never listened on its port, so **every** tool call failed in the field and
nothing went red.

`npm run smoke:macos` closes it by driving the real chain — MCP stdio →
WebSocket bridge → JXA proxy → InDesign — against a running InDesign. It creates
one document, writes to it, reads it back, asserts a bad reference returns a
structured error envelope, and closes without saving. It runs by hand (it needs
a desktop app), and it skips with exit 0 if InDesign is not open. See
[development.md](development.md).

`npm run smoke:target` extends the same chain to the multi-document case: it
opens two documents and proves a call naming the non-front document edits that
document and not the front one — the behaviour `document_id` exists for, which
no single-document smoke test can reach. See
[development.md](development.md#the-document-target-live-gate).

---

## Key files

| File | Responsibility |
|------|----------------|
| `src/index.ts` | entry point; loads config, starts the server |
| `src/server/IndesignMcpServer.ts` | builds `McpServer`, registers 35 handlers, starts the bridge, wires resources |
| `src/bridge/BridgeServer.ts` | WebSocket listener, health checks, fast-fail when disconnected |
| `src/bridge/ScriptExecutor.ts` | pending-request map, timeouts, protocol normalisation, undo-group flag |
| `src/bridge/ComScriptExecutor.ts` | Windows COM backend (persistent `cscript`) |
| `src/bridge/wrapExtendScript.ts` | the trusted bundle + sanitisation |
| `src/bridge/protocol.ts` | canonical message parsing/normalisation |
| `src/errors/envelope.ts` | typed error codes and recovery hints |
| `src/prompts/instructions.ts` | the workflow contract advertised on `initialize` |
| `src/utils/security.ts` | path validation, sanitisation, rate limiting |
| `src/utils/stringUtils.ts` | `sanitizeCode` and ExtendScript string escaping |
| `bridge-proxy.mjs` | macOS JXA proxy (no plugin) |
| `jxa-driver.js` | runs one script inside InDesign via `app.doScript` |
| `plugin/` | UXP panel (the in-process client) |
| `scripts/smoke-macos.mjs` | the live four-process smoke test |
| `scripts/smoke-document-target.mjs` | the live `document_id` (multi-document) gate |

## See also

- [available-tools.md](available-tools.md) — the generated tool catalog
- [troubleshooting.md](troubleshooting.md) — known failure modes and fixes
- [development.md](development.md) — build, test, and live-test workflow
- [WINDOWS.md](../WINDOWS.md) — the COM bridge
