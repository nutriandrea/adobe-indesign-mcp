# Listing copy

Ready to paste into the Agensi "sell" form. Fields are labelled to match the
form's own sections; adjust freely — this is the draft, not a contract.

## Title

Adobe InDesign Layout

## Short description (one line)

Drive Adobe InDesign from your agent: build and edit layouts, flow manuscripts,
create tables and a table of contents, and export press-ready PDFs through the
indesign-nutria-mcp server.

## Category

Branding & Design

## Price

Free

## Tags

indesign, layout, desktop publishing, print, pdf, adobe, typography, catalog,
brochure, automation

## Description

**Before you install — this skill needs two things, and it can supply neither.**

- **Adobe InDesign, installed and licensed, on the machine that runs your
  agent.** InDesign has no headless mode: the skill drives the application you
  have open. Without it, and without a license, nothing here works.
- **The `indesign-nutria-mcp` server, installed separately.** It is on npm: the
  config is one line, `npx -y indesign-nutria-mcp` (package name
  `indesign-nutria-mcp`). The skill can neither host nor install a server for
  you.

Node.js 18 or newer. The skill is tested on macOS. Windows drives InDesign
through an in-process COM bridge; it is documented in `SETUP.md` but has not
been verified end-to-end, so treat it as unproven rather than supported.

**What it does.** This skill teaches an agent *when* and *how* to drive
indesign-nutria-mcp — an MCP server for Adobe InDesign — so layout work happens
in the real application instead of being described in prose. Creating and
editing documents, placing and flowing text and images, building styled tables,
applying paragraph and character styles, working with master pages, generating
a table of contents or an index, mail-merging a data source, and exporting to
PDF, EPUB or a named print preset.

The server exposes 199 tools across 35 handlers. The skill is the layer
that makes them usable: which tool to reach for, the order to call them in,
and the failure modes that otherwise waste a session — raw scripts that cannot
be cancelled, a stale page index, a front-document assumption when several
documents are open, a modal save dialog that wedges InDesign.

**Why it is free.** The server is MIT and open source. This companion skill is
the same guidance, packaged for agents — it exists to make the server
discoverable and to make the install trivial.

**What you get.** A `SKILL.md` your agent loads, a `SETUP.md` with the install
and bridge steps, and copy-paste configs for Claude Desktop, Cursor and Claude
Code.

## Requirements (please show these on the listing)

The listing form has a **structured "Requires" field**, separate from this copy.
Whatever it shows is what a buyer reads first, and the first upload got it wrong:
it listed *Node.js, macOS, indesign-nutria-mcp and Git* while omitting
**Adobe InDesign** itself — the one requirement that cannot be worked around.
Select:

- **Adobe InDesign** — the application the skill drives, installed and licensed
  on the machine that runs the agent.
- **Node.js** — 18 or newer.
- **macOS** — the platform this package is tested on.
- **the `indesign-nutria-mcp` server** (the form shows it as *Indesign Nutria MCP*).
- **Git** — only if the reader uses the clone-based macOS bridge step; the `npx`
  config does not need it. Optional, and fine to leave out.

Do **not** select Windows yet: the COM bridge has not been verified end-to-end on
a Windows machine, and the copy above is worded to match.

The requirements themselves, in prose:

- **Adobe InDesign, installed and licensed.** The skill drives the application
  on your machine; InDesign has no headless mode.
- **The indesign-nutria-mcp server, installed separately.** It is on npm: the
  config is one line, `npx -y indesign-nutria-mcp`. The skill can neither host
  nor install a server for you; `SETUP.md` walks through it.
- **Node.js 18 or newer.** Tested on macOS; see the Windows note above.

## Notes for the reviewer

- The skill runs no scripts of its own. It instructs the agent to call tools
  the server exposes; the server is installed separately by the user.
- Everything the skill does happens in the user's own InDesign, on their
  machine, over a local bridge.
- Setup starts a local bridge (a WebSocket listener on `127.0.0.1:8120` on
  macOS, or an in-process COM bridge on Windows). There is no remote service
  and no data leaves the machine.
- The `SETUP.md` and the configs name the real install: the npm package
  `indesign-nutria-mcp`, run with `npx -y indesign-nutria-mcp`. It is
  published, and the macOS bridge step points at this same GitHub repository,
  so there is no third-party code involved anywhere.
