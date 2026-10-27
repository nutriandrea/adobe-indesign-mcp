# Development

How to build, test, and live-test `indesign-nutria-mcp`. For how the pieces fit
together, read [architecture.md](architecture.md) first.

## Prerequisites

- **Node.js 18+** (CI runs the 18 / 20 / 22 matrix)
- **Adobe InDesign** installed — only needed for the live smoke test; the unit
  suite runs without it
- **macOS or Windows** for InDesign automation (the server and its tests run
  anywhere, including Linux CI)

## Getting started

```bash
git clone https://github.com/nutriandrea/adobe-indesign-mcp
cd adobe-indesign-mcp
npm install
npm run build          # tsc -> dist/
npm run dev            # tsx watch src/index.ts (no build step)
```

The server is published to npm — `npx -y indesign-nutria-mcp` is what user
configs run. This document is about running it from a clone, which is what you
want for development.

## npm scripts

| Script | What it does |
|--------|--------------|
| `npm run build` | `tsc` → `dist/` |
| `npm run dev` | watch mode via `tsx` (run the source directly) |
| `npm test` | the full vitest suite |
| `npm run test:watch` | vitest in watch mode |
| `npm run lint` | `eslint src scripts --ext .ts` — **exits non-zero on a finding** |
| `npm run lint:fix` | the same with `--fix` |
| `npm run verify:tool-counts` | fails if any advertised tool count drifts from the registry |
| `npm run docs:tools` | regenerates `docs/available-tools.md` from the registry |
| `npm run verify:docs` | fails if `docs/available-tools.md` is stale |
| `npm run verify:pack` | build → `npm pack` → install the tarball → boot it and assert 198 tools |
| `npm run server:json` | regenerates `server.json` (the MCP Registry manifest) from `package.json` |
| `npm run verify:server-json` | fails if `server.json` is stale |
| `npm run build:mcpb` | packs `dist-mcpb/indesign-nutria-mcp-<version>.mcpb` (MCP Bundle, ~10 MB) |
| `npm run validate:release-tag` | fails unless the tag is `v<package.json version>` and has CHANGELOG notes |
| `npm run verify` | `lint` + `verify:tool-counts` + `verify:tool-names` + `verify:docs` + `verify:server-json` + `test` (the CI gate) |
| `npm run smoke:macos` | the live four-process smoke test (needs a running InDesign) |
| `npm run smoke:recipes` | the live gate for the two recipes (needs a running InDesign) |
| `npm run smoke:dom` | the live gate for images, links and preflight (needs a running InDesign) |
| `npm run smoke:target` | the live gate for `document_id` (needs a running InDesign) |

## Test layout

```
tests/
├── unit/            # one file per module; unit/handlers/ mirrors src/handlers/
├── integration/     # server lifecycle, express bridge, handler registration
├── contract/        # toolInventory + errorRecovery — pin the public surface
├── e2e/             # placeholder for the live scenario suite (see below)
└── helpers/         # loadHandlers.ts — the shared registry loader
```

Two contract tests are load-bearing and worth knowing about:

- `tests/contract/toolInventory.test.ts` pins `EXPECTED_TOOL_COUNT` and parses
  the README's handler table, so the catalog cannot silently drift.
- `tests/contract/errorRecovery.test.ts` asserts that every
  `suggested_next_tool` an error envelope can emit names a tool that is
  actually registered.

Coverage thresholds (lines 85, functions 85, branches 80, statements 85) are
declared in `vitest.config.ts`. Coverage is **not** part of the CI gate today:
CI runs `npm test`, not `--coverage`, and the suite currently sits just under the
declared line/statement threshold, so `npx vitest run --coverage` will report a
threshold error. Treat the numbers as an aspiration to raise, not a gate to pass.

## Test conventions

**Development is on `main`; CI must be green.**

**macOS-only tests are skipped, never failed, off-platform.** CI runs on Ubuntu,
where `osascript` does not exist. A test that spawns it must guard itself:

```ts
const isMacOS = process.platform === 'darwin';

it.skipIf(!isMacOS)('reports a failure as parseable JSON', async () => {
  // spawns the real osascript
});
```

`tests/unit/jxaDriverExec.test.ts` is the reference for this pattern.

