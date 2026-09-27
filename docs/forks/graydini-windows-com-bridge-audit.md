# Audit: `graydini/windows-com-bridge`

Reviewed file by file against `origin/main`. The branch is 10 commits ahead /
1 behind, but most of its value landed in upstream via PR #21 (squash merge of
PR #1). This records what was still unmerged and what happened to it.

## Adopted

| Item | Why |
| --- | --- |
| `.gitignore` | `win-bridge-local/` and `*.local.jsx`, extended here to `/*.jsx` so root-level debug scripts cannot be committed. |
| `indesign-nutria-mcp.json` → `transport: "stdio"` | The manifest forced `websocket`, contradicting both the config default (`stdio`) and the actual runtime. Fixed. |
| `AnchoredObjectHandler` comment | The InDesign 2026 `move()` fix itself is already in main via #21; only the explanation of the workaround was missing. |
| `skills/indesign/indesign-mcp-layout/SKILL.md` | Genuine operational knowledge (COM property limits, `NEVER_INTERACT`, geometry traps). Re-added without the downstream-host instructions. |
| `README.md` hazard notes | The "no cancellation, a hung script wedges the bridge" warning and the COM property limits were valid and are carried into the README and skill. |

## Rejected

| Item | Reason |
| --- | --- |
| `comBridge: { enabled: true }` in the manifest | `IndesignMcpServer` throws on any non-Windows platform when this is on. Shipping it enabled would make the default config fail to start on macOS and Linux. |
| `bridge-proxy-win.mjs`, `bridge-proxy-persistent.mjs` | Superseded. `ComScriptExecutor` now spawns `cscript` in-process with the bundled `assets/windows/run_jsx_persistent.vbs`, so a separate proxy process is a second architecture for the same job. |
| `run_jsx.vbs`, `run_jsx_persistent.vbs` (repo root) | Duplicates of the bundled `assets/windows/run_jsx_persistent.vbs`. |
| `bridge-proxy-win-test.mjs`, `test-com-bridge.mjs` | Ad-hoc scripts, not tests. `ComScriptExecutor` has proper vitest coverage. |
| `check-doc.jsx`, `cleanup.jsx`, `close-all.jsx`, `inspect-spreads.jsx`, `open-and-check.jsx`, `open-test-output.jsx`, `simple-test.jsx` | Developer scratch committed to the repo root. Two of them hardcode a personal path (`C:/Users/skype/...`), which is exactly the leak the branch's own "scrub machine-identifying paths" commit set out to prevent. |
| `README.md` Windows section (bulk) | Documents the superseded singleton-server architecture, repeats downstream host-app instructions ("do not start it yourself", "do not read bridge source code"), and cites a stale tool count. |
| `src/bridge/jsonPolyfill.ts` comment | Comment-only difference; main holds the merged version. |
| `StyleHandler.ts` and its test | main is ahead of the branch (0 added / 11 removed, 1 added / 49 removed). Nothing to adopt. |
| ColorModel / `UserInteractionLevel` enum fixes | Already in main across `ComScriptExecutor`, `extendScriptHelpers`, `ColorHandler`, `ExportHandler`. |

## Notes

- The colour and interaction-level fixes were re-derived upstream rather than
  ported, so the branch versions were not needed.
- The "a hung script permanently wedges the Windows bridge" claim was
  **verified in current code** before being documented: on timeout
  `ComScriptExecutor.execute()` removes the pending entry and rejects, but
  never kills `cscript`, and `ensureProcess()` only respawns a process whose
  `exitCode` is non-null. A hung-but-alive process therefore stays wedged.
  The macOS proxy does not share this flaw, because `execFile`'s `timeout`
  terminates the child.
