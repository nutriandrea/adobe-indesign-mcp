---
name: indesign-mcp-layout
description: "Use when doing InDesign layout through MCP on Windows. Call mcp_indesign_* tools directly — do not start the bridge or read source code."
version: 2.0.0
platforms: [windows]
---

# InDesign Layout Through MCP (Windows)

**Context:** The `adobe-indesign-mcp` repo provides ~190 `mcp_indesign_*` tools via the Hermes MCP server. On Windows the tools communicate through a COM bridge that is started automatically by the host application (e.g. Hermes desktop app).

## How to Use

**Call MCP tools directly. Do NOT:**
- Start `bridge-proxy-persistent.mjs` yourself
- Run cscript/VBS scripts
- Read bridge source code
- Check session history to "verify" setup
- Write verification scripts

**Do:**
```
mcp_indesign__document_create → mcp_indesign__page_add → mcp_indesign__shape_ellipse_create → etc.
```

Use `mcp_indesign__document_getInfo` after changes to verify results.

## Prerequisites

1. **InDesign must be visibly open** — `CreateObject("InDesign.Application")` binds to the running instance. Without it, documents are created in a hidden window.
2. **Use `delivery_mode: 'foreground'`** for all MCP calls — background mode drops key events and makes it impossible to detect dialogs.
3. **If a Missing Fonts dialog appears**, dismiss it with `computer_use` (foreground) before retrying.

## Page Sizes (in points for document creation)

| Paper | Width × Height (pt) |
|-------|---------------------|
| US Letter | 612 × 792 |
| A4 | 595 × 842 |
| A3 | 842 × 1191 |
| Landscape A4 | 842 × 595 |

## Key InDesign 2026 Gotchas (all handled by the bridge)

- `UserInteractionLevel` enum undefined — bridge wraps scripts with magic number `1699311169`
- `ColorModel.PROCESS_RGB` renamed to `ColorModel.PROCESS` — bridge handles it
- `anchoredObject_create`: InDesign 2026's `move()` rejects `InsertionPoint` — handler adds to `ip.ovals/rectangles/textFrames` directly

## If Tools Fail

1. Check InDesign is open and visible
2. Check `delivery_mode` is `'foreground'`
3. If error says "Bridge is not connected" — InDesign may have closed; reopen it and retry
4. If error is `APIConnectionError` — model base_url may be `127.0.0.1`; change to the LAN IP

## What NOT to Do

- Do NOT start the bridge yourself — the host application starts it
- Do NOT read `dist/bridge/BridgeServer.js` or any source code
- Do NOT check session history to "verify" the setup
- Do NOT write custom verification scripts — use `mcp_indesign__document_getInfo` only
- Do NOT close documents after a successful task — the user wants to see them
