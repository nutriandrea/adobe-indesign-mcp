#!/usr/bin/env node
/**
 * Windows COM-bridge proxy for adobe-indesign-mcp.
 *
 * Replaces bridge-proxy.mjs (macOS JXA/osascript). Connects to the MCP
 * server's WebSocket bridge on 127.0.0.1:8120, receives ExtendScript
 * execution requests, runs them inside InDesign via COM automation
 * (cscript + run_jsx.vbs), and returns the results as JSON.
 *
 * Usage:
 *   node bridge-proxy-win.mjs
 *
 * Env overrides:
 *   BRIDGE_WS_URL   ws:// URL for the MCP server bridge (default: ws://127.0.0.1:8120)
 *   BRIDGE_VBS_PATH path to run_jsx.vbs (default: ./run_jsx.vbs in cwd)
 */
import WebSocket from 'ws';
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

const WS_URL = process.env.BRIDGE_WS_URL || 'ws://127.0.0.1:8120';
const BRIDGE_VBS = resolve(process.env.BRIDGE_VBS_PATH || './run_jsx.vbs');
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 20;

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;

/**
 * Inject NEVER_INTERACT so export dialogs never pop and hang the COM call.
 * The macOS JXA bridge didn't need this — Windows COM absolutely does.
 */
function wrapWithNeverInteract(code) {
  return `
app.scriptPreferences.userInteractionLevel = UserInteractionLevel.NEVER_INTERACT;
${code}
`;
}

function connect() {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('✅ Bridge proxy (Windows COM) connected to MCP server at ' + WS_URL);
    reconnectAttempts = 0;
  });

  ws.on('message', (raw) => {
    let request;
    try {
      request = JSON.parse(raw.toString());
    } catch {
      return; // not JSON — ignore (heartbeats, server acks, etc.)
    }

    // Ignore non-execution messages (server greets with {type:'connected'})
    if (!request.id || !request.code) {
      return;
    }

    const reqId = request.id;
    const code = request.code;
    const timeout = request.timeout || 30000;

    console.log(`📜 Executing [${reqId.slice(0, 8)}…] (${code.length} chars)`);

    // Write ExtendScript to a temp file — never inline-extendscript through shell
    const tmpFile = join(
      tmpdir(),
      `indesign-win-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}.jsx`
    );
    try {
      writeFileSync(tmpFile, wrapWithNeverInteract(code), 'utf8');
    } catch (e) {
      ws.send(JSON.stringify({
        id: reqId,
        type: 'error',
        error: `Failed to write temp file: ${e.message}`,
      }));
      return;
    }

    // Run via COM bridge (cscript //nologo → stdout = last expression)
    execFile('cscript', ['//nologo', BRIDGE_VBS, tmpFile], { timeout }, (err, stdout, stderr) => {
      // Clean up temp file
      try { unlinkSync(tmpFile); } catch {}

      if (err) {
        // cscript exited with error or timed out — report to server
        const errMsg = (stderr || err.message || 'Script execution failed').slice(0, 2000);
        console.error(`❌ [${reqId.slice(0, 8)}…] ${errMsg}`);
        ws.send(JSON.stringify({ id: reqId, type: 'error', error: errMsg }));
        return;
      }

      const result = (stdout || '').trim();
      console.log(`✅ [${reqId.slice(0, 8)}…] result: ${(result || '').slice(0, 200)}`);
      ws.send(JSON.stringify({ id: reqId, type: 'result', result: result || 'null' }));
    });
  });

  ws.on('close', () => {
    console.log('⚠️ Bridge disconnected. Reconnecting...');
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    } else {
      console.error('Max reconnect attempts reached. Restart the bridge to retry.');
    }
  });

  ws.on('error', (err) => {
    console.error(`⚠️ Bridge WebSocket error: ${err.message}. Reconnecting...`);
    if (ws) { ws.close(); ws = null; }
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    }
  });
}

connect();

console.log('🔄 Windows COM bridge proxy starting…');
console.log(`   Bridge VBS: ${BRIDGE_VBS}`);
console.log('   Press Ctrl+C to stop.');
