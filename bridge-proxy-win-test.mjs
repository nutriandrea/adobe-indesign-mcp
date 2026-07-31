#!/usr/bin/env node
/**
 * Windows COM-bridge proxy (test config, port 9999).
 */
import WebSocket from 'ws';
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

const WS_URL = process.env.BRIDGE_WS_URL || 'ws://127.0.0.1:9999';
const BRIDGE_VBS = resolve(process.env.BRIDGE_VBS_PATH || './run_jsx.vbs');
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 20;

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;

function wrapWithNeverInteract(code) {
  return `
app.scriptPreferences.userInteractionLevel = 1699311169;
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
      return;
    }

    if (!request.id || !request.code) {
      return;
    }

    const reqId = request.id;
    const code = request.code;
    const timeout = request.timeout || 30000;

    console.log(`📜 Executing [${reqId.slice(0, 8)}…] (${code.length} chars)`);

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

    execFile('cscript', ['//nologo', BRIDGE_VBS, tmpFile], { timeout }, (err, stdout, stderr) => {
      try { unlinkSync(tmpFile); } catch {}

      if (err) {
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
      console.error('Max reconnect attempts reached.');
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

console.log('🔄 Windows COM bridge proxy starting...');
console.log(`   Bridge VBS: ${BRIDGE_VBS}`);
console.log('   Press Ctrl+C to stop.');
