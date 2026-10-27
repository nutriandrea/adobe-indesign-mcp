# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`export_package` — packaging for print.** Collects the fonts and linked
  graphics a document depends on, plus the package report, into one folder, via
  `Document.packageForPrint`. The tool passes all fourteen positional arguments
  the DOM reference defines, in the documented order, and defaults to the
  honest ones: fonts and links collected, the document's own links left alone,
  no PDF nobody asked for, and **preflight errors cancel the packaging** rather
  than being swallowed. When that happens the result says so and points at
  `export_preflight`, because a package that silently ships with a broken link
  is worse than one that refuses. `packageForPrint` declares a `Boolean` return
  and **does not throw** when it refuses: it returns `false` and writes nothing,
  so the tool checks the value instead of trusting a clean exit. The inventory
  it reports walks the subfolders, because InDesign puts the fonts and links in
  `Document fonts/` and `Links/` and a top-level listing finds an empty folder.
  Verified live against InDesign 2026 on macOS: the default call reports the
  refusal and leaves the folder empty, and with `ignorePreflightErrors: true`
  the package contains the font (`MinionPro-Regular 2.otf`), the linked graphic
  and a copy of the document.

### Fixed
- **The image and link tools called DOM members that do not exist.** Four of
  them failed outright, and one reported numbers it had invented:
  - `Image.imageLink` is not a property. The source file of a placed graphic is
    `Image.itemLink`, so `image_place`, `image_relink`, `image_info` and
    `image_getLinks` threw after the work was already done — `image_place`
    placed the graphic and *then* failed reading it back, which made a
    successful place look like a failed one.
  - `Link.embedded` is not a property either, so `resources_listLinks`,
    `resources_getLinkInfo` and `image_getLinks` failed on **every** document
    that had a link at all. Embedding is signalled by the link's status
    (`LINK_EMBEDDED`); `Link.needed` is false for ordinary linked files too, so
    it cannot stand in, and a shared `__isEmbedded` helper now answers the
    question from the status.
  - `Link.embed()` is not a method. The DOM embeds a file with `link.unlink()`,
    which is what `resources_embedLink` calls now, and it reports the status it
    read back instead of asserting `embedded: true`.
  - `resources_unembedLink` passed a `File` to `unembed()`, which takes the
    *Folder* to copy the unembedded file into. The parameter is now an optional
    `folderPath`; without it the link goes back to its original source, which
    is the behaviour most callers wanted and the only one that needs no guess.
  - `resources_updateAllLinks` called `everyItem().relink()`, which throws
    `Parametro richiesto "to" mancante`: `relink()` needs a path that a bulk
    call cannot invent. It now updates the links whose source changed and
    reports the missing ones by name, so the caller can relink them explicitly.
  - `image_info` reported `actualPpi: 300` as a constant and `horizontalScale`
    (a percentage) as `effectivePpi`. It reads the graphic's real `actualPpi`
    and `effectivePpi`, and the colour space, instead of making numbers up.
  - `Link.status` is a numeric enum, so `JSON.stringify` turned every reported
    status into `{}`. A shared `__linkStatus` helper maps all five `LinkStatus`
    members to words (`normal`, `link_missing`, …), and the tools use it.
  Verified live against InDesign 2026 on macOS on throwaway documents: 14/14
  checks for the image tools (including a deleted source reported as
  `link_missing`) and 23/23 for the link tools (embed → unembed → a source
  edited on disk reported as `link_out_of_date` and updated → a source deleted
  reported as missing rather than silently "updated").
