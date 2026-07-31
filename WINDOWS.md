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

## The protocol (unchanged — server side is platform-agnostic)

1. Connect `ws://127.0.0.1:8120` (server greets with `{type:'connected', version}`).
2. Server → host: `{id, code, timeout}` — `code` is ExtendScript
   (JSON polyfill + `__`-helpers + the handler's script).
3. Host executes inside InDesign; the script's last expression is the result
   (already JSON-stringified by `__ok()`/`__fail()`).
4. Host → server: `{id, type:'success', result}` or `{id, type:'error', error}`.
5. Ignore anything without `id` + `code` (heartbeats, acks).

## The Windows host (replaces `bridge-proxy.mjs`)

Same skeleton (WebSocket client + reconnect), one swapped exec layer:

```
request {id, code, timeout}
   └─► write code to temp .jsx in %TEMP%
   └─► spawn: cscript //nologo run_jsx.vbs <temp.jsx>     (COM DoScript, proven)
        OR in-process COM: winax → new ActiveXObject("InDesign.Application")
                                → app.DoScript(code, 1246973031)
   └─► capture stdout → {id, type:'success', result}
   └─► on timeout: kill the cscript/InDesign-side call, reply error
```

`run_jsx.vbs` bridge (proven live):

```vbscript
' run_jsx.vbs — run any .jsx file inside InDesign via COM.
' Usage: cscript //nologo run_jsx.vbs [path\to\script.jsx]
Option Explicit
Const JAVASCRIPT_LANG = 1246973031          ' DoScript language = JavaScript
Dim fso, jsxFile, jsxText, inDesign
Set fso = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count > 0 Then jsxFile = WScript.Arguments(0)
jsxText = fso.OpenTextFile(jsxFile, 1).ReadAll
Set inDesign = CreateObject("InDesign.Application")
inDesign.DoScript jsxText, JAVASCRIPT_LANG
WScript.Sleep 3000
Set inDesign = Nothing
```

Notes:
- `1246973031` is the DoScript language constant for JavaScript (ExtendScript) —
  the same constant the UXP plugin's fallback path already uses.
- Do NOT put a hardcoded default script path in the committed bridge; resolve
  paths from the request or `%TEMP%` at runtime.

## Windows-specific pitfalls (all proven in the field)

1. **Dialogs hang the COM call.** Every generated script must set
   `app.scriptPreferences.userInteractionLevel = UserInteractionLevel.NEVER_INTERACT;`
   before any export/file operation.
2. **Short-lived scripts end with `app.quit()`** or the COM call blocks until
   InDesign is killed. For the long-lived server, keep InDesign open and reuse
   the COM instance; do not quit per request.
3. **CLI args don't run scripts**: `InDesign.exe script.jsx` and `-r` are
   silently ignored — COM is the only reliable bridge.
4. **Recovery from hangs:** `taskkill //F //IM InDesign.exe`, relaunch; InDesign
   restores unsaved docs as "Untitled-N" — saving those as IDML yields genuine
   exports useful as XML structure references.
5. **Quoting hell:** always write JSX to a temp file and feed contents to
   `DoScript`; never inline ExtendScript through shell quoting.
6. **Timeout discipline:** honor the request `timeout` — kill the subprocess
   (child process tree) and reply `{type:'error'}`.
7. **JSX errors** propagate back through `DoScript` with the InDesign error text
   attached to the VBScript line number — no separate log needed.

## Port checklist

- [ ] `bridge-proxy-win.mjs`: WebSocket client + temp-file cscript exec (or winax)
- [ ] `run_jsx.vbs` committed WITHOUT machine-specific paths (resolve at runtime)
- [ ] Timeout kill + reconnect logic
- [ ] NEVER_INTERACT injection for export paths
- [ ] Result round-trip verified against real InDesign (create doc → set text → export IDML/PDF)
- [ ] `npm test` (server-side suite must stay green — it never touches InDesign)
- [ ] Optional: `script_run()` tool works end-to-end from an MCP client

## Out of scope / future

- InDesign Server (headless) support — upstream roadmap, different COM surface.
- CEP panel — not supported on InDesign 2026; COM is the supported path.
