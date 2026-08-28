# Windows Setup

On Windows you have two options:

## Option A — UXP plugin (default, same as macOS)
Follow the main README: load `plugin/` in UXP Developer Tool and connect.
The WebSocket bridge works identically on Windows.

## Option B — COM bridge (no plugin needed)
Drives InDesign via COM automation (`cscript` + `DoScript`) — no UXP Developer
Tool required. Requires InDesign to be **running** on the same machine.

1. Enable it before starting the server:
   ```powershell
   set COM_BRIDGE_ENABLED=true
   node dist\index.js
   ```
2. Optional overrides: `COM_BRIDGE_CSCRIPT_PATH`, `COM_BRIDGE_VBS_PATH`
   (defaults: `cscript`, bundled `assets/windows/run_jsx_persistent.vbs`).
3. Start InDesign first — the bridge attaches to the running instance
   (`GetObject`), or launches one via `CreateObject` if none is open.

Notes:
- User interaction prompts are suppressed automatically (`userInteractionLevel
  = NEVER_INTERACT`) so modal dialogs can never hang a tool call.
- Requests execute one at a time (FIFO) through a single persistent script
  host — startup cost is paid once, not per tool call.

Credits: COM approach pioneered by [@graydini](https://github.com/graydini)
in PR #1; this implementation keeps the macOS default path untouched by being
strictly opt-in.