- **`export_preflight` could not run at all.** It looked for
  `preflightProcesses` on the *document*, where the collection does not exist —
  it lives on `Application` — then called `add()` with only a profile name,
  called `start()` on the process, and read a `process.errors` that the DOM
  never defines. Every call failed. The documented API is
  `Application.preflightProcesses.add(document, appliedProfile)` plus
  `waitForProcess()` and `aggregatedResults`; the profile is **required**, so
  the tool now passes one explicitly. Because `waitForProcess()` returns
  `false` and can throw for a process that has already finished, its value is
  not reported as truth: the tool reads the results the DOM actually exposes
  and says whether it found problems. The result carries `hasErrors`, the
  findings with the hierarchy InDesign groups them in (`parentNodeID`,
  `errorName`, `pageNumber`, `errorInfo`, `details`) and the raw
  `processResults` report, plus the profile that ran. `itemByName()` cannot
  resolve the profile InDesign itself lists as `[Basic]` / `[di base]` — the
  brackets defeat it — so names are matched against the collection, and an
  unknown name fails with the list of profiles that do exist. The old
  `waitForCompletion` flag is gone, since a process left running and then
  auto-removed cannot be read; `timeoutSeconds` bounds the wait instead.
  Verified live against InDesign 2026 on macOS (16/16 checks): a clean document
  reports `hasErrors: false`, a document with overset text reports the three
  findings with page and remedy text, an unknown profile lists both available
  profiles, and four consecutive runs left no preflight process behind.
  The same run also showed that **packaging uses the preflight setup embedded
  in the document**, not the profile this tool runs: a document with overset
  text and no embedded profile packages successfully, so the two can disagree.
  The `export_package` hints and this tool's description now say so.
- **The Windows COM bridge mangled every non-ASCII character.**
  `run_jsx_persistent.vbs` read the `.jsx` that `ComScriptExecutor` writes as
  UTF-8 through `FileSystemObject.OpenTextFile`, which decodes in the system
  ANSI code page, so `Yayınları` reached InDesign as `YayÄ±nlarÄ±` — in the
  story, on the page, in the exported PDF. The tool result hid it: `cscript`'s
  stdout is ANSI too, so the same mistake ran backwards on the way out and Node
  saw the original text. Real Unicode coming from InDesign (a document named
  `Başlıksız-1`) arrived as `Ba�l�ks�z` for the same reason. The script now
  reads the file through `ADODB.Stream` as UTF-8 and writes every character
  above U+007F as a `\uXXXX` escape, which is valid as-is inside the JSON
  results and is decoded by `ComScriptExecutor` on `ERROR:` lines; the `.vbs`
  is kept pure ASCII because `cscript` reads it in ANSI as well. Verified live
  on Windows 11 with InDesign 2026: the same probe script returned a string
  length of 24 through the old bridge and 16 — the true length — through the
  new one, and the exported PDF shows the right glyphs. A contract test pins the
  UTF-8 read, the escaping and the ASCII-only source, and `WINDOWS.md` now says
  the COM path has been run live once rather than never.

- **`export_document` advertised a `package` format the DOM cannot provide.**
  `ExportFormat` has no `PACKAGE` member — the enum is `TAGGED_TEXT`,
  `PDF_TYPE`, `EPS_TYPE`, `RTF`, `TEXT_TYPE`, `XML`, `JPG`, `INTERACTIVE_PDF`,
  `FIXED_LAYOUT_EPUB`, `HTMLFXL`, `INDESIGN_SNIPPET`, `INDESIGN_MARKUP`,
  `INCOPY_MARKUP`, `PNG_FORMAT`, `HTML`, `EPUB` — so the mapping emitted
  `ExportFormat.PACKAGE` into ExtendScript, evaluated to `undefined`, and every
  call failed after the tool had already promised it would work. Packaging is a
  separate operation with its own arguments, so it is now `export_package` and
  the format is gone from `export_document`.
- **The MCP Registry job no longer races npm's own propagation.** `npm publish`
  exiting 0 means the version was accepted, not that npm already serves it:
  `/<package>/<version>` can answer 404 for minutes afterwards while the
  packument and CDN catch up. The registry proves ownership by fetching the
  package from npm, so on 1.6.1 it got a 404 for a version that was published
  correctly, and `mcp-publisher publish` rejected the server — a red release
  that only a manual re-run four minutes later cleared. `release.yml`'s registry
  job now runs `scripts/wait-for-npm-version.mjs` before publishing
  `server.json`, which polls the version endpoint until it serves the version
  being released and fails loudly if it never does.