**Platform *branches* are simulated, not skipped.** When the code under test
branches on `process.platform` (e.g. refusing the COM bridge on non-Windows),
override and restore it:

```ts
const originalPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'win32' });
try {
  // …assert the Windows branch…
} finally {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
}
```

`tests/integration/serverLifecycle.test.ts` is the reference for this pattern.

## The live smoke test

```bash
npm run smoke:macos
```

The mocked suite cannot see the **seams between the four processes** on the
plugin-free macOS path (MCP stdio → WebSocket bridge → JXA proxy → InDesign). A
P0 in `v1.4.2` proved it: 965 tests passed against a build whose bridge never
listened on its port, so every tool call failed in the field and nothing went
red. `smoke:macos` drives the real chain against a running InDesign.

What it does:

1. boots the server on a **non-default port** (`SMOKE_PORT`, default `8131`) so
   it never fights a bridge you already have running;
2. checks `initialize` advertises the workflow contract and `tools/list`
   returns 198 tools;
3. starts `bridge-proxy.mjs` and waits for `mcp://bridge/status` to report
   connected;
4. creates a document, adds a text frame, reads it back, calls
   `document_getInfo`;
5. asserts a **bad reference** comes back as a structured error envelope — the
   only check that proves the error contract survives all four processes;
6. closes the document without saving.

It exits non-zero on the first real failure, and exits **0 with a SKIP notice**
if InDesign is not running (`pgrep -x "$INDESIGN_APP"` finds nothing). It is not
part of `npm test` and never runs on CI, because it needs a desktop app and
mutates a real document. **Run it by hand before releasing any change to the
bridge, the protocol, the proxy, or the driver.**

Set `INDESIGN_APP` to your installed version if it is not `Adobe InDesign 2026`.

### The recipe live gate

```bash
npm run smoke:recipes
```

The unit tests for the two recipes pin the *shape* of the ExtendScript they emit,
not that InDesign agrees with it. `smoke:recipes` closes that gap. It creates a
document, flows a 300-paragraph text file through `recipe_flowTextStory` (which
must add pages to fit it), asserts the page count grew by exactly what the tool
reported, then calls `undo` **once** and asserts the document is back to one page
— the plan's "one Undo reverts the whole outcome". It then covers both preset
paths: a bad name must fail as `invalid_arguments` and list the valid presets,
and a good one must write the PDF. It uses bridge port `8133`, exits **0 with a
SKIP notice** when InDesign is closed, and is not part of CI either.

> The `tests/e2e/` directory is still a placeholder for a broader live scenario
> suite and is not wired into `npm test`. Today the working live tests are
> `smoke:macos` (the bridge seams), `smoke:recipes` (the recipes),
> `smoke:target` (`document_id`) and `smoke:dom` (images, links, preflight).

### The DOM-contract live gate

```bash
npm run smoke:dom
```

The unit suite pins the *shape* of the ExtendScript each handler emits. It cannot
know whether InDesign has the member that script names, and that gap shipped real
defects. `Image.imageLink`, `Link.embedded`, `Link.embed()` and
`Document.preflightProcesses` all read like documented API and none of them
exist, so six tools failed on every document while the suite stayed green.

`smoke:dom` is those failures written as assertions: 48 of them, in three
sections, each in a throwaway document that is closed without saving.

- **Images** — a place completes and reports the status it read, `image_list`
  and `image_info` resolve the source through `itemLink`, the reported native
  resolution is not the constant `300` and the effective resolution is not a
  scale percentage, a relink takes effect, and a source deleted afterwards is
  reported `link_missing`.
- **Links** — listing, inspecting and reading an image's links all survive a
  document that has a link, status comes back as a word rather than `{}`,
  embedding goes through `unlink()` and unembedding with no folder links back to
  the original source. Editing the file on disk must produce
  `link_out_of_date`, which `resources_updateAllLinks` then fixes, and deleting
  it must produce `link_missing`, which that tool reports by name instead of
  throwing.
- **Preflight** — a clean document reports no findings and the profile it ran, a
  document with overset text reports them with page and detail, an unknown
  profile fails and lists the profiles that exist, and no preflight process is
  left behind. Packaging is checked in the same document: the report has to
  match what is on disk, and a refusal may not also carry a copy count.

