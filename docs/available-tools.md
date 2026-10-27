# Available tools

> **Generated file — do not edit by hand.**
> Regenerate with `npm run docs:tools`. CI (`npm run verify:docs`) fails
> the build if this file no longer matches the registry.

**198 tools across 34 handlers.** This is the live registry — the same list the server serves over `mcp://tools/inventory`.

## Contents

- [Document](#document) — 9
- [Page](#page) — 7
- [Text](#text) — 7
- [Style](#style) — 7
- [Object](#object) — 6
- [Export](#export) — 11
- [Master](#master) — 6
- [Table](#table) — 16
- [Resources](#resources) — 6
- [Book](#book) — 4
- [Interactive](#interactive) — 5
- [Xml](#xml) — 6
- [Toc](#toc) — 4
- [Note](#note) — 4
- [Index](#index) — 4
- [Grep](#grep) — 4
- [TextAdvanced](#textadvanced) — 20
- [Xref](#xref) — 3
- [Effect](#effect) — 4
- [Transform](#transform) — 5
- [TableStyle](#tablestyle) — 4
- [Section](#section) — 4
- [Color](#color) — 6
- [Font](#font) — 5
- [Image](#image) — 5
- [Layer](#layer) — 5
- [Shape](#shape) — 6
- [Undo](#undo) — 5
- [AnchoredObject](#anchoredobject) — 5
- [List](#list) — 6
- [DataMerge](#datamerge) — 5
- [Preview](#preview) — 1
- [Recipe](#recipe) — 2
- [Changes](#changes) — 1

## Document

_9 tools_

| Tool | Description |
|------|-------------|
| `document_create` | Create a new InDesign document with specified dimensions, margins, and settings |
| `document_open` | Open an existing InDesign document from file path |
| `document_save` | Save the active InDesign document, optionally to a specific path |
| `document_close` | Close the active InDesign document with save options |
| `document_getInfo` | Get detailed information about the active document including page count, dimensions, and margins |
| `document_listOpen` | List all currently open InDesign documents |
| `document_getState` | Get the editing state in one call: the front document (name, path, page count, size, margins), the index of that document, the names of every open document, the active layer, and how many objects are selected. Prefer this over chaining document_getInfo and document_listOpen |
| `document_getPageStories` | Get all stories that appear on a specific page |
| `document_getStoryPages` | Get all pages covered by a specific story (for finding which pages a story lives on) |

## Page

_7 tools_

| Tool | Description |
|------|-------------|
| `page_add` | Add a new page to the active document at a specified position |
| `page_delete` | Delete a page from the active document by index |
| `page_duplicate` | Duplicate a page in the active document |
| `page_move` | Move a page to a new position in the active document |
| `page_getInfo` | Get detailed information about a specific page |
| `page_listAll` | List all pages in the active document with their properties |
| `page_applyMaster` | Apply a master spread to a page |

## Text

_7 tools_

| Tool | Description |
|------|-------------|
| `text_addFrame` | Add a text frame to a specified page with content |
| `text_setContent` | Set content of a text frame |
| `text_getContent` | Get content from a text frame |
| `text_getStories` | List all stories in the active document with optional timeout and max results |
| `text_applyParagraphStyle` | Apply a paragraph style to a text range |
| `text_findReplace` | Find and replace text content |
| `text_getTextFrames` | List all text frames on a page with optional timeout |

## Style

_7 tools_

| Tool | Description |
|------|-------------|
| `style_listParagraph` | List all paragraph styles in the active document |
| `style_listCharacter` | List all character styles in the active document |
| `style_listObject` | List all object styles in the active document |
| `style_createParagraph` | Create a new paragraph style |
| `style_createCharacter` | Create a new character style |
| `style_duplicate` | Duplicate a style |
| `style_delete` | Delete a style |

## Object

_6 tools_

| Tool | Description |
|------|-------------|
| `image_list` | List all placed images in a page |
| `image_getLinks` | Get link status for all placed images |
| `shape_create` | Create a geometric shape (rectangle, ellipse, polygon, line) |
| `shape_list` | List all shapes on a page |
| `group_list` | List all groups in a page |
| `group_ungroup` | Ungroup a group by index |

## Export

_11 tools_

| Tool | Description |
|------|-------------|
| `export_document` | Export the active document to a specified format (PDF, JPG, PNG, EPUB, HTML) |
| `export_batchFolder` | Export every InDesign (.indd) file in a folder to PDF in one run — opens each document invisibly and reports per-file results |
| `export_package` | Package the active document for print: collect fonts, linked graphics and a report into a folder. Unlike exporting, this gathers the document’s dependencies so it can be handed to a printer |
| `export_preflight` | Run a preflight check on the active document |
| `export_getSwatches` | Get all swatches (colors, gradients, tints) from the active document |
| `export_getFonts` | Get all fonts used in the active document |
| `export_getMasterSpreads` | List all master spreads in the active document |
| `export_getTables` | List all tables in the active document |
| `export_getXmlTags` | List XML tags in the active document |
| `export_executeScript` | Execute arbitrary ExtendScript code in InDesign |
| `script_run` | Execute arbitrary ExtendScript code with optional debug mode that returns line-level error stack traces |

## Master

_6 tools_

| Tool | Description |
|------|-------------|
| `master_create` | Create a new master spread with a given name and page count |
| `master_duplicate` | Duplicate an existing master spread |
| `master_apply` | Apply a master spread to a specific page |
| `master_delete` | Delete a master spread by name |
| `master_list` | List all master spreads with page count |
| `master_getPages` | List all pages on a master spread |

## Table

_16 tools_

| Tool | Description |
|------|-------------|
| `table_create` | Create a table on a page at specified bounds with row/column count |
| `table_list` | List all tables on a page or in the document |
| `table_addRow` | Add a row to a table at a specific index |
| `table_addColumn` | Add a column to a table at a specific index |
| `table_deleteRow` | Delete a row from a table |
| `table_deleteColumn` | Delete a column from a table |
| `table_setCell` | Set content of a specific cell |
| `table_getInfo` | Get detailed info about a table (rows, columns, cell contents) |
| `table_mergeCells` | Merge a range of cells into one |
| `table_splitCell` | Split a merged cell |
| `table_setCellFill` | Set a cell's fill color and tint |
| `table_setCellStroke` | Set cell edge stroke properties |
| `table_setCellInset` | Set cell inset spacing |
| `table_setCellAlignment` | Set cell text alignment |
| `table_setHeaderFooter` | Set header and footer row counts |
| `table_setRowColumnSize` | Set row height or column width |

## Resources

_6 tools_

| Tool | Description |
|------|-------------|
| `resources_listLinks` | List all document links with status and file path |
| `resources_updateLink` | Update/relink a specific link by index to a new file |
| `resources_updateAllLinks` | Update every link whose source file changed, and report the ones that need an explicit relink |
| `resources_embedLink` | Embed a linked file into the document |
| `resources_unembedLink` | Unembed a file, copying it into a folder if one is given |
| `resources_getLinkInfo` | Get detailed status for a specific link |

## Book

_4 tools_

| Tool | Description |
|------|-------------|
| `book_list` | List all open books in InDesign |
| `book_open` | Open an InDesign book file (.indb) |
| `book_getDocuments` | List all documents in a book |
| `book_synchronize` | Synchronize book documents with the style source |

## Interactive

_5 tools_

| Tool | Description |
|------|-------------|
| `interactive_listHyperlinks` | List all hyperlinks in the active document |
| `interactive_addHyperlink` | Add a hyperlink to a text selection or page item |
| `interactive_deleteHyperlink` | Delete a hyperlink by index |
| `interactive_listButtons` | List all buttons in the active document |
| `interactive_listAnchors` | List all cross-reference anchors in the active document |

## Xml

_6 tools_

| Tool | Description |
|------|-------------|
| `xml_listTags` | List all XML tags in the active document |
| `xml_addTag` | Create a new XML tag |
| `xml_deleteTag` | Delete an XML tag by name |
| `xml_tagPageItem` | Apply an XML tag to a page item |
| `xml_export` | Export document structure as XML |
| `xml_import` | Import XML file into the document |

## Toc

_4 tools_

| Tool | Description |
|------|-------------|
| `toc_createStyle` | Create or modify a Table of Contents style in the active document |
| `toc_generate` | Generate a Table of Contents on a specified page |
| `toc_listStyles` | List all Table of Contents styles in the active document |
| `toc_update` | Update (regenerate) an existing TOC from its story |

## Note

_4 tools_

| Tool | Description |
|------|-------------|
| `note_addFootnote` | Add a footnote to a specific paragraph in a story |
| `note_listFootnotes` | List all footnotes in a story or the active document |
| `note_footnoteOptions` | Set footnote options for the active document |
| `note_addEndnote` | Add an endnote to a story |

## Index

_4 tools_

| Tool | Description |
|------|-------------|
| `index_addEntry` | Add an index entry for the current selection |
| `index_generate` | Generate the index on a specified page |
| `index_listTopics` | List all index topics in the active document |
| `index_createTopic` | Create a new index topic |

## Grep

_4 tools_

| Tool | Description |
|------|-------------|
| `grep_find` | Find text using GREP pattern in the active document |
| `grep_replace` | Find and replace text using GREP pattern |
| `grep_findFormat` | Find text with specific formatting |
| `grep_replaceFormat` | Find and replace text while changing formatting |

## TextAdvanced

_20 tools_

| Tool | Description |
|------|-------------|
| `text_linkFrames` | Link (thread) two text frames together |
| `text_unlinkFrames` | Unlink a text frame from its thread |
| `text_setColumns` | Set column count and gutter for a text frame |
| `text_setTextWrap` | Set text wrap preferences for an object |
| `text_setDropCap` | Set drop cap options for a paragraph |
| `text_setKeepOptions` | Set keep options (widow/orphan control) for a paragraph |
| `text_setInsetSpacing` | Set text frame inset spacing |
| `text_setAutoSize` | Set auto-sizing type for a text frame |
| `text_setVerticalJustification` | Set vertical justification for a text frame |
| `text_setFirstBaseline` | Set first baseline options for a text frame |
| `text_setIgnoreWrap` | Set whether text frame ignores text wrap |
| `text_setParagraphRuleAbove` | Add or modify rule above a paragraph |
| `text_setParagraphRuleBelow` | Add or modify rule below a paragraph |
| `text_setTabs` | Set tab stops for a paragraph |
| `text_setHyphenation` | Set hyphenation settings for a paragraph |
| `text_getFormatting` | Get detailed formatting (font, size, style, character style) for each text style range in a paragraph |
| `text_applyCharStyle` | Apply a character style to a range of characters within a paragraph |
| `text_applyFont` | Apply font family, style, and/or size to a range of characters within a paragraph |
| `text_search` | Search text within a story using a GREP pattern, returning match positions and context |
| `text_searchFormatting` | Find text ranges with specific formatting (font family, style, or size) within a story |

## Xref

_3 tools_

| Tool | Description |
|------|-------------|
| `xref_create` | Create a cross-reference in the active document |
| `xref_list` | List all cross-references in the active document |
| `xref_updateFormat` | Update the format of a cross-reference |

## Effect

_4 tools_

| Tool | Description |
|------|-------------|
| `effect_applyDropShadow` | Apply a drop shadow effect to an object |
| `effect_applyFeather` | Apply a feather effect to an object |
| `effect_applyTransparency` | Set transparency and blend mode for an object |
| `effect_applyGradientFeather` | Apply a gradient feather effect to an object |

## Transform

_5 tools_

| Tool | Description |
|------|-------------|
| `transform_align` | Align objects on a page relative to selection, margins, or page |
| `transform_distribute` | Distribute objects evenly on a page |
| `transform_rotate` | Rotate an object by a specified angle |
| `transform_scale` | Scale an object by percentages |
| `transform_flip` | Flip an object horizontally or vertically |

## TableStyle

_4 tools_

| Tool | Description |
|------|-------------|
| `tableStyle_create` | Create a table style in the active document |
| `tableStyle_list` | List all table styles in the active document |
| `cellStyle_create` | Create a cell style in the active document |
| `cellStyle_list` | List all cell styles in the active document |

## Section

_4 tools_

| Tool | Description |
|------|-------------|
| `section_create` | Create a new section starting at a specified page |
| `section_list` | List all sections in the active document |
| `section_setNumbering` | Update page numbering for a section |
| `section_delete` | Delete a section by its index |

## Color

_6 tools_

| Tool | Description |
|------|-------------|
| `color_swatch_create` | Create a new color swatch |
| `color_swatch_list` | List all color swatches in the document |
| `color_swatch_delete` | Delete a color swatch by name |
| `color_gradient_create` | Create a gradient swatch |
| `color_apply` | Apply a color swatch to selected item (fill or stroke) |
| `color_ink_list` | List all inks in the document |

## Font

_5 tools_

| Tool | Description |
|------|-------------|
| `font_list` | List all available fonts |
| `font_find` | Search fonts by name |
| `font_change` | Change font of selected text |
| `font_glyph_insert` | Insert a special glyph at the cursor position |
| `font_missing_check` | Check for missing fonts in the document |

## Image

_5 tools_

| Tool | Description |
|------|-------------|
| `image_place` | Place an image from a file path onto a page |
| `image_adjust` | Adjust image properties (brightness, contrast, etc.) |
| `image_fit` | Fit image content to its frame |
| `image_relink` | Relink/replace an image with a new file |
| `image_info` | Get metadata for an image on a page |

## Layer

_5 tools_

| Tool | Description |
|------|-------------|
| `layer_create` | Create a new layer in the active document |
| `layer_list` | List all layers in the active document |
| `layer_reorder` | Move a layer to a new position in the layer stack |
| `layer_setProperties` | Set layer properties (visibility, lock, etc.) |
| `layer_delete` | Delete a layer |

## Shape

_6 tools_

| Tool | Description |
|------|-------------|
| `shape_rectangle_create` | Create a rectangle on a page |
| `shape_ellipse_create` | Create an ellipse or circle on a page |
| `shape_polygon_create` | Create a polygon on a page |
| `shape_line_create` | Create a graphic line on a page |
| `shape_modify` | Modify properties of an existing shape |
| `shape_delete` | Delete a shape from a page |

## Undo

_5 tools_

| Tool | Description |
|------|-------------|
| `undo` | Undo the last operation |
| `redo` | Redo the last undone operation |
| `undo_history` | Get undo/redo state information |
| `undo_beginGroup` | Begin an undo group. While active, each subsequent script runs as a single undo step, so one Undo reverts a whole tool call (e.g. a multi-step recipe). It cannot merge separate calls into one step — each call is still its own undo entry. Call undo_endGroup() to restore the default. |
| `undo_endGroup` | End the undo group and restore the default undo behavior |

## AnchoredObject

_5 tools_

| Tool | Description |
|------|-------------|
| `anchoredObject_create` | Create an anchored object at an insertion point or attach to a text frame |
| `anchoredObject_setPosition` | Reposition an anchored object |
| `anchoredObject_release` | Release anchored object to regular page item |
| `anchoredObject_getSettings` | Get anchored object settings |
| `anchoredObject_setProperties` | Set multiple anchored object properties |

## List

_6 tools_

| Tool | Description |
|------|-------------|
| `list_define` | Define a new numbered or bulleted list |
| `list_applyToParagraph` | Apply a list to a specific paragraph |
| `list_applyToSelection` | Apply a list to the current text selection |
| `list_removeFromParagraph` | Remove list formatting from a paragraph |
| `list_list` | List all defined lists in the document |
| `list_restartNumbering` | Restart numbering at a specific paragraph |

## DataMerge

_5 tools_

| Tool | Description |
|------|-------------|
| `dataMerge_selectDataSource` | Select a data source (CSV/TSV/XML) file for data merge |
| `dataMerge_listFields` | List available data merge fields from the current data source |
| `dataMerge_mergeRecords` | Merge records into the document using the selected data source |
| `dataMerge_export` | Export the merged document to a file |
| `dataMerge_removeDataSource` | Remove the current data source from the document |

## Preview

_1 tools_

| Tool | Description |
|------|-------------|
| `preview_document` | Render a page of the active document as an image (PNG or JPEG) so you can visually inspect layout, colors and typography |

## Recipe

_2 tools_

| Tool | Description |
|------|-------------|
| `recipe_flowTextStory` | Place a text file and flow it across as many pages as it needs in one call — creates the frames, links them, adds pages when it runs out, and reports where the story ended and whether it still overflows |
| `recipe_exportPreset` | Export the active document to PDF using a named PDF export preset in one call — validates the preset first and, if it is wrong, fails with the list of valid preset names |

## Changes

_1 tools_

| Tool | Description |
|------|-------------|
| `changes_getStatus` | Report document change activity pushed by the plugin over the bridge — no InDesign round-trip. Pass `since` (epoch ms) to learn whether anything changed after that moment, e.g. to skip re-rendering a preview when nothing changed. |
