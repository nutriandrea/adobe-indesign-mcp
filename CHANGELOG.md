# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-10-19

### Added
- **Client configs, registry metadata and release automation — the distribution
  half of the plan.** `examples/` holds copy-paste configs for Claude Desktop
  (macOS and the Windows COM variant), Cursor and Claude Code; `server.json` is
  the MCP Registry manifest; `mcpb/manifest.json` describes an MCP Bundle;
  `glama.json` claims the Glama listing and `llms.txt` indexes the docs for
  agents and directories.

  `server.json` is **generated from `package.json`** (`npm run server:json`) and
  gated by `npm run verify:server-json`, because the registry proves ownership of
  the npm package by matching its `mcpName` against the manifest's `name` —
  `package.json` now carries `mcpName`. `scripts/build-mcpb.mjs` packs a
  self-contained `.mcpb` from the tarball `verify:pack` already boots.
  `.github/workflows/release.yml` takes a tag through verify → npm publish with
  provenance → a GitHub Release with the CHANGELOG notes and the `.mcpb`
  attached, and `publish-mcp-registry.yml` publishes `server.json` from the
  release event. `scripts/validate-release-tag.sh` fails a tag that disagrees
  with `package.json` or that has no CHANGELOG section.

  **The example configs point at a local build.** `examples/README.md`
  documents the one-line `npx` form to use afterwards, and a test asserts the
  examples never hand a user a command that would not work as written. The
  release workflow fails loudly on a missing `NPM_TOKEN` rather than skipping
  the publish, so a tag cannot look released and be uninstallable.
- **A marketplace listing that packages a skill for a third-party channel.**
  `marketplace/agensi/` holds the free companion skill prepared for Agensi, a
  marketplace for agent skills: the skill folder itself (`SKILL.md`, `SETUP.md`,
  a buyer-facing `README.md`), the listing copy to paste into the form, and
  `scripts/build-agensi.mjs` (`npm run build:agensi`), which stages the folder,
  zips it and then re-opens its own archive to assert the shape Agensi's creator
  checklist requires — one top-level folder named after the skill, `SKILL.md` at
  its root, text files only, no OS cruft. The `config/` directory inside the zip
  is **copied from `examples/` at build time** rather than committed, so the
  bytes a buyer receives are the ones `distributionManifests` already validates.
  Like `mcpb/`, nothing here ships to npm: it is a store artifact, not a library,
  and it is deliberately **not** in the package's `files`.

### Fixed
- **The shipped layout skill told agents to call two tools that never existed.**
  `skills/indesign/indesign-mcp-layout/SKILL.md` advertised a `mcp_indesign_*`
  prefix the registry does not use, and pointed connectivity checks at
  `health_check` and `list_ai_skills` — neither of which is registered by any
  handler, in any release. A skill is instruction, so naming a tool that does not
  resolve sends the model into a second failure on top of the one it was
  recovering from; the correct cheap probe was `document_listOpen`, and the
  read-only resources (`mcp://bridge/status` and friends) were not mentioned at
  all. The skill now names only real tools and documents the resources.

  The root cause was that `SKILL.md` was the one piece of agent-facing text with
  no guard: `instructions.test.ts` already holds the initialize-time contract to
  the registry, and `verify:docs` regenerates the catalog, but nothing read the
  skills. `tests/unit/skillGuidance.test.ts` now walks every `SKILL.md` under
  `skills/` and `marketplace/` and fails on a tool name the registry does not
  know — and on a skill whose frontmatter `name` disagrees with its folder,
  which is a marketplace's most common reason to reject or silently drop a
  skill. It is regression-proven: restored to its buggy state, the guard reports
  both dead names.

  `verify:tool-counts` also now reads the markdown under `marketplace/`, so the
  count quoted to a buyer is checked alongside the README, `llms.txt` and the
  package description — 10 advertised places instead of 8.

## [1.5.0] - 2026-10-18

### Added
- **A per-call target document: `document_id`.** Every tool now takes an optional
  `document_id` — a document name (as `document_listOpen` reports it) or a
  0-based index — and acts on that document rather than the front tab. With more
  than one document open the front tab is not reliably the intended target, and a
  tool called against the wrong document edits the wrong file; the server
  instructions could only warn about it. Passing no `document_id` is exactly the
  old behaviour (the front document), so the change is additive.

  `app.activeDocument` was written inline in 197 places across 32 handlers with no
  shared resolver, so the target could not be honoured without first building one.
  `__resolveDocument()` — injected with every script — is that resolver, and every
  document-scoped handler now resolves through it. A target that is not open fails
  loudly (`document_id 'X' is not open. Open documents: …`) instead of silently
  editing the front document. The target is carried in `AsyncLocalStorage`, so a
  call that awaits before dispatching cannot be hijacked by a concurrent one, and
  a hostile `document_id` is embedded as a JSON string literal and matched by
  name — there is no path by which it becomes executable.