It generates its own PNG sources, uses bridge port `8137` so it cannot collide
with the main bridge on `8120`, and exits **0 with a SKIP notice** when InDesign
is closed. It is not part of CI, for the same reason as the other live gates.

### The document-target live gate

```bash
npm run smoke:target
```

The unit suite proves the wiring — `registerTool` adds `document_id` to the
schema, `wrapExtendScript` injects it as a string literal, the resolver throws
when the target is not open. What no mocked test can prove is the behaviour the
feature exists for: with **two** documents open, a call that names the *non-front*
document must edit that document and leave the front one alone. `smoke:target`
does exactly that against a real InDesign, over the real four processes.

What it does:

1. boots the server on bridge port `8132` (`SMOKE_TARGET_PORT`) so it never
   fights your own bridge or the other smoke tests;
2. asserts `initialize` **names `document_id` in the workflow contract**, and
   that `tools/list` advertises `document_id` in a tool schema — the live proof
   it survives the SDK's schema handling;
3. creates two documents (`A`, then `B`), reads which one InDesign made front,
   and targets the **other** one by name: the edit must land on the named
   document and the front one must stay empty;
4. targets by 0-based index and confirms it resolves to the same document;
5. omits `document_id` and confirms the edit lands on the front document — the
   additive guarantee;
6. passes an unopened `document_id` and confirms the envelope is
   `document_not_found` with `suggested_next_tool: document_listOpen`;
7. passes a **hostile** `document_id` (`x'); app.documents[0].close(...)`) and
   confirms it is inert: every document is still open;
8. closes the two documents it created **without saving**, and asserts every
   document that was open before the run is still open after it.

Set `INDESIGN_APP` to your installed version if it is not `Adobe InDesign 2026`.

## Verification gates

Four scripts guard the things that go stale silently:

- **`verify:tool-counts`** reads the registry (the same
  `tests/helpers/loadHandlers.ts` the server uses) and fails if the README
  prose, the badge, the package description, `llms.txt`, or the README
  handler-table sum disagree with it. It deliberately ignores the README's
  per-category headings (`### Text & Typography (27 tools)`) — those are
  overlapping sub-totals with an uncounted "Other" bucket and do not sum to the
  total.
- **`verify:docs`** regenerates `docs/available-tools.md` and fails if the file
  on disk differs. Change a tool, run `npm run docs:tools`.
- **`verify:server-json`** regenerates `server.json` and fails if the file on
  disk differs. The registry rejects a manifest whose name or version disagrees
  with the package with a generic "package validation failed", so this is the
  cheap place to catch it.
- **`verify:pack`** packs the tarball, installs it into a temp dir, boots the
  packed entry point over stdio, and asserts it advertises 198 tools — the check
  that catches a `files` allowlist shipping `start-bridge.sh` without the
  `bridge-proxy.mjs` it execs. It also asserts those runtime files are present by
  name, because a handshake alone would not notice: the server only reaches for
  the proxy when it actually runs a script. And it asserts the version announced
  on `initialize` matches `package.json`, because a live handshake is the only
  place a stale advertised version was ever visible.

`npm run verify` runs lint + the count/doc/manifest gates + the test suite; CI
runs it on Node 18, 20, and 22, then a separate job runs `verify:pack`.

## Distribution artifacts

Four artifacts exist only to get this server installed, and a unit test is the
only thing that runs them:

| Artifact | Source | Guarded by |
|---|---|---|
| `server.json` — MCP Registry manifest | generated from `package.json` | `verify:server-json` + `tests/unit/distributionManifests.test.ts` |
| `mcpb/manifest.json` — MCP Bundle manifest | hand-written | `tests/unit/serverVersion.test.ts`, `tests/unit/distributionManifests.test.ts` |
| `examples/*.json` — client configs | hand-written | `tests/unit/distributionManifests.test.ts` |
| `llms.txt` — agent/directory index | hand-written | `verify:tool-counts` |

Two facts to know before touching them:

- **`server.json`'s `name` must equal `package.json`'s `mcpName`.** That equality
  is the entire ownership proof the registry uses: it fetches the published npm
  package and compares the two. A mismatch fails the publish with no useful
  error, which is why `server.json` is generated and gated rather than typed.
