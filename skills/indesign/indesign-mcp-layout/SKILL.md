---
name: indesign-mcp-layout
description: "Use when doing InDesign layout through MCP on Windows. Call mcp_indesign_* tools directly — never use export_executeScript."
version: 3.0.0
platforms: [windows]
---

# InDesign Layout Through MCP (Windows)

**Context:** The `adobe-indesign-mcp` repo provides ~190 `mcp_indesign_*` tools via the Hermes MCP server. On Windows the tools communicate through a COM bridge started automatically by the host application.

## ⚠️ NEVER use `export_executeScript` or `script_run`

These run raw ExtendScript through the singleton cscript process. **The server has no cancellation mechanism** — a slow/hung script blocks all subsequent calls permanently. A script that runs `app.fonts` enumeration, multi-mutation probes, or any loop over DOM objects will wedge the server indefinitely. Restarting the bridge is the only fix.

**Always use the typed `mcp_indesign_*` tools.** They wrap the COM calls internally with proper timeouts and error handling.

| What you might write raw ExtendScript for | Use this instead |
|---|---|
| Get document info | `mcp_indesign__document_getInfo` |
| Enumerate fonts | `mcp_indesign__font_list` — for font details on a text frame: `mcp_indesign__text_getFormatting` |
| Create document | `mcp_indesign__document_create` |
| Add pages | `mcp_indesign__page_add` |
| Create text frame | `mcp_indesign__text_addFrame` |
| Create shapes | `mcp_indesign__shape_rectangle_create` / `shape_ellipse_create` |
| Create colors | `mcp_indesign__color_swatch_create` |
| Add/modify tables | `mcp_indesign__table_create` / `table_setCell` / `table_setRowColumnSize` |
| Search/replace text | `mcp_indesign__grep_replace` / `text_findReplace` |
| Create styles | `mcp_indesign__style_createParagraph` / `style_createCharacter` |
| Apply styles to text | `mcp_indesign__text_applyParagraphStyle` / `text_applyFont` |
| Read text content | `mcp_indesign__text_getContent` / `text_getFormatting` |
| Export PDF | `mcp_indesign__export_document` |

## COM property surface (raw ExtendScript limitations)

If you ever must use `export_executeScript` for a one-off read, note:
- `fontFamily` → **DOES NOT WORK** (throws) — use `appliedFont` (returns `"Family\tStyle"`)
- `italic`, `weight` → **DO NOT WORK** (throws) — use `fontStyle`
- Works: `appliedFont`, `fontStyle`, `pointSize`, `contents`, `fillColor`, `justification`, `tracking`, `leading`
- Font names use tab-separated format: `"Fraunces\tMedium"`, `"Jost\tSemiBold"` (InDesign 2026 variable fonts)

## Before any layout task

1. **InDesign must be visibly open** — `CreateObject` binds to the running instance; if none is running, a hidden instance is created and documents are invisible to the user.
2. **Use `delivery_mode: 'foreground'`** for all MCP tool calls — background mode drops key events and cannot detect dialogs.
3. **If a Missing Fonts dialog appears**, dismiss with `computer_use` (foreground) then retry the MCP call.

## Page sizes (in points for document creation)

| Paper | Width × Height (pt) |
|-------|---------------------|
| US Letter | 612 × 792 |
| A4 | 595 × 842 |
| A3 | 842 × 1191 |
| Landscape A4 | 842 × 595 |

## Rules

- **NEVER run close-docs/cleanup scripts after a successful task** — it destroys the deliverable the user wants to see.
- If tool error is "MCP server unreachable after N failures" — a raw ExtendScript call wedged the cscript; only restarting the bridge will fix it.
- `working_dir` is not supported in MCP config; always use absolute Windows paths (`C:\Users\...`).
- After any config change, re-verify `enabled: true` — config writers may overwrite it.

## What NOT to Do

- Do NOT use `export_executeScript` for loops, enumerations, or multi-step mutations — wedges the server permanently
- Do NOT start the bridge yourself — the host application starts it
- Do NOT read `dist/bridge/BridgeServer.js` or any source code to understand the setup
- Do NOT check session history to verify how things were configured
- Do NOT write custom verification scripts — use `mcp_indesign__document_getInfo` only
- Do NOT close documents after a successful task