- **The Agensi listing claimed Windows support it has never been given.** The
  free listing is live with "macOS and Windows are both supported" in the copy
  and in `SETUP.md`, but the platform is only ever exercised on macOS: the
  Windows path drives InDesign over an in-process COM bridge that has no
  end-to-end verification, which is why the Windows half of the live smoke
  suite is still open. A buyer on Windows would have read a promise nobody
  tested. The wording now says what is true — macOS is the tested platform,
  Windows is documented in `SETUP.md` but unproven — and `listing.md` spells out
  the structured "Requires" field, whose first upload omitted **Adobe InDesign**,
  the one requirement that cannot be worked around, while listing Git.

## [1.6.1] - 2026-10-19

### Changed
- **Every install path is now the published one-liner.** The package has been on
  npm since 1.6.0, so the clone-and-build install every document described was
  the wrong first step. `examples/` (Claude Desktop, the Windows COM variant,
  Cursor, Claude Code), the README quick start, `llms.txt`,
  `docs/development.md` and the free Agensi listing all use
  `npx -y indesign-nutria-mcp`. The clone survives as the development path, and
  as what the **macOS bridge** needs: `plugin/` for the UXP panel, and
  `start-bridge.sh` with `bridge-proxy.mjs` otherwise. Those steps no longer
  ask for `npm run build` — the proxy imports only Node builtins and `ws` and
  never touches `dist/`. Windows needs neither, since the COM bridge drives
  InDesign in-process.
- **`opencode.json` was in the OpenCode V1 shape**, so no V2 install read it:
  server names go under `mcp.servers`, the type is `local`, the command is an
  array, and a server is turned off with `disabled` — there is no `enabled`
  field. `tests/unit/distributionManifests.test.ts` no longer asserts the old
  state (`command === 'node'`, and examples must not contain `npx`); it asserts
  `npx -y <package.json name>`, so a package rename fails in CI instead of in a
  user's first run.
- **Publishing to npm uses OIDC trusted publishing.** `release.yml` no longer
  reads `NPM_TOKEN`; GitHub mints a short-lived token for the workflow and npm
  accepts it because the package's trusted publisher names
  `nutriandrea/adobe-indesign-mcp` and `release.yml`. The workflow installs a
  pinned npm 11, because trusted publishing needs npm >= 11.5.1 and Node 22
  still ships npm 10. No long-lived credential is left to rotate or leak.

### Fixed
- **The MCP Registry publish now runs as a job of the release.** It was chained
  off `release: published`, and a release created by `release.yml` uses the
  default `GITHUB_TOKEN` — GitHub does not start new workflow runs for events
  raised by that token, so the chain never fired and 1.6.0 reached npm and
  GitHub without reaching the registry. `release.yml` calls
  `publish-mcp-registry.yml` as a job with `needs: release`; the `release` event
  trigger stays for releases made by hand.
- **`server.json` no longer exceeds the registry's 100-character description
  limit.** One over-long description rejects an otherwise valid publish with a
  generic validation error, and the generator now refuses one before it is
  written: the package description is 92 bytes, and the byte count is checked
  because UTF-8 never reports fewer bytes than characters.
- **`npm publish --dry-run` failed inside its own `prepublishOnly` check.** npm
  hands its configuration down to lifecycle scripts, so the dry run set
  `npm_config_dry_run` for the whole chain: `npm pack` returned a manifest, a
  shasum and a size for a tarball it never wrote, and the `npm install` after it
  died with ENOENT on the prefix directory it never created (exit 254). The one
  rehearsal meant to confirm the package is sound reported it as broken.
  `verify-pack.mjs` now drops the inherited flag before it spawns anything, and
  `tests/unit/verifyPackScript.test.ts` keeps that drop ahead of the first npm
  child. A real publish is unaffected — it never sets that flag.

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

[Unreleased]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.6.1...HEAD
[1.6.1]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.3...v1.5.0
[1.4.3]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/nutriandrea/adobe-indesign-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/nutriandrea/adobe-indesign-mcp/releases/tag/v1.1.0
