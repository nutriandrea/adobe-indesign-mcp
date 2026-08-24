# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- **Path validation wired into every file-touching tool** (10 call sites across 7 handlers): document open/save, exports, image placement/relink, data merge, book open, XML export
- **Strict traversal policy**: any raw `..` segment is rejected before path resolution — `resolve()` used to collapse dot-dots and silently rewrite suspicious paths
- **Cross-platform forbidden-dir checks**: Windows system paths (`C:\Windows\...`) are rejected on macOS too via raw-string matching
- `DocumentHandler` migrated to the canonical ExtendScript escaper (last two inline implementations)

### Added
- **`export_batchFolder`**: export every `.indd` file in a folder to PDF in one call, with per-file success/failure results and path validation
- **`preview_document`**: renders any page to PNG/JPEG and returns it as an MCP image block, giving agents visual feedback on their layouts
- **Windows support via opt-in COM bridge**: drive InDesign with no UXP plugin using a persistent `cscript` host (`COM_BRIDGE_ENABLED=true`); macOS default path untouched, non-Windows startup fails fast with a clear message

## [1.3.0] - 2026-08-24

### Added
- **InDesign 2026 compatibility**: ExtendScript shims (`__PROCESS_COLOR_MODEL`, `__ANCHOR_POINT`) for renamed read-only enums; anchored-object creation now goes directly through insertion-point collections (#5)
- **Environment variable configuration**: all 13 documented settings are now actually read, with precedence env > JSON file > defaults; invalid values never block startup (#6)
- **Fast-fail when the plugin is disconnected**: tool calls reject immediately with an actionable message instead of hanging for the full execution timeout (#7)

### Changed
- All 27 handlers now share one canonical ExtendScript string escaper; three divergent implementations collapsed into one (#4)
- HTTP bridge token resolution centralized in `loadConfig` (env included) (#6)
- README tool count corrected from 183 to the actual 191 tools (#3)

### Fixed
- `getStatus().connected` no longer reports "connected" while requests are still pending; it now reflects real plugin connectivity (#3)
- UXP plugin fallback port corrected from stale 3001 to 8120 (#3)
- Coverage thresholds were inert due to a misplaced vitest config key; they are now enforced (85% lines/functions, 80% branches) (#3)
- Handler registration test covered only 16 of 31 handlers; now all 31 with an exact total assertion (#3)
- File-path validation allowed prefix-collision escapes (`/allowed` vs `/allowed-evil`) via `startsWith()`; replaced with true containment checks (#5)

## [1.2.0] - 2026-07-30

### Added
- Portfolio showcase script and updated examples
- README rewrite with origin story, comparison deep-dives, and launch thread docs

## [1.1.0] - 2026-07-09

### Added
- Text formatting read (`text_getFormatting`), character style apply (`text_applyCharStyle`), font apply (`text_applyFont`)
- GREP + format-aware text search (`text_search`, `text_searchFormatting`)
- Story↔page mapping (`document_getPageStories`, `document_getStoryPages`)
- Undo groups (`undo_beginGroup`, `undo_endGroup`)
- Debug mode for `script_run` with full ExtendScript stack traces
- BOM/control-character filtering on text reads
- Custom timeout/maxResults limits for large documents
- MCP resources: `mcp://tools/inventory` for agent auto-discovery

[1.3.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nutriandrea/adobe-indesign-mcp/releases/tag/v1.1.0
