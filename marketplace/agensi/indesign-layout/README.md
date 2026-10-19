# InDesign Layout

An agent skill for driving **Adobe InDesign** through the
[`indesign-nutria-mcp`](https://github.com/nutriandrea/adobe-indesign-mcp)
server: layout, typesetting, styles, tables, master pages, tables of contents,
indexes, data merge, and export to PDF, EPUB or a print preset.

## What is in this folder

| File | What it is |
| --- | --- |
| `SKILL.md` | The skill your agent loads |
| `SETUP.md` | Install and wiring, start to finish |
| `config/` | Copy-paste host configs (Claude Desktop, Cursor, Claude Code) |

## Requirements

- **Adobe InDesign**, installed and licensed. The skill drives the application
  on your machine — InDesign has no headless mode.
- **The `indesign-nutria-mcp` server**, installed separately. It is not on npm
  yet, so setup is a clone and a build today. `SETUP.md` walks through it.
- **Node.js 18+**. macOS and Windows are both supported.

## Using it

1. Work through `SETUP.md` once — install the server, point your agent at it,
   open the bridge, confirm InDesign answers.
2. Drop this folder into your agent's skills directory, or install it through
   your agent's marketplace.
3. Ask for layout work in InDesign. The agent picks the tools; the skill exists
   so it picks the right ones, in the right order.

The skill is not a wrapper around a script: it carries no executable code of
its own. Everything it does happens in your InDesign, on your machine, over a
local bridge.

## Why it is free

The server is MIT and open source. This companion skill is the same guidance
packaged for agents, and it is free for the same reason the server is.
