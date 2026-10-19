# Setup

Everything here is done once, on the machine that runs InDesign. It is the same
install the project documents in its own README; this file exists so the skill
is self-contained.

**You need:** Adobe InDesign installed (and licensed), and Node.js 18 or newer.
macOS and Windows are both supported.

## 1. Install the MCP server

**The package is not on npm yet.** Install it from the repository — the same
path the project's Quick Start uses:

```bash
git clone https://github.com/nutriandrea/adobe-indesign-mcp
cd adobe-indesign-mcp
npm install && npm run build
pwd    # note this path: it goes in the config below
```

`npm run build` produces `dist/index.js`, which is the entry point. The path
must be absolute.

### Once the package is published

When `indesign-nutria-mcp` is on npm the clone and the build both disappear:

```json
{
  "mcpServers": {
    "indesign": { "command": "npx", "args": ["-y", "indesign-nutria-mcp"] }
  }
}
```

Until then that command fails — which is why the configs shipped alongside this
file point at a local build.

## 2. Point your agent at it

Ready-made files are in [`config/`](config/). Copy the one for your client and
replace `/ABSOLUTE/PATH/TO/adobe-indesign-mcp` with the path from step 1.

| Client | File | Goes to |
| --- | --- | --- |
| Claude Desktop (macOS) | `config/claude-desktop.json` | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `config/claude-desktop.windows.json` | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `config/cursor.json` | `~/.cursor/mcp.json` or a project `.cursor/mcp.json` |
| Claude Code | `config/claude-code.md` | one `claude mcp add` command |

Restart the client after editing its config.

## 3. Open the bridge

A config alone gets you a server that starts and answers `tools/list`. To make
**InDesign** answer, one bridge has to be running:

- **macOS, no panel:** `./start-bridge.sh` from the clone.
- **macOS, UXP panel:** load `plugin/` in the UXP Developer Tool and open the
  **MCP Bridge** panel.
- **Windows:** set `COM_BRIDGE_ENABLED=true` in the server config (see the
  Windows file in `config/`). The COM bridge drives InDesign in-process and
  needs no separate listener.

Leave InDesign open and visible. Most tools act on an open document, and with
none open they fail.

## 4. Verify

Ask the agent to list the open InDesign documents. Behind the scenes that is
`document_listOpen`: if it returns a document list, the server, the bridge and
InDesign are all talking. If it fails with `bridge_not_connected`, InDesign or
the bridge is not up — start it, then retry once.

## If something is wrong

- **Server starts, no documents come back** — the bridge is not running, or a
  second copy of InDesign is on a different port.
- **Port 8120 already in use** — an older bridge is still alive; quit it.
- **A save dialog hangs everything** — a call passed `saveOptions: "ask"`.
  `document_close` defaults to `"no"` for exactly this reason.
- Longer list: [docs/troubleshooting.md](https://github.com/nutriandrea/adobe-indesign-mcp/blob/main/docs/troubleshooting.md).