### Changed
- The server instructions (`STATE BEFORE ACTION`) now describe `document_id`
  instead of telling the host to ask which document is meant, and the shipped
  `indesign-mcp-layout` skill points at it in place of the "tools act on
  `app.activeDocument`" warning.

## [1.4.3] - 2026-10-18

### Added
- **Structured error envelopes.** A failing tool call now returns a JSON envelope
  — `{ ok: false, code, message, suggested_next_tool?, suggested_args? }` —
  instead of bare prose, so a host LLM can tell a missing document from a stale
  reference from a timeout instead of guessing. Sixteen failure classes are
  classified. Where a remedy exists the envelope names the tool to call next: a
  bad frame index (`text_getContent` with `frameIndex: 999`) now answers
  `invalid_reference` and suggests `document_getInfo`, and a timeout suggests
  `document_listOpen` as a liveness probe. ExtendScript runtime errors carry
  their source `line`, `file` and `stack`. Every `suggested_next_tool` is
  verified against the live tool registry by
  `tests/contract/errorRecovery.test.ts`, so a hint can never point at a tool
  that does not exist
- **A workflow contract advertised on `initialize`.** The server now sends
  `instructions` to the host covering the bridge bootstrap, state-before-action,
  the `document_close` save-dialog trap, a warning against raw-ExtendScript
  workarounds, the error-envelope shape, `preview_document` for verification,
  and `undo_beginGroup` / `undo_endGroup` for multi-step edits. About 680 tokens,
  paid once per session. Every tool it names is checked against the live
  registry by `tests/unit/instructions.test.ts`
- **`document_getState`** returns the front document's geometry, that document's
  index, every open document, the active layer and the selection count in **one
  bridge round-trip**, replacing the `document_getInfo` + `document_listOpen` +
  layer + selection sequence. The tool count moved to 195 at the same time; the
  README, the package description and the inventory guard were updated together,
  and the guard caught a handler-table row that had been missed
- **`preview_document` takes `documentIndex`** to render any open document rather
  than only the front one, and **caps the exported file at 4 MB**: a render over
  the cap is re-exported once at the resolution that fits, and a render that
  cannot fit even at 72 ppi fails with code `output_too_large` and
  `suggested_args` for the retry
- **A working lint.** `npm run lint` ran `eslint src/` with no config and no
  `--ext`, so it matched no files and exited 0: CI passed a check that could not
  fail. There is now an `.eslintrc.cjs`, the lint covers `src` and `scripts/*.ts`,
  and it is a required CI step
- **`npm run verify:tool-counts`** pins every number the project *advertises* — the
  README prose, the README badge, the package description and the handler table —
  against the real registry. The vitest guard only compared the registry to a
  constant and to the handler table, which is how the package description once
  read 191 while the README said 194
- **`npm run verify:pack`** packs the package, installs the tarball into a temp
  dir, boots the packed server over stdio and completes an initialize +
  `tools/list` handshake. Importing the entry point is not an option (it calls
  `main()` at module scope), and spawning it is a stronger check anyway: it proves
  the artifact a user installs actually runs
- **A PR-title check** (`.github/workflows/pr-title.yml`). Zero third-party
  actions: the title is already in the event payload, so there is nothing to
  fetch, pin or trust
- **An engineering documentation suite** under `docs/`:
  [`architecture.md`](docs/architecture.md) (the four-process macOS path, the
  request lifecycle, the response/error contract, the trust boundaries and why
  the live smoke test exists), [`troubleshooting.md`](docs/troubleshooting.md)
  (the modal-dialog hangs, a port already in use, a mistyped `INDESIGN_APP`,
  missing fonts, `script_blocked_by_policy`, `output_too_large` and the split
  stdout-chunk trap), [`available-tools.md`](docs/available-tools.md) and
  [`development.md`](docs/development.md). The topology existing nowhere is
  exactly why the `v1.4.2` bridge P0 survived 965 tests
- **`npm run docs:tools`** generates `docs/available-tools.md` from the live
  registry (the same loader the server uses), and **`npm run verify:docs`** fails
  if the file on disk has drifted. CI runs the check, so the catalog a user reads
  cannot fall behind the code
