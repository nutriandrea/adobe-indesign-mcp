# Client configs

Copy-paste configs for the MCP hosts people actually wire this server into.
Each one starts the server over stdio; the server then listens for the InDesign
bridge on `127.0.0.1:8120`.

| Client | File | Goes to |
|---|---|---|
| Claude Desktop (macOS) | [`claude-desktop.json`](claude-desktop.json) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | [`claude-desktop.windows.json`](claude-desktop.windows.json) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | [`cursor.json`](cursor.json) | `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project) |
| Claude Code | [`claude-code.md`](claude-code.md) | one `claude mcp add` command, or a project `.mcp.json` |

## The install

`indesign-nutria-mcp` is published to npm, so every file above is the same two
tokens — no path to fill in, no build:

```json
{
  "mcpServers": {
    "indesign": {
      "command": "npx",
      "args": ["-y", "indesign-nutria-mcp"]
    }
  }
}
```

The first launch downloads the package; later launches use the npm cache. The
name in `args` is the published package name, and
`tests/unit/distributionManifests.test.ts` asserts it matches `package.json`,
so a rename cannot leave these files pointing at a package that does not exist.

### Running from a clone instead

For development — or if you would rather not have `npx` fetch anything — build
once and point the config at the result:

```bash
git clone https://github.com/nutriandrea/adobe-indesign-mcp
cd adobe-indesign-mcp
npm install && npm run build
pwd   # <- the path to put in the config: "command": "node", "args": ["<path>/dist/index.js"]
```

The path must be absolute, and `dist/index.js` must exist — that is what
`npm run build` produces.

## Connect InDesign

A config alone gets you a server that starts and answers `tools/list`. To make
InDesign answer, one bridge has to be running:

- **macOS, no panel:** `./start-bridge.sh` from a
  [clone of the repository](https://github.com/nutriandrea/adobe-indesign-mcp) —
  `npm install` first (the proxy needs the `ws` package), no build step needed.
- **macOS, UXP panel:** load the `plugin/` directory from that clone in the UXP
  Developer Tool and open the **MCP Bridge** panel.
- **Windows:** the `COM_BRIDGE_ENABLED=true` env var in the config above; the
  COM bridge drives InDesign in-process and needs no repository files at all.

`document_listOpen` is the cheap way to confirm the bridge is live: if it
returns a document list, the whole path works.

## Validating a config

`tests/unit/distributionManifests.test.ts` parses every `.json` in this
directory and asserts each declares a single `indesign` server launched with
`npx -y <package name>`, so a broken example fails `npm test` rather than a
user's first run.