- **The bundle's entry point is `dist/index.js`, not the conventional
  `server/index.js`.** MCPB's convention is a `server/` directory, but this
  server resolves `assets/windows/*.vbs` as `../../assets/…` from
  `dist/bridge/`, so `scripts/build-mcpb.mjs` stages the *published package
  layout* (the exact bytes `verify:pack` booted) instead of moving the code.
  Repointing `entry_point` without also moving that relative path breaks the
  Windows bridge inside the bundle.

`npm run build:mcpb` writes `dist-mcpb/indesign-nutria-mcp-<version>.mcpb`
(gitignored; it embeds production `node_modules`). It is not built in CI —
`release.yml` does, and attaches it to the GitHub Release. The build proves its
own output: it re-opens the finished archive, asserts `manifest.json` is at the
root, asserts `assets/windows/run_jsx_persistent.vbs` is where the Windows path
reaches for it, and boots the server inside the archive to confirm it answers
`initialize` with the workflow contract and 198 tools. It also prints the
SHA-256 of the artifact, which a future `registryType: "mcpb"` entry in
`server.json` would need. The archive is deliberately not byte-reproducible —
`npm install` writes metadata — so the hash is of the uploaded artifact, not of
the inputs.


## Adding a tool

1. Add the tool to the right handler in `src/handlers/` (or create one),
   with a Zod schema for its arguments.
2. Implement the handler method — build ExtendScript, call
   `this.executor.execute(code)`, return `formatResponse(result)`.
3. Register the handler in `src/handlers/IndesignMcpServer.ts` if it is new.
4. Add a unit test in `tests/unit/handlers/`.
5. Update the README's handler table and the "What It Can Do" counts if the
   totals moved.
6. Run the gates:

```bash
npm run docs:tools     # regenerate the tool catalog
npm run verify         # lint + counts + docs + tests
```

`npm run verify:tool-counts` will tell you every place that still needs the new
number.

## Releasing

The changelog is [CHANGELOG.md](../CHANGELOG.md). A release is a tag push; the
workflows do the rest.

1. **Bump the version** in `package.json`, `plugin/manifest.json` and
   `mcpb/manifest.json`, plus `SERVER_VERSION` in `src/utils/configLoader.ts`.
   `tests/unit/serverVersion.test.ts` fails if any of them disagrees.
2. **Add a dated section** to `CHANGELOG.md` — `## [x.y.z] - YYYY-MM-DD`. It
   becomes the release notes, so a missing section fails the release rather than
   publishing an empty one.
3. `npm run server:json` (the registry manifest is generated from the version).
4. Run `npm run verify`, `npm run verify:pack`, and the live smoke tests
   (`smoke:macos`, `smoke:recipes`, `smoke:target`) on a machine with InDesign.
5. `git tag v<x.y.z> && git push origin v<x.y.z>`.

`scripts/validate-release-tag.sh` is the gate for steps 1–2 and refuses a tag
that does not match `package.json` or has no CHANGELOG section:

```bash
npm run validate:release-tag -- v1.5.0
```

`.github/workflows/release.yml` then runs `verify` and `verify:pack`, publishes
to npm with provenance, builds the `.mcpb` and attaches it to the GitHub
Release, and creates the release from the CHANGELOG section.
`.github/workflows/publish-mcp-registry.yml` publishes `server.json` to the MCP
Registry, called as a job of the release rather than chained off it so it cannot
start before npm has the package.

Running after the publish is not enough on its own: the registry verifies
ownership by fetching the package from npm, and npm serves a newly published
version a few minutes after `npm publish` returns. The registry job therefore
waits with `scripts/wait-for-npm-version.mjs`, which polls
`/<package>/<version>` until it answers and fails after 15 minutes otherwise.
Re-running that job by hand is the correct repair when npm is merely slow.

**What is still blocked on credentials, not code:** nothing. The npm publish
uses OIDC trusted publishing — no `NPM_TOKEN` and no repository secret. The
package's trusted publisher names `nutriandrea`, `adobe-indesign-mcp` and
`release.yml`, and `release.yml` grants `id-token: write`; npm mints a
short-lived token for the run. A mismatch between that configuration and the
workflow fails the publish, and npm reports it as a 404 on the publish `PUT`
rather than as an authentication error. The registry workflow needs no secret
either; it authenticates with GitHub OIDC.