- **Two recipes** that are more than a rename of a chain.
  `recipe_flowTextStory` places a text file and flows it across pages — creating
  the frames, linking them, adding pages when it runs out, and reporting where
  the story ended and whether it still overflows — in **one** bridge round-trip,
  because the right next step depends on a state only InDesign can report.
  `recipe_exportPreset` applies a named PDF export preset and exports; the atomic
  `export_document` cannot, because its `options` are JSON and not an object the
  PDF engine accepts. A wrong preset name fails with the list of valid ones. Each
  runs inside a single `UndoModes.ENTIRE_SCRIPT` group by composing the existing
  `startUndoGroup`/`endUndoGroup`, so one Undo reverts the whole outcome. The tool
  count is now 197 across 34 handlers, and the inventory guard caught every
  advertised "195" that had to move. **`npm run smoke:recipes`** is the live gate
  for both: it flows a long file, asserts the page count grew as reported, undoes
  **once** and asserts the document is restored, then checks the preset error path
  and a real export. Running it found the undo-group and undo-property bugs listed
  under _Fixed_; with those fixed it flows the whole story and one Undo restores
  the page count. **Measured live:** that flow is **1 tool call and 215 bytes** of
  JSON, against **6 calls and 786 bytes** for the nearest chain of atomic tools —
  which cannot place the text at all, because no tool places a text story into a
  frame
- **An opt-in success envelope (`RESPONSE_ENVELOPE_SUCCESS`).** Failures were
  already enveloped; successful results were not, so a host had to branch on
  `isError` and then guess the shape. Setting the flag (or
  `responseEnvelope.success: true` in the JSON config) wraps every successful
  result as `{ ok: true, ... }`, so one key covers both outcomes. Object results
  keep their fields at the top level — a host reading `parsed.name` is unaffected
  — while arrays and scalars nest under `result`. It is **off by default**
  because it is a response-shape change, and ships opt-in for one release before
  the shape becomes the default
- **A `files` allowlist for the published package.** There was a `.npmignore`
  denylist instead, which is how a stray 2.9 MB `bauhaus-page4.jpg` left at the
  repo root — referenced by nothing — rode along with `plans/` and a portfolio
  build script, for **4.4 MB unpacked**. The package now names exactly what a
  user needs: the built `dist/`, the bridge runtimes, the UXP plugin, the skill,
  and the `docs/` the README links to. That is **1.6 MB unpacked**, and the
  `.npmignore` is gone rather than left inert beside the allowlist, so there is
  one mechanism instead of two

### Changed
- **CI is reproducible and self-cancelling.** `actions/checkout` and
  `actions/setup-node` are pinned to commit SHAs (a repointed `@v5` changes what
  runs without any commit here changing), a `concurrency` group cancels
  superseded runs, permissions are read-only, and packaging is a separate job that
  depends on the matrix
- **Error responses are JSON text, not prose.** The failing message is preserved
  verbatim inside the envelope, so callers that read the text still see it, and
  `isError: true` is unchanged. This applies to exceptions caught by
  `withErrorHandling` (all tools) and to ExtendScript runtime errors surfaced by
  `formatResponse`
- **`document_close` now defaults `saveOptions` to `"no"`** (was `"ask"`).
  `"ask"` raised a modal save dialog that blocked the script until the bridge
  timed out and could leave InDesign wedged, and `"yes"` raises a Save As dialog
  for a document that has never been saved. `"no"` is the only default that
  cannot prompt. A caller that wants the work kept must call `document_save`
  first. Explicit values are unaffected, and `npm run smoke:macos` now closes a
  *dirty* document relying on that default, so a regression to `"ask"` is caught
  live instead of on a user's machine
- **`preview_document` failures are structured envelopes, not prose.** It used to
  catch its own errors and return a `preview failed: …` text block, which
  bypassed the error contract every other tool follows
- **The README no longer tells agents the wrong `document_close` default.** It
  still said `saveOptions` defaults to `ask` and advised passing `"yes"` or
  `"no"`; the safe default has since become `"no"`, and `"yes"` is itself unsafe
  on an unsaved document. The note now matches the schema, and the same stale
  comment in `scripts/smoke-macos.mjs` was corrected. The advertised test count
  and the `CONTRIBUTING` test figure were refreshed at the same time, and the
  README gained a pointer to `docs/architecture.md`
- **`undo_beginGroup` no longer overclaims.** Its description, and the workflow
  contract's "multi-step edits" note, said subsequent tool calls become a single
  undo step. That was never possible: each call is its own undo transaction and
  InDesign exposes no primitive to merge two of them. The wording now states what
  the flag really does — each subsequent call is internally one undo step, so one
  Undo reverts that whole call, while separate calls stay separate entries

