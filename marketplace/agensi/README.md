# Agensi listing

Packaging for the free companion skill listed on
[agensi.io](https://agensi.io) — a marketplace for agent skills. The skill
teaches an agent **when and how** to drive `indesign-nutria-mcp`; the server is
installed separately by the user, which is how the marketplace expects an
external MCP dependency to work.

Nothing here is shipped to npm. Like `mcpb/`, this directory exists to produce a
distribution artifact for a store, not a library.

## What is in here

| Path | Role |
| --- | --- |
| `indesign-layout/` | The skill folder — exactly what goes inside the zip |
| `indesign-layout/SKILL.md` | The artifact the buyer's agent loads |
| `indesign-layout/SETUP.md` | Install, host config and bridge steps, so the listing stands alone |
| `indesign-layout/README.md` | Buyer-facing orientation |
| `listing.md` | The copy to paste into the Agensi form |
| `README.md` | This file |

The skill folder is named `indesign-layout`, matching the `name:` in its
frontmatter. Agensi's spec requires the two to match exactly — a mismatch is the
most common reason a skill fails to load.

## Building the upload zip

Agensi takes a zip. `config/` is **not** checked in here: it is copied from
`examples/` at build time, so the configs a buyer receives cannot drift from the
ones the repo already tests.

```bash
npm run build:agensi
```

That writes `dist-agensi/indesign-layout-<version>.zip`, where `<version>` is
the package version. The archive's single top-level folder is the skill folder:

```
indesign-layout/
├── SKILL.md          # from this directory
├── SETUP.md          # from this directory
├── README.md         # from this directory
└── config/           # copied from examples/ at build time
    ├── claude-desktop.json
    ├── claude-desktop.windows.json
    ├── cursor.json
    ├── claude-code.md
    └── README.md
```

Upload the zip, then paste the fields from `listing.md` into the form.

## Rules this package follows

Agensi's creator checklist fixes the shape of the archive: one top-level folder
named after the skill, `SKILL.md` at its root, text files only, no OS cruft.
`build:agensi` re-opens its own output and asserts exactly that, so a zip that
would be rejected cannot be produced quietly.

Beyond the format, three things are guarded by this repo:

- **Tool names are real.** `tests/unit/skillGuidance.test.ts` walks `skills/`
  and `marketplace/` and fails if a `SKILL.md` names a tool the server does not
  register. The shipped skill had drifted — it named `health_check` and
  `list_ai_skills`, neither of which ever existed — which is what this guard now
  prevents.
- **The tool count is real.** `npm run verify:tool-counts` reads the markdown
  here along with the README, `llms.txt` and the package description, so the
  number quoted to a buyer cannot disagree with the registry.
- **The install step is real.** The configs point at a local build, not at an
  npm package that does not exist yet. `SETUP.md` says so plainly and names the
  one-line install as the thing that follows the publish.

## The paid tier

Anything the listing might sell beyond the free skill does **not** belong in
this repository: a public repo is not the place for material sold on the
strength of not being in it. Keep that packaging elsewhere.
