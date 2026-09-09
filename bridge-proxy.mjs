#!/usr/bin/env node
/**
 * Bridge Proxy: connects to the MCP server's WebSocket bridge, receives
 * ExtendScript requests, executes them in InDesign via JXA/osascript, and
 * returns structured results.
 *
 * Scripts are written to a temp file and read by jxa-driver.js, so no script
 * content ever passes through shell quoting.
 */
import WebSocket from 'ws';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WS_URL = process.env.BRIDGE_WS_URL || 'ws://127.0.0.1:8120';
const APP_NAME = process.env.INDESIGN_APP || 'Adobe InDesign 2026';
const DRIVER = join(__dirname, 'jxa-driver.js');
const TIMEOUT_MS = Number(process.env.BRIDGE_TIMEOUT_MS || 120000);

const tmp = mkdtempSync(join(tmpdir(), 'id-bridge-'));
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

let ws;
let reconnectTimer;

function runScript(code) {
  const file = join(tmp, `s-${Date.now()}-${Math.random().toString(36).slice(2)}.jsx`);
  writeFileSync(file, code, 'utf-8');
  try {
    return execFileSync('osascript', ['-l', 'JavaScript', DRIVER, file, APP_NAME], {
      timeout: TIMEOUT_MS,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    }).replace(/\n$/, '');
  } finally {
    try { rmSync(file, { force: true }); } catch {}
  }
}

function connect() {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => console.log(`✅ Bridge proxy connected — driving ${APP_NAME}`));

  ws.on('message', (raw) => {
    let request;
    try { request = JSON.parse(raw.toString()); } catch { return; }

    // Server greeting / events are not scripts.
    if (!request || request.type === 'connected' || request.type === 'event') return;

    const code = request.code || request.script;
    const reqId = request.id ?? null;
    if (!code) return;

    console.log(`📜 exec ${reqId} (${code.length} bytes)`);
    try {
      const out = runScript(code);

      // The driver reports InDesign-side failures as __bridge_error.
      let parsed = null;
      try { parsed = JSON.parse(out); } catch {}
      if (parsed && parsed.__bridge_error) {
        ws.send(JSON.stringify({ type: 'error', id: reqId, error: parsed.__bridge_error }));
        console.error(`❌ ${reqId}: ${parsed.__bridge_error}`);
        return;
      }

      ws.send(JSON.stringify({ type: 'result', id: reqId, result: out }));
      console.log(`✅ ${reqId} -> ${out.length} bytes`);
    } catch (e) {
      const msg = e.stderr ? String(e.stderr).trim() : e.message;
      ws.send(JSON.stringify({ type: 'error', id: reqId, error: msg }));
      console.error(`❌ ${reqId}: ${msg}`);
    }
  });

  ws.on('close', () => {
    console.log('⚠️ Disconnected. Reconnecting in 3s...');
    reconnectTimer = setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error(`⚠️ WebSocket error: ${err.message}`);
    ws.close();
  });
}

console.log(`🔄 Bridge proxy starting -> ${WS_URL}`);
connect();
process.on('SIGINT', () => { clearTimeout(reconnectTimer); try { ws.close(); } catch {} process.exit(0); });
