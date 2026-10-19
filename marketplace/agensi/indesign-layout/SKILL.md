---
name: indesign-layout
description: "Uses Adobe InDesign to produce real layout work: documents, pages, text flow, styles, tables, images, master pages, tables of contents and indexes, data merge, and export to PDF, EPUB or a print preset. Use when the user asks to lay out, typeset or format a document, brochure, catalog, magazine, report, book or poster; place or flow text and images in InDesign; build or edit a table of contents; mail-merge a data source; or export a press-ready PDF. Drives the indesign-nutria-mcp server; InDesign must be installed, running and bridged."
---

# Layout in Adobe InDesign

Drives a running Adobe InDesign through the `indesign-nutria-mcp` server, whose
197 tools — typed, validated and grouped by object — cover documents, pages,
text, styles, tables, colour, images, masters, footnotes, cross-references,
tables of contents, indexes, data merge, books and export.

Reach for this skill when the user wants work done **in InDesign**: building or
editing a layout, placing a manuscript, typesetting, preparing a press-ready
PDF, or automating a folder of documents.

InDesign has no headless mode. Everything here drives the application the user
has open, so "just render it in CI" is not an option — and the skill should say
so rather than pretend otherwise.

## Before the first call

Setup (installing the server, wiring the host, opening the bridge) is in
[`SETUP.md`](SETUP.md), shipped next to this file.

Three things must be true before any tool works:

1. **InDesign is open.** Most tools act on an open document; with none open
   they fail. On the Windows COM bridge the instance must also be visible,
   otherwise the user is looking at an empty application.
2. **One bridge is running** — the UXP panel, `./start-bridge.sh`, or the COM
   bridge on Windows. Sending a raw script to InDesign has no cancellation: if
   it hangs, the host stays busy and every later call queues behind it.
3. **The connection is checked once.** `document_listOpen` is the cheap probe:
   if it returns a document list, the whole path works. If a call fails with
   `bridge_not_connected`, **stop and tell the user** to open InDesign and the
   bridge. Do not retry in a loop — the bridge cannot appear on its own.

## The contract

This server does not just expose tools, it expects to be driven a certain way.
Each rule below prevents a specific, common failure.

- **Use the typed tools.** They validate arguments, wrap ExtendScript and apply
  timeouts. `export_executeScript` and `script_run` push code straight to the
  bridge with no cancellation — never use them for loops, font enumeration,
  multi-object probes, or anything touching many DOM objects.
- **State before action.** Call `document_getState` before mutating: it returns
  the front document's geometry, the other open documents, the active layer and
  the selection in one round-trip. Do not assume geometry.
- **Target the document explicitly.** Every tool takes `document_id` — a
  document name (as `document_listOpen` reports it) or a 0-based index. Without
  it a tool acts on the front document, so with several open, pass
  `document_id` rather than trusting the front tab.
- **Read errors as data.** A failed call returns
  `{ ok: false, code, message, suggested_next_tool? }`. Act on
  `suggested_next_tool` instead of guessing.
- **Group multi-step edits.** Wrap a multi-step call in `undo_beginGroup` /
  `undo_endGroup` so the whole call is one undo step.
- **Look at what you made.** Call `preview_document` before reporting success
  rather than assuming the change landed.
- **Never leave a dialog possible.** `document_close` defaults to
  `saveOptions: "no"`, which cannot prompt. Call `document_save` first when the
  work should be kept, and never pass `"ask"` while acting unattended — a modal
  save dialog blocks the script until the bridge times out.

## Choosing a tool

| The user wants | Reach for |
| --- | --- |
| Create / open / save / close a document | `document_create`, `document_open`, `document_save`, `document_close` |
| Understand what is open | `document_getState`, `document_getInfo`, `document_listOpen` |
| Add, move or delete pages | `page_add`, `page_move`, `page_delete`, `page_duplicate` |
| Use master pages | `master_list`, `master_apply`, `page_applyMaster` |
| Add text | `text_addFrame`, `text_setContent`, `text_linkFrames` |
| Change typography | `text_applyParagraphStyle`, `text_applyFont`, `text_setDropCap`, `text_setKeepOptions` |
| Define styles | `style_createParagraph`, `style_createCharacter`, `tableStyle_create`, `cellStyle_create` |
| Search and replace | `grep_replace`, `text_findReplace`, `grep_replaceFormat` |
| Build or edit tables | `table_create`, `table_setCell`, `table_setRowColumnSize`, `table_setHeaderFooter` |
| Place and fit images | `image_place`, `image_fit`, `image_getLinks` |
| Colour | `color_swatch_create`, `color_gradient_create`, `color_apply` |
| Shapes and effects | `shape_rectangle_create`, `shape_ellipse_create`, `effect_applyDropShadow`, `transform_align` |
| Table of contents / index | `toc_createStyle`, `toc_generate`, `index_createTopic`, `index_generate` |
| Footnotes and cross-references | `note_addFootnote`, `xref_create` |
| Mail merge | `dataMerge_selectDataSource`, `dataMerge_listFields`, `dataMerge_mergeRecords` |
| Export | `export_document`, `recipe_exportPreset`, `export_batchFolder` |
| See the result | `preview_document` |