### Fixed
- **`export_batchFolder` matched any character before `.indd`.** The strip regex
  was written `\.indd` inside a template literal, where `\.` is an unnecessary
  escape that silently loses the backslash: the ExtendScript received `/.indd$/i`,
  whose dot matches any character, so a file named `myindd` (no dot) had `yindd`
  stripped and was exported as `m`. A regression test now pins the emitted text.
  Found by the new lint config, not by a test
- **The packaged macOS bridge was broken on install.** `.npmignore` excluded
  `bridge-proxy.mjs` while shipping `start-bridge.sh`, which execs it, so anyone
  who installed from npm and ran `start-bridge.sh` got a missing-module error.
  `bridge-proxy.mjs` now ships, and `verify:pack` asserts that the files the
  package's own entry points invoke are inside the tarball — a handshake alone
  would not have noticed, because the server only reaches for the proxy when it
  runs a script
- **`ComScriptExecutor.removePending` had a dead expression.** `splice(index, 1)[0]`
  removed the entry and discarded the result; the `[0]` was vestigial
- **Two hidden characters in `stringUtils.ts`.** A zero-width space was used to keep
  a JSDoc comment from closing early with a literal `*/`. The comment was reworded
  so the sequence is never needed, removing the invisible character
- **A second template-literal escape bug in the ExtendScript JSON polyfill's
  comment**, where `\s` and `\(` were being dropped. Cosmetic (it is a comment),
  but fixed for consistency with the `export_batchFolder` one above
- **Every script failed while an undo group was open.** `wrapExtendScript` set
  `app.scriptPreferences.undoMode`, a property InDesign does not have: it threw
  "Object does not support the property or method 'undoMode'", so **every** tool
  call made after `undo_beginGroup` failed outright. The live recipe gate found it
  on its first run. The supported mechanism is
  `app.doScript(body, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT)`
  — the body passed as a *string* so `doScript` returns the program's completion
  value, and placed last, because the old trailing assignment would have replaced
  the result even if the property had existed
- **`undo`, `redo` and `undo_history` read properties that do not exist.**
  `document.undoable` and `document.redoable` are not part of InDesign's DOM, so
  reading them threw "Object does not support the property or method 'undoable'"
  and `undo` and `undo_history` failed on every call (`redo` never checked its
  own precondition). `undo`/`redo` now attempt the operation inside a `try`/`catch`
  and report what happened; `undo_history` states plainly that the DOM exposes no
  undo depth, instead of naming fields that are always undefined (`app.undoHistory`
  reflects only `length`, which is always `0`)
- **The error envelope's classification table was unreachable in production.**
  The macOS bridge reports *every* InDesign-side failure as `BRIDGE_ERROR`, and
  `classifyError` treated a transport code as authoritative — so "Object is
  invalid" or "PDF export preset not found" always arrived as `bridge_error` and
  never as `invalid_reference` or `invalid_arguments`. The two catch-all codes
  (`BRIDGE_ERROR`, `EXTENDSCRIPT_RUNTIME_ERROR`) now let the message rules decide
  and fall back to the generic code only when no rule matches; specific transport
  codes (timeout, cancelled, output too large) stay authoritative. The live smoke
  caught this by classifying a bad reference as `bridge_error`
- **The initialize contract named a script path that does not exist.** It told
  every session to launch "`scripts/start-bridge.sh` on macOS", but the script is
  `start-bridge.sh` at the repo root — there is no `scripts/` entry for it, so the
  instruction pointed at a 404 and the one moment it is needed is the one moment
  the bridge is already down
- **The server reported itself as v1.0.0, four releases after v1.0.0.** The
  version announced on `initialize` was a hardcoded `'1.0.0'` in the config
  default, and three more copies of the same dead string sat beside it in
  `indesign-nutria-mcp.json`, `opencode-indesign.json` and the UXP
  `plugin/manifest.json`. The advertised version is exactly what a host, a bug
  report and a support thread use to identify a build, and a stale one is worse
  than a missing one because it looks authoritative. `SERVER_VERSION` is now the
  single literal the default reads from, the two shipped config files state no
  version at all so they inherit it rather than pinning a stale one, the plugin
  manifest is stamped with the release version, and `.env.example` says why it
  deliberately leaves `SERVER_VERSION` unset — a value pinned in `.env` would
  keep reporting the version installed today after an upgrade. A 1.4.2 build now
  answers `initialize` with `version: "1.4.2"`. Two gates keep it that way:
  `tests/unit/serverVersion.test.ts` fails if the literal, the plugin manifest, or
  a config that omits the field disagree with `package.json`, and `verify:pack`
  reads the version the packed artifact announces — the exact place the bug was
  visible and nothing was looking (the assertion was checked by breaking the
  literal and watching it fail)
