# Claude Code

Claude Code reads MCP servers from a project-scoped `.mcp.json` or from
`claude mcp add`. Both take the same command the other clients use.

## Option A — one command

```bash
claude mcp add indesign -- npx -y indesign-nutria-mcp
```

## Option B — project `.mcp.json`

Drop this in the project you run Claude Code from (it is `examples/claude-desktop.json`
with the same `mcpServers` shape):

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

On Windows, pass the COM bridge flag too:

```json
{
  "mcpServers": {
    "indesign": {
      "command": "npx",
      "args": ["-y", "indesign-nutria-mcp"],
      "env": { "COM_BRIDGE_ENABLED": "true" }
    }
  }
}
```

The package comes from npm, so there is no path to fill in. See
[`README.md`](README.md) in this directory for the bridge step, which is what
actually gets InDesign answering.
