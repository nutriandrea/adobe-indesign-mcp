---
name: indesign-mcp-layout
description: "Use when driving Adobe InDesign through this MCP server. Prefer the typed mcp_indesign_* tools; read before using export_executeScript or script_run."
---

# InDesign Layout Through MCP

This server exposes the typed `mcp_indesign_*` tools. They validate their
arguments, wrap ExtendScript internally and apply timeouts and error handling.
**Use the typed tools.** Raw script execution is a last resort.

## Why typed tools instead of raw ExtendScript

`export_executeScript` / `script_run` push code straight to the InDesign
bridge. There is **no cancellation**: if a script hangs inside InDesign, the
host process stays busy and every later tool call queues behind it until the
host is restarted. Never use raw scripts for loops, font enumeration,
multi-mutation probes, or anything that touches many DOM objects.

| Instead of raw ExtendScript | Use |
| --- | --- |
| Read document info | `document_getInfo` |
| Enumerate fonts | `font_list` (per-frame details: `text_getFormatting`) |
| Create a document | `document_create` |
| Add pages | `page_add` |
| Create a text frame | `text_addFrame` |
| Create shapes | `shape_rectangle_create` / `shape_ellipse_create` / `shape_polygon_create` |
| Create colors | `color_swatch_create` |
| Build or edit tables | `table_create` / `table_setCell` / `table_setRowColumnSize` |
| Search and replace text | `grep_replace` / `text_findReplace` |
| Create styles | `style_createParagraph` / `style_createCharacter` |
| Apply styles to text | `text_applyParagraphStyle` / `text_applyFont` |
| Read text content | `text_getContent` / `text_getFormatting` |
| Export | `export_document` |
| List or check connectivity | `health_check` / `list_ai_skills` |

## Before any layout task

1. **InDesign must be open and visible.** Scripts execute against
   `app.activeDocument`; with no open document the calls fail, and on the
   Windows COM bridge a non-visible instance leaves the user looking at an
   empty application.
2. **Confirm the active document** before mutating. Tools act on
   `app.activeDocument`, so the wrong front document is a common failure.
3. Prefer `text_getContent` / `grep_find` to read state before writing it.

## Reading state

Read before you write. `text_getContent` returns frame contents, and
`text_getFormatting` returns the per-range font, size and character style —
enough to decide what to change without executing a probe script.

## Windows / COM notes

The Windows bridge talks to InDesign over COM, which differs from the macOS
UXP/JXA path in a few places worth knowing:

- **Dialogs must not appear.** Scripts run with
  `app.scriptPreferences.userInteractionLevel` set to `NEVER_INTERACT`, so
  export and font dialogs cannot block on Windows.
- **Some font properties throw.** In raw ExtendScript, `fontFamily`,
  `italic` and `weight` are not supported and raise an error. Use
  `appliedFont`, which returns `"Family\tStyle"`, plus `fontStyle`.
  Variable fonts are reported as tab-separated names such as
  `"Fraunces\tMedium"`.
- **Enums are read-only.** `ColorModel` members are `ColorModel.PROCESS`
  (and friends); assigning to them throws "ColorModel is read only". Read
  the enum value instead of assigning it.

## Geometry gotchas

- Bounds are `[top, left, bottom, right]`, and they must be well formed:
  an inverted or degenerate rectangle throws.
- InDesign 2026 rejects re-anchoring an object with `move()` when the target
  is an insertion point. The typed anchored-object tools add the object to
  the insertion point's own collection instead.
