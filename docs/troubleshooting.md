# Troubleshooting

Most failures come back as a typed error envelope, so the first thing to read is
`code` (and, when present, `suggested_next_tool`):

```json
{ "ok": false, "code": "bridge_not_connected", "message": "…" }
```

| Symptom | Likely `code` | Jump to |
|---------|---------------|---------|
| A call hangs, then times out | `execution_timeout` | [Modal dialogs](#modal-dialogs-a-call-that-hangs-then-times-out) |
| Every call fails immediately | `bridge_not_connected` | [Bridge not connected](#bridge-is-not-connected) |
| Server exits on startup | — | [Port 8120 in use](#port-8120-already-in-use) |
| Proxy connects but nothing works | `bridge_error` / `unknown` | [Wrong app name](#the-proxy-connects-but-indesign-never-runs-anything) |
| Text renders in the wrong font | `missing_font` | [Missing fonts](#missing-fonts) |
| A script is refused outright | `script_blocked_by_policy` | [Blocked constructs](#script_blocked_by_policy) |
| A big preview never returns | `output_too_large` | [Large responses](#output_too_large-and-split-stdout-chunks) |

Set `LOG_LEVEL=debug` to see the server's own diagnostics; they go to **stderr**
so they never corrupt the stdio JSON-RPC stream.

---

## Modal dialogs: a call that hangs, then times out

`code: execution_timeout`. InDesign is single-threaded: a modal dialog raised
inside `app.doScript` blocks the script, the bridge, and every later call behind
it until the bridge times out. Three tools can raise one.

### `document_close`

The safe default is `saveOptions: "no"` — closing without saving never prompts.
If you (or an older client) pass `saveOptions: "ask"`, InDesign raises a modal
save dialog. **`"yes"` is no better**: on a document that has never been saved,
`SaveOptions.yes` raises a **Save As** dialog, which blocks exactly the same way.

```jsonc
// unattended-safe
{ "saveOptions": "no" }        // default; discard and close
```

If you want the work kept, call `document_save` **first**, then
`document_close { "saveOptions": "no" }`.

### `document_save`

`document_save` defaults `saveOptions` to `"yes"` and, with **no `filePath`**,
calls `app.activeDocument.save()`. On a **never-saved** document that is a Save
As dialog — a modal, and a hang. Always pass a `filePath` when the document has
no existing file:

```jsonc
{ "filePath": "/Users/me/out.indd" }
```

With an explicit `filePath` the handler uses `save(File(path))`, which never
prompts.

### Any tool, on Windows COM

The COM executor prepends
`app.scriptPreferences.userInteractionLevel = NEVER_INTERACT`, so dialogs are
suppressed automatically. This class of hang is macOS/UXP only.

---

## "Bridge is not connected"

`code: bridge_not_connected`. No WebSocket client is attached to the bridge, so
the server **fails fast** instead of waiting for the timeout. Nothing you call
will work until a client connects. Fix one of:

- **UXP panel:** load `plugin/` in the UXP Developer Tool and open the **MCP
  Bridge** panel. It auto-connects on open. Confirm it shows *Connected*.
- **Plugin-free macOS:** run `./start-bridge.sh` (or `node bridge-proxy.mjs`).
  It prints `[OK] Bridge proxy connected` when it attaches.
- **Windows COM:** start the server with `COM_BRIDGE_ENABLED=true`; there is no
  listener to connect to.

Check the live state at any time:

```bash
# via your MCP host, read the resource:
#   mcp://bridge/status   ->  { "connected": true|false, "queueDepth": n }
```

---

## Port 8120 already in use

The server listens on `127.0.0.1:8120` by default. If something else holds the
port (a second copy of the server, another tool), listen fails at startup.

Find the holder:

```bash
lsof -nP -iTCP:8120 -sTCP:LISTEN
```

Then either stop it, or move this instance. **You must change both ends of the
WebSocket** — the server's listener and the proxy's target:

```bash
BRIDGE_PORT=8131 node dist/index.js
BRIDGE_WS_URL=ws://127.0.0.1:8131 node bridge-proxy.mjs
```

The UXP panel takes the port from its URL field instead. The live smoke test
already uses a non-default port (`SMOKE_PORT`, default `8131`) so it never fights
a running bridge.

---

## The proxy connects but InDesign never runs anything

`INDESIGN_APP` must match the **exact** application name as macOS knows it. The
default is `Adobe InDesign 2026`. A typo (`Adobe Indesign 2026`, a version you
do not have installed) means `pgrep` in `start-bridge.sh` and
`Application(name)` in the driver both miss.

```bash
# what is actually installed/running?
ls /Applications | grep -i indesign
pgrep -x "Adobe InDesign 2026"
```

`start-bridge.sh` only launches InDesign when `pgrep -x "$INDESIGN_APP"`
finds nothing, so a wrong name launches nothing and the proxy waits forever.
Set the correct name in **both** places it matters:

```bash
INDESIGN_APP="Adobe InDesign 2025" ./start-bridge.sh
# and for the server-side launcher that reads the same variable:
export INDESIGN_APP="Adobe InDesign 2025"
```

The driver also reports an unreachable app as
`{"__bridge_error":"Application can't be found."}`, which surfaces as
`code: bridge_error`.

---

## Missing fonts

`code: missing_font`, with `suggested_next_tool: font_missing_check`. A placed
document or a `text_applyFont` call referenced a family that is not installed;
InDesign substitutes a fallback. List the gaps, then fix or substitute:

```
font_missing_check  ->  which fonts the document expects but cannot find
font_list           ->  what is actually available
font_change         ->  retarget the text to an installed family
```

This is the most common failure when moving a document between machines.

---

## `script_blocked_by_policy`

The refusal is deliberate, not a malfunction, so the envelope carries **no**
recovery tool — you have to change what you sent. `sanitizeCode()` rewrites
these constructs to `__blocked(name, …)` before the script leaves the server,
and `__blocked` throws:

```
Blocked by the InDesign MCP security policy: <name> is not available in ExtendScript.
```

| Blocked | Why |
|---------|-----|
| `require(` | ExtendScript has no module system |
| `eval(` , `Function(` | arbitrary code generation |
| `exec(` , `spawn(` , `fork(` | process execution |
| `process.exit`, `process.kill` | there is no Node `process` in InDesign |

Rewrite the script without them. If a call is blocked but you did not write it,
you are probably running a snippet meant for Node rather than ExtendScript.

---

## `output_too_large` and split stdout chunks

`preview_document` renders a page to PNG. At high `resolutionPpi` the base64
payload can exceed the bridge cap, and it comes back as
`code: output_too_large` with `suggested_args: { "resolutionPpi": 96 }`. Retry at
the suggested resolution.

Separately, **large responses arrive split across multiple stdout chunks** on the
MCP side. A client that does `JSON.parse(chunk)` on each `data` event silently
drops the pieces and the call looks like it hangs forever. Buffer to complete
newline-delimited lines before parsing:

```js
buf += chunk;
let i;
while ((i = buf.indexOf('\n')) >= 0) {
  handle(JSON.parse(buf.slice(0, i)));
  buf = buf.slice(i + 1);
}
```

Image tools return `{ type: 'image', mimeType, data }` content, not `text` —
read `content[0].data`, not `content[0].text`.

---

## A `script_run` hung the bridge

`script_run` and `export_executeScript` run arbitrary ExtendScript and have **no
cancellation**. An infinite loop or a long run inside them keeps the single
InDesign thread busy and every later call queues behind it. There is no way to
unstick it from the client side — restart InDesign (and the proxy).

Prefer the typed tools: they validate arguments and enforce a timeout. If you
must run a loop, bound it. See
[skills/indesign/indesign-mcp-layout](../skills/indesign/indesign-mcp-layout/SKILL.md).

---

## Long exports time out

A large PDF/EPUB export can legitimately take longer than the default timeout.
The bridge timeout is `bridge.timeout` (default 30 s), overridable with
`BRIDGE_TIMEOUT`; the macOS proxy has its own `BRIDGE_TIMEOUT_MS` (default
120 s). `code: execution_timeout` with `suggested_next_tool: document_listOpen`
means the call was cut off — the work may still be happening in InDesign. Confirm
with `document_getState`, and raise the timeout for the export rather than
retrying blindly.

---

## Still stuck?

- `LOG_LEVEL=debug` and read stderr.
- Read `mcp://bridge/status` (connection + queue depth) and
  `mcp://document/active` (what the session thinks is open).
- Run `npm run smoke:macos` — it isolates whether the four-process chain works
  at all, independently of your host. See [development.md](development.md).
- File an issue with the envelope (`code`, `message`) and the debug log.
