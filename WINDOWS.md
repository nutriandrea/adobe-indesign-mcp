# Windows Port — COM/ExtendScript Bridge

**Goal:** make this MCP server work on Windows, where the shipped InDesign-side
hosts cannot run:

| Shipped host | Why it fails on Windows |
|---|---|
| `plugin/` (UXP panel) | UXP is unsupported on InDesign 2026 (DOMVersion 21.4) — plugin cannot load |
| `bridge-proxy.mjs` (JXA/osascript) | JXA is macOS-only |

**Approach:** replace the InDesign-side host with a Windows one that speaks the
same WebSocket protocol but executes ExtendScript through the **COM automation
interface** that InDesign exposes on Windows.

## Architecture (current — fixed 2026-08-01)

```
Any MCP server instance (node dist/index.js …)     ← N servers, no port binding
  └─ BridgeServer (dist/bridge/BridgeServer.js) = WebSocket CLIENT
       └─ ws://127.0.0.1:8120
            └─ bridge-proxy-persistent.mjs = WebSocket SERVER (singleton, user-launched)
                 └─ run_jsx_persistent.vbs (one long-lived cscript, stdin/stdout)
                      └─ InDesign COM — ONE instance, ONE document set
```

Requests carry a UUID; responses route by ID, so multiple servers share one bridge safely.

## The protocol (unchanged — server side is platform-agnostic)

1. Connect `ws://127.0.0.1:8120` (server greets with `{type:'connected', version}`).
2. Server → host: `{id, code, timeout}` — `code` is ExtendScript
   (JSON polyfill + `__`-helpers + the handler's script).
3. Host executes inside InDesign; the script's last expression is the result
   (already JSON-stringified by `__ok()`/`__fail()`).
4. Host → server: `{id, type:'success', result}` or `{id, type:'error', error}`.
5. Ignore anything without `id` + `code` (heartbeats, acks).

## ⚠️ AI agents: use only typed tools, never raw ExtendScript

NEVER use `export_executeScript` or `script_run` for loops, font enumeration, multi-mutation probes, or any nontrivial script. The bridge runs scripts through a single shared cscript process with no cancellation — a slow or hung script blocks every subsequent call indefinitely, and the server stays permanently wedged until the bridge is manually restarted.

The typed `mcp_indesign_*` tools (`document_create`, `text_addFrame`, `style_createParagraph`, `shape_rectangle_create`, `font_list`, `table_setCell`, etc.) wrap the COM calls internally with proper timeout handling. Use those instead.

**COM property limitations in raw ExtendScript:** `fontFamily`, `italic`, `weight` all throw "does not support" via COM — use `appliedFont` (returns `"Family\tStyle"`) and `fontStyle` on text objects instead.

## Setup

1. **Launch InDesign visibly** — `CreateObject("InDesign.Application")` binds to the running instance.
2. **Start the bridge** (from the repo dir):
   ```bash
   node bridge-proxy-persistent.mjs
   # → 🔄 Windows COM bridge (singleton server) listening on 127.0.0.1:8120
   ```
3. The bridge stays running. MCP server instances connect to it as clients.
4. Register the MCP server in your client config (see README.md).

**For AI agents:** the bridge is started by the host application. Do NOT start it yourself. Do NOT read bridge source code. Call `mcp_indesign_*` tools directly.

## Windows-specific pitfalls (all handled by the bridge)

1. **Dialogs hang the COM call.** Scripts set `app.scriptPreferences.userInteractionLevel = 1699311169` (NEVER_INTERACT) before any export/file operation.
2. **CLI args don't run scripts:** `InDesign.exe script.jsx` and `-r` are silently ignored — COM is the only reliable bridge.
3. **Recovery from hangs:** `taskkill /F /IM InDesign.exe`, relaunch; InDesign restores unsaved docs as "Untitled-N".
4. **Timeout discipline:** honor the request `timeout` — kill the subprocess and reply `{type:'error'}`.

## InDesign 2026 API changes (fixed in bridge)

| Issue | Fix |
|-------|-----|
| `UserInteractionLevel` enum undefined | Bridge wraps scripts with magic number `1699311169` |
| `ColorModel.PROCESS_RGB` renamed to `ColorModel.PROCESS` (read-only) | Bridge reads the correct enum value at runtime |
| `sanitizeCode()` mangles `eval(` in JSON polyfill | Polyfill now uses `[].constructor.constructor` |
| `anchoredObject_create` — `move(InsertionPoint)` rejected | Handler adds item to `ip.ovals/rectangles/textFrames` directly |

## What NOT to do (agents)

- Do NOT read `dist/bridge/BridgeServer.js` to understand the setup
- Do NOT run `echo "C:\path\check.jsx" | cscript //nologo run_jsx_persistent.vbs` to verify
- Do NOT check session history to "figure out" how things were configured
- Do NOT write custom verification scripts — use `mcp_indesign__document_getInfo` only
