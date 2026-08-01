---
name: indesign-mcp-layout
description: "Use when doing InDesign layout through MCP on Windows."
version: 1.0.0
platforms: [windows]
---

# InDesign Layout Through MCP (Windows)

**Context:** This repo (`adobe-indesign-mcp`) is served to agents through the Hermes MCP server `indesign` (~190 `mcp_indesign_*` tools). On Windows the tools need a COM bridge process that owns ONE persistent InDesign instance.

## Architecture (current, fixed 2026-08-01)

```
Any Hermes process (desktop app or `hermes chat -q`)
  └─ spawns MCP server: node dist/index.js indesign-nutria-mcp.json
       └─ BridgeServer = WebSocket CLIENT  (no port binding → no EADDRINUSE)
            └─ connects to ws://127.0.0.1:8120
                 └─ bridge-proxy-persistent.mjs = WebSocket SERVER (singleton)
                      └─ run_jsx_persistent.vbs (one long-lived cscript)
                           └─ InDesign COM — ONE instance, ONE document set
```

Multiple server instances can coexist (desktop app + CLI tests) — requests carry UUIDs, responses route by ID. Never start a second bridge.

## Before any layout task

1. **InDesign must be visibly open** — `CreateObject` binds to the RUNNING instance; if none is running, a hidden instance is created and documents are INVISIBLE to the user.
2. **Start the bridge** (background, from the repo dir):
   `node bridge-proxy-persistent.mjs`
   Wait for: `🔄 Windows COM bridge (singleton server) listening on 127.0.0.1:8120`
3. Verify the agent sees the server: `hermes tools list | grep -i indesign` → `indesign  all tools enabled`. If missing, check `mcp_servers.indesign.enabled: true` in `C:\Users\skype\AppData\Local\hermes\config.yaml`.
4. Tell any subagent/CLI run: *"A singleton bridge is ALREADY RUNNING on port 8120 — do NOT start any bridge, do NOT use terminal."*

## Task pattern (e.g. "5-page A4 doc with 3in red circle on page 5")

1. `mcp_indesign__document_create` — width 210, height 297 (mm), pages 1.
2. `mcp_indesign__page_add` × N on the SAME document — never create a second doc; reuse the same document across all calls.
3. `mcp_indesign__color_swatch_create` — model rgb, red 255, green 0, blue 0.
4. `mcp_indesign__shape_ellipse_create` — pageIndex 4 (0-based), width/height 76.2 mm (3 in), fillColor "Red".
5. `mcp_indesign__document_getInfo` to verify.
6. **Verify independently** — never trust tool "ok" strings:
   `echo "C:\path\check.jsx" | cscript //nologo run_jsx_persistent.vbs`
   check.jsx: `JSON.stringify({doc: app.documents[0].name, pages: app.documents[0].pages.length, fill: app.documents[0].pages[4].pageItems[0].fillColor.name, bounds: app.documents[0].pages[4].pageItems[0].geometricBounds})`

## Rules

- **NEVER run close-docs/cleanup scripts after a successful task** — it destroys the deliverable the user wants to see.
- Never start a second bridge or a second server manually while one is connected.
- If a tool errors `Bridge is not connected` → the bridge died; restart it, then retry.
- ExtendScript results must be single-line JSON (the VBS protocol is line-based).

## Enums that differ in InDesign 2026 (all handled in code — don't re-fix)

- `UserInteractionLevel` undefined → magic `1699311169` (bridge wraps every script).
- `ColorModel.PROCESS_RGB/PROCESS_CMYK` renamed to `ColorModel.PROCESS` (read-only enum) → helpers define `__PROCESS_COLOR_MODEL` by reading.
- `sanitizeCode()` used to mangle `eval(` in the JSON polyfill → polyfill now uses `[].constructor.constructor`.

## Config facts (Hermes, Windows)

- Config: `C:\Users\skype\AppData\Local\hermes\config.yaml`, key `mcp_servers.indesign` (top-level `mcp_servers`, NOT nested `mcp.servers`).
- Args must be absolute Windows paths (`C:\Users\...`) — Hermes ignores `working_dir` and mangles MSYS `/c/...` paths.
- After ANY `hermes config set`, re-verify `enabled: true` (config writers overwrite each other).
