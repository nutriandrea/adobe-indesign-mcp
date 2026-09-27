# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.2] - 2026-09-27

Merges the fixes contributed through the forks, plus regression tests for each.

### Fixed
- **Bridge responses are canonical and cannot be silently swallowed**: the protocol declared both `result` and `error`, but a single `else` branch resolved *every* response — including malformed and unknown-typed ones — as a success. The server now emits `{ type: 'result' | 'error', id, result | error }`, accepts the legacy `success` / `response` types on input, rejects an unknown type that carries a valid `id`, and discards frames with no `id`
- **The macOS JXA proxy mangled or lost script results** (from [PR #22](https://github.com/nutriandrea/adobe-indesign-mcp/pull/22), @advaitakelkar): `osascript` writes script *results* to **stderr**, so successful calls were read as failures; scripts were passed through shell `-e` quoting, which corrupts any quote, backslash or newline; and the app name was hardcoded to "Adobe InDesign 2024", so every other InDesign version failed
- **`bridge-proxy.mjs` no longer blocks the MCP server**: `execSync` froze the Node event loop for the whole duration of every script, so the server could not answer, ping or reconnect while InDesign worked. Execution is now asynchronous
- **The plugin handshake was executed as ExtendScript**: the connection test was passed through `app.doScript`, where it was parsed as a script rather than run as JXA
- **The MCP Bridge panel required a click to connect**, so it appeared dead even with the server already running (from @ijeetu). It now connects on open, and the button and auto-connect share one URL constant instead of two divergent defaults
- **Object results from `doScript` came back as `[object Object]`** instead of JSON
- **The shipped `indesign-nutria-mcp.json` declared `transport: "websocket"`**, contradicting both the config default and the actual runtime; it is now `stdio`
- **InDesign 2026 anchoring**: creating an anchored object no longer relies on `move()`, which 2026 rejects for insertion-point targets

### Added
- **Plugin-free macOS setup**: `start-bridge.sh` launches InDesign and the JXA proxy, so no UXP panel has to be loaded. `bridge-proxy.mjs` gained `INDESIGN_APP`, `BRIDGE_WS_URL`, `BRIDGE_TIMEOUT_MS` and `BRIDGE_RECONNECT_DELAY_MS`
- **FIFO execution queue** in the JXA proxy: InDesign is single-threaded, so requests serialize in arrival order while the event loop stays free
- **`skills/indesign/indesign-mcp-layout`**: agent-facing guidance on preferring typed tools over raw ExtendScript, plus the COM property limits (`fontFamily`, `italic`, `weight` throw) and read-only enum traps
- **Documented the no-cancellation hazard**: a hung script leaves the Windows COM bridge wedged, because the timeout rejects the request without killing `cscript` and `ensureProcess()` only respawns a dead process. The macOS proxy is unaffected — `execFile`'s `timeout` terminates the child
- 32 new unit tests: bridge protocol matrix, proxy config, JXA transport, FIFO queue, plugin bundle agreement, shipped-config guards, and a README/registry consistency guard

### Changed
- `.gitignore` now keeps root-level debug `.jsx` files, `*.local.jsx` and `win-bridge-local/` out of the repository. Two scratch scripts on a contributor branch hardcoded a personal Windows path
- Removed the npm badge and install claims from the README: the package has never been published, and the badge resolved to a 404
- Acknowledgements now credit each contribution specifically — @graydini (Windows COM bridge, 2026 API incompatibilities), @advaitakelkar (JXA result/quoting/version bugs), @ijeetu (panel auto-connect, JSON polyfill sanitizer)
- `docs/forks/graydini-windows-com-bridge-audit.md` records a file-by-file audit of that branch: what was adopted, what was rejected as superseded, and why

## [1.4.1] - 2026-08-24

### Fixed
- **`shape_polygon_create` works again on InDesign 2026** (verified on a live instance): side count moved from the polygon instance (property removed in this DOM) to `app.polygonPreferences.numberOfSides`, set before `polygons.add()`
- **`preview_document` now actually works against real InDesign 2026** (verified end-to-end on a live instance): the generated script used the non-existent `resolutionPpi` preference (correct property is `exportResolution`, a plain PPI number), called `Page.exportFile` which doesn't exist in this DOM (now exports the document with `pageString` taken from the target page's own name, so section numbering is respected), and ended with `JSON.stringify(...)`, which throws in ExtendScript's ES3 engine
- **Change-event heartbeat**: consecutive unsaved edits leave the name/modified signature unchanged, so the plugin now re-emits `document_changed` every ~30s while the document is dirty instead of going silent after the first notification

### Added
- Plugin bundle guards: unit tests parse `plugin/index.js` with Node and assert the embedded signature script stays ES3-safe (no `JSON.*`, no backslash literals) — the multi-layer escaping regression that silently corrupted the file can't ship again

## [1.4.0] - 2026-08-24

### Security
- **Path validation wired into every file-touching tool** (10 call sites across 7 handlers): document open/save, exports, image placement/relink, data merge, book open, XML export
- **Strict traversal policy**: any raw `..` segment is rejected before path resolution — `resolve()` used to collapse dot-dots and silently rewrite suspicious paths
- **Cross-platform forbidden-dir checks**: Windows system paths (`C:\Windows\...`) are rejected on macOS too via raw-string matching
- `DocumentHandler` migrated to the canonical ExtendScript escaper (last two inline implementations)

### Added
- **Live change events**: the plugin pushes `document_changed` over the bridge whenever the active document state shifts (open/close, modified flag); signature script is ES3-safe (ExtendScript has no JSON object); new `changes_getStatus` tool lets agents ask "did anything change since T?" without touching InDesign — the cheap guard for preview loops
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

[1.4.2]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nutriandrea/adobe-indesign-mcp/releases/tag/v1.1.0
