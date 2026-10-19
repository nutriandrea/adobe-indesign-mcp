# Setup

Everything here is done once, on the machine that runs InDesign.

**You need:** Adobe InDesign installed (and licensed), and Node.js 18 or newer.
macOS and Windows are both supported.

## 1. Install the MCP server

`indesign-nutria-mcp` is published to npm, so the whole config is two tokens —
no path to fill in, nothing to clone, nothing to build:

```json
{
  "mcpServers": {
    "indesign": { "command": "npx", "args": ["-y", "indesign-nutria-mcp"] }
  }
}
```

The first launch downloads the package; later launches reuse the npm cache.

## 2. Point your agent at it

Ready-made files are in [`config/`](config/). Copy the one for your client —
the command above is already in each of them. On Windows, use
`config/claude-desktop.windows.json`: it adds
`"env": { "COM_BRIDGE_ENABLED": "true" }`, which the COM bridge needs.

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

- **Windows:** nothing to do beyond the env var from step 2. The COM bridge
  drives InDesign in-process and needs no separate listener and no repository
  files.
- **macOS, UXP panel:** load `plugin/` in the UXP Developer Tool and open the
  **MCP Bridge** panel. `plugin/` ships in the
  [`indesign-nutria-mcp` repository](https://github.com/nutriandrea/adobe-indesign-mcp) —
  clone it once for this; there is no build step.
- **macOS, no panel:** `./start-bridge.sh` from that same clone. Run
  `npm install` first (the proxy needs the `ws` package); still no build step.

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