- **The `document_close` trap was guarded by a check that could not see it.** The
  live smoke closed with `saveOptions: 'no'` passed explicitly, so nothing noticed
  a schema default drifting back to `'ask'` — which on a *modified* document raises
  a modal save dialog, blocks until the bridge times out, and leaves InDesign
  wedged. `npm run smoke:macos` now dirties a document and closes it relying on
  the default

## [1.4.2] - 2026-09-27

Merges the fixes contributed through the forks, plus regression tests for each.

### Fixed
- **The WebSocket bridge never started under the default configuration.** Startup
  gated the bridge on `transport === 'websocket'`, but `'stdio'` is the default MCP
  transport and the one the shipped config specifies — so out of the box nothing
  listened on port 8120, no UXP panel or proxy could ever connect, and every tool
  call failed with "Bridge is not connected". The MCP transport and the InDesign
  bridge are independent concerns and are no longer coupled; the only case that
  still skips the listener is the Windows COM bridge, which drives InDesign
  in-process. Found by running the server for real: 194 unit and integration tests
  passed against a server that could not reach InDesign at all
- **Bridge responses are canonical and cannot be silently swallowed**: the protocol declared both `result` and `error`, but a single `else` branch resolved *every* response — including malformed and unknown-typed ones — as a success. The server now emits `{ type: 'result' | 'error', id, result | error }`, accepts the legacy `success` / `response` types on input, rejects an unknown type that carries a valid `id`, and discards frames with no `id`
- **The macOS JXA proxy mangled or lost script results** (from [PR #22](https://github.com/nutriandrea/adobe-indesign-mcp/pull/22), @advaitakelkar): `osascript` writes script *results* to **stderr**, so successful calls were read as failures; scripts were passed through shell `-e` quoting, which corrupts any quote, backslash or newline; and the app name was hardcoded to "Adobe InDesign 2024", so every other InDesign version failed
- **`bridge-proxy.mjs` no longer blocks the MCP server**: `execSync` froze the Node event loop for the whole duration of every script, so the server could not answer, ping or reconnect while InDesign worked. Execution is now asynchronous
- **The plugin handshake was executed as ExtendScript**: the connection test was passed through `app.doScript`, where it was parsed as a script rather than run as JXA
- **The MCP Bridge panel required a click to connect**, so it appeared dead even with the server already running (from @ijeetu). It now connects on open, and the button and auto-connect share one URL constant instead of two divergent defaults
- **Object results from `doScript` came back as `[object Object]`** instead of JSON
- **`Application(appName)` sat outside the driver's try block**, so a missing or mistyped `INDESIGN_APP` produced a raw JXA stack trace instead of the structured `__bridge_error` the proxy knows how to forward
- **`document_close` can wedge InDesign on a modal dialog**: `saveOptions` defaults to `ask`, which raises a save prompt that blocks the script until the bridge times out. The default is unchanged, but callers acting unattended must pass an explicit `yes` or `no`
- **The shipped `indesign-nutria-mcp.json` declared `transport: "websocket"`**, contradicting both the config default and the actual runtime; it is now `stdio`
- **InDesign 2026 anchoring**: creating an anchored object no longer relies on `move()`, which 2026 rejects for insertion-point targets

### Added
- **Plugin-free macOS setup**: `start-bridge.sh` launches InDesign and the JXA proxy, so no UXP panel has to be loaded. `bridge-proxy.mjs` gained `INDESIGN_APP`, `BRIDGE_WS_URL`, `BRIDGE_TIMEOUT_MS` and `BRIDGE_RECONNECT_DELAY_MS`
- **FIFO execution queue** in the JXA proxy: InDesign is single-threaded, so requests serialize in arrival order while the event loop stays free
- **`skills/indesign/indesign-mcp-layout`**: agent-facing guidance on preferring typed tools over raw ExtendScript, plus the COM property limits (`fontFamily`, `italic`, `weight` throw) and read-only enum traps
- **Documented the no-cancellation hazard**: a hung script leaves the Windows COM bridge wedged, because the timeout rejects the request without killing `cscript` and `ensureProcess()` only respawns a dead process. The macOS proxy is unaffected — `execFile`'s `timeout` terminates the child
- 41 new unit tests: bridge protocol matrix, proxy config, JXA transport, FIFO queue, plugin bundle agreement, shipped-config guards, a README/registry consistency guard, and real `osascript` execution tests for the JXA driver

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

[1.6.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.3...v1.5.0
[1.4.3]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nutriandrea/adobe-indesign-mcp/releases/tag/v1.1.0
