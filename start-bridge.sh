#!/usr/bin/env bash
# Starts the InDesign bridge proxy. The MCP server itself is launched by Claude.
# InDesign 2026 must be open. Ctrl+C to stop.
set -euo pipefail
cd "$(dirname "$0")"
if ! pgrep -x "Adobe InDesign 2026" >/dev/null; then
  echo "Launching InDesign 2026..."; open -a "Adobe InDesign 2026"; sleep 20
fi
echo "Bridge proxy -> ws://127.0.0.1:8120 (InDesign 2026)"
exec node bridge-proxy.mjs