When in doubt about a name, read the `mcp://tools/inventory` resource instead of
guessing one — it is the live registry.

## Recipes

Each of these is a job, not a single call. Read state, act, verify.

### 1. Start a document from nothing

1. `document_create` with the page size and margins the user asked for.
2. `document_getState` to confirm what was actually created (locale-dependent
   defaults are a common surprise — an Italian InDesign names new documents
   `Senza titolo-1`).
3. `color_swatch_create` for any brand colours before using them.
4. `text_addFrame` → `text_setContent` for body copy.
5. `style_createParagraph` → `text_applyParagraphStyle` so the layout is
   style-driven, not hand-formatted.
6. `preview_document`, then `document_save` with an explicit `filePath`.

### 2. Flow a long manuscript

Do not create frames one by one. `recipe_flowTextStory` places a text file and
flows it across as many pages as it needs in one call, adding pages when it runs
out, and reports where the story ended and whether it still overflows.

To find where a story landed afterwards, use `document_getStoryPages` or
`document_getPageStories` rather than assuming a page range.

### 3. A styled table

`table_create` (bounds, rows, columns) → `table_setCell` per cell →
`table_setRowColumnSize` → `table_setHeaderFooter` → `table_setCellFill` and
`table_setCellAlignment`. For repeated table shapes, define it once with
`tableStyle_create` and apply the style instead of re-setting every cell.

### 4. Images

`image_place` (file path, frame) → `image_fit` to fit content to the frame.
Check links with `image_getLinks`; a missing link is a common reason a layout
renders blank, and `resources_updateAllLinks` re-establishes the broken ones.

### 5. Table of contents and index

- TOC: `toc_createStyle` → `toc_generate` on a target page → `toc_update` to
  regenerate after edits.
- Index: `index_createTopic` → `index_addEntry` → `index_generate`.

Both need the text to be already styled — generate the TOC after the paragraph
styles exist, not before.

### 6. Mail merge

`dataMerge_selectDataSource` (CSV, TSV or XML) → `dataMerge_listFields` (verify
the field names before referring to them) → `dataMerge_mergeRecords` →
`dataMerge_export`.

### 7. Export

- One document, a named preset: `recipe_exportPreset` validates the preset and,
  if it is wrong, fails with the list of valid names.
- Anything else (PDF, JPG, PNG, EPUB, HTML, package): `export_document`.
- A whole folder: `export_batchFolder` opens each `.indd` invisibly and reports
  per-file results — far cheaper than a loop of your own.
- Before a print hand-off, `export_preflight` catches missing fonts and links.

## When things go wrong

| Code | What it means | Do this |
| --- | --- | --- |
| `bridge_not_connected` | InDesign or the bridge is not up | Stop; tell the user. Do not loop. |
| `invalid_reference` | Stale page or frame index | Re-read with `document_getInfo` |
| `execution_timeout` | InDesign is busy | Probe with `document_listOpen` |
| `missing_font` | Font not available | `font_missing_check`, then `export_getFonts` |
| `link_missing` | Image link broken | `image_getLinks`, then `resources_updateAllLinks` |
| `script_blocked_by_policy` | Raw script tried privileged calls | Use a typed tool instead |

## Platform notes

The Windows bridge talks to InDesign over COM, which differs from the macOS
UXP/JXA path:

- **Dialogs cannot appear** — scripts run with interaction set to
  `NEVER_INTERACT`, so export and font dialogs cannot block.
- **Some font properties throw.** `fontFamily`, `italic` and `weight` are not
  supported in raw ExtendScript; use `appliedFont`, which returns
  `"Family\tStyle"`, plus `fontStyle`. Variable fonts appear as tab-separated
  names such as `"Fraunces\tMedium"`.
- **Enums are read-only** — read `ColorModel.PROCESS` rather than assigning it.

Geometry is the same on both: bounds are `[top, left, bottom, right]` and must
be well formed, since an inverted rectangle throws.

## Resources

Read-only, no InDesign round-trip:

- `mcp://bridge/status` — is the bridge reachable, and how deep is the queue
- `mcp://session/status` — this session's state
- `mcp://document/active` — the front document's cached state
- `mcp://tools/inventory` — the full tool list
