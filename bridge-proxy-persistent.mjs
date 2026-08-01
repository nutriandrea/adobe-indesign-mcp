#!/usr/bin/env node
/**
 * Windows COM-bridge proxy for adobe-indesign-mcp (singleton WebSocket SERVER).
 *
 * ARCHITECTURE (fixed 2026-08-01):
 * The bridge LISTENS on 8120 and owns ONE persistent cscript process with ONE
 * InDesign COM instance. MCP server instances CONNECT to it as clients.
 * Requests carry a UUID; responses route by ID, so ANY number of MCP server
 * instances (desktop app, CLI tests, etc.) can share this single bridge and
 * therefore the SAME InDesign instance and the SAME documents.
 * No port binding by the servers -> no EADDRINUSE collisions, ever.
 */
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '8120', 10);
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const BRIDGE_VBS = resolve(process.env.BRIDGE_VBS_PATH || './run_jsx_persistent.vbs');

let cscript = null;
let pendingRequests = new Map(); // id -> { timer, tmpFile, socket }

function wrapWithNeverInteract(code) {
  return `\napp.scriptPreferences.userInteractionLevel = 1699311169;\n${code}\n`;
}

function startCscript() {
  return new Promise((resolve, reject) => {
    cscript = spawn('cscript', ['//nologo', BRIDGE_VBS], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    cscript.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // One result per request — match the FIRST pending request.
        for (const [id, req] of pendingRequests) {
          pendingRequests.delete(id);
          clearTimeout(req.timer);
          try { unlinkSync(req.tmpFile); } catch {}
          const msg = trimmed.startsWith('ERROR: ')
            ? { id, type: 'error', error: trimmed.slice(7) }
            : { id, type: 'result', result: trimmed };
          if (req.socket && req.socket.readyState === 1) {
            req.socket.send(JSON.stringify(msg));
          }
          break;
        }
      }
    });

    cscript.stderr.on('data', (chunk) => {
      console.error('cscript stderr:', chunk.toString().slice(0, 300));
    });

    cscript.on('spawn', () => {
      console.log('✅ cscript persistent process started');
      resolve();
    });

    cscript.on('error', (err) => {
      console.error('❌ cscript failed:', err.message);
      reject(err);
    });

    cscript.on('close', (code) => {
      console.log(`⚠️ cscript exited with code ${code}`);
      cscript = null;
      for (const [id, req] of pendingRequests) {
        clearTimeout(req.timer);
        try { unlinkSync(req.tmpFile); } catch {}
        if (req.socket && req.socket.readyState === 1) {
          req.socket.send(JSON.stringify({ id, type: 'error', error: 'cscript process exited' }));
        }
      }
      pendingRequests.clear();
    });
  });
}

function executeRequest(socket, request) {
  if (!request.id || !request.code) return;

  const reqId = request.id;
  const code = wrapWithNeverInteract(request.code);
  const timeout = request.timeout || 30000;

  console.log(`📜 Executing [${reqId.slice(0, 8)}…] (${code.length} chars)`);

  const tmpFile = join(tmpdir(), `indesign-win-${Date.now()}-${Math.random().toString(36).slice(2)}.jsx`);
  try {
    writeFileSync(tmpFile, code, 'utf8');
  } catch (e) {
    socket.send(JSON.stringify({ id: reqId, type: 'error', error: `Write failed: ${e.message}` }));
    return;
  }

  const run = () => {
    const timer = setTimeout(() => {
      if (pendingRequests.has(reqId)) {
        const req = pendingRequests.get(reqId);
        pendingRequests.delete(reqId);
        try { unlinkSync(req.tmpFile); } catch {}
        if (req.socket && req.socket.readyState === 1) {
          req.socket.send(JSON.stringify({ id: reqId, type: 'error', error: 'Timeout' }));
        }
      }
    }, timeout);

    pendingRequests.set(reqId, { timer, tmpFile, socket });
    cscript.stdin.write(tmpFile + '\n');
  };

  if (!cscript || !cscript.stdin.writable) {
    startCscript()
      .then(run)
      .catch((err) => {
        socket.send(JSON.stringify({ id: reqId, type: 'error', error: `Start failed: ${err.message}` }));
        try { unlinkSync(tmpFile); } catch {}
      });
  } else {
    run();
  }
}

const wss = new WebSocketServer({ port: BRIDGE_PORT, host: BRIDGE_HOST });

wss.on('connection', (socket) => {
  console.log('🔌 MCP server connected');
  socket.send(JSON.stringify({ type: 'connected', version: '1.0.0', role: 'bridge' }));

  socket.on('message', (raw) => {
    let request;
    try {
      request = JSON.parse(raw.toString());
    } catch { return; }
    executeRequest(socket, request);
  });

  socket.on('close', () => {
    console.log('🔌 MCP server disconnected');
  });

  socket.on('error', (err) => {
    console.error('⚠️ socket error:', err.message);
  });
});

wss.on('listening', () => {
  console.log('🔄 Windows COM bridge (singleton server) listening on ' + BRIDGE_HOST + ':' + BRIDGE_PORT);
  console.log(`   VBS: ${BRIDGE_VBS}`);
  console.log('   MCP server instances connect to ws://' + BRIDGE_HOST + ':' + BRIDGE_PORT + ' — one InDesign instance, one document set.');
});

wss.on('error', (err) => {
  console.error('❌ Bridge server error:', err.message);
  process.exit(1);
});
