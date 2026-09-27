#!/usr/bin/env bash
# Starts the macOS JXA bridge proxy (no UXP plugin needed).
# The MCP server itself is launched by your MCP client (Claude/OpenCode/…).
# InDesign must be open. Ctrl+C to stop.
#
# Env: INDESIGN_APP (default "Adobe InDesign 2026"), BRIDGE_WS_URL,
#      BRIDGE_TIMEOUT_MS.
set -euo pipefail
cd "$(dirname "$0")"

INDESIGN_APP="${INDESIGN_APP:-Adobe InDesign 2026}"

if ! pgrep -x "$INDESIGN_APP" >/dev/null 2>&1; then
  echo "Launching $INDESIGN_APP..."
  open -a "$INDESIGN_APP"
  sleep 20
fi

echo "Bridge proxy -> ${BRIDGE_WS_URL:-ws://127.0.0.1:8120} ($INDESIGN_APP)"
exec node bridge-proxy.mjs
