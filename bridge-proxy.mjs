#!/usr/bin/env node
/**
 * macOS JXA Bridge Proxy — connects to the MCP server's WebSocket bridge,
 * receives ExtendScript requests, executes them in InDesign via JavaScript
 * for Automation (osascript), and returns structured results.
 *
 * Transport: scripts are written to a temp file and read by jxa-driver.js,
 * so no script content ever passes through shell quoting (execFile spawns
 * directly, no shell). Executions run through a FIFO queue — InDesign is
 * single-threaded, so scripts serialize, but the Node event loop stays free
 * for WebSocket traffic, pings and signals.
 *
 * Protocol: canonical { type: 'result' | 'error', id, result? | error? }.
 *
 * Config (env): INDESIGN_APP, BRIDGE_WS_URL, BRIDGE_TIMEOUT_MS.
 */
import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  appName: 'Adobe InDesign 2026',
  wsUrl: 'ws://127.0.0.1:8120',
  timeoutMs: 120_000,
  reconnectDelayMs: 3_000,
};

/** Resolve proxy configuration from the environment. */
export function loadConfig(env = process.env) {
  return {
    appName: env.INDESIGN_APP || DEFAULTS.appName,
    wsUrl: env.BRIDGE_WS_URL || DEFAULTS.wsUrl,
    timeoutMs: Number(env.BRIDGE_TIMEOUT_MS) || DEFAULTS.timeoutMs,
    reconnectDelayMs: Number(env.BRIDGE_RECONNECT_DELAY_MS) || DEFAULTS.reconnectDelayMs,
  };
}

/**
 * Execute one ExtendScript via the jxa-driver. The script is written to a
 * temp file — the only channel to osascript that carries no quoting risk.
 */
export function createJxaRunner({
  driverPath = join(__dirname, 'jxa-driver.js'),
  appName = DEFAULTS.appName,
  timeoutMs = DEFAULTS.timeoutMs,
  execFileFn = execFile,
  tmpRoot,
} = {}) {
  const root = tmpRoot ?? mkdtempSync(join(tmpdir(), 'id-bridge-'));
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };

  const run = (code) =>
    new Promise((resolve, reject) => {
      if (typeof code !== 'string' || code.length === 0) {
        reject(new Error('empty script'));
        return;
      }
      const file = join(root, `s-${Date.now()}-${Math.random().toString(36).slice(2)}.jsx`);
      let written = true;
      try {
        writeFileSync(file, code, 'utf-8');
      } catch (err) {
        written = false;
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      execFileFn(
        'osascript',
        ['-l', 'JavaScript', driverPath, file, appName],
        { timeout: timeoutMs, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
        (err, stdout) => {
          try {
            if (written) rmSync(file, { force: true });
          } catch {
            /* best effort */
          }
          if (err) {
            const message = err.stderr ? String(err.stderr).trim() : err.message;
            reject(new Error(message));
            return;
          }
          resolve(String(stdout ?? '').replace(/\n$/, ''));
        },
      );
    });

  return { run, cleanup, tmpRoot: root };
}

/**
 * FIFO queue with concurrency 1 by default: InDesign executes one script at
 * a time, so requests serialize in arrival order without blocking the loop.
 */
export function createFifoQueue({ concurrency = 1 } = {}) {
  const pending = [];
  let active = 0;

  const pump = () => {
    while (active < concurrency && pending.length > 0) {
      const { fn, resolve, reject } = pending.shift();
      active += 1;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };

  return {
    /** @returns {Promise<unknown>} resolves with the task's outcome */
    enqueue(fn) {
      return new Promise((resolve, reject) => {
        pending.push({ fn, resolve, reject });
        pump();
      });
    },
    get size() {
      return pending.length + active;
    },
    /** Reject queued (not running) tasks — they would otherwise hang forever. */
    clear() {
      const dropped = pending.splice(0, pending.length);
      for (const { reject } of dropped) {
        reject(new Error('bridge queue cleared before task started'));
      }
    },
  };
}

/**
 * The proxy itself. Emits 'sent' / 'failed' events for observability.
 */
export function createBridgeProxy({
  wsUrl = DEFAULTS.wsUrl,
  runner,
  WebSocketCtor = WebSocket,
  queue = createFifoQueue(),
  reconnectDelayMs = DEFAULTS.reconnectDelayMs,
} = {}) {
  const events = new EventEmitter();
  let ws = null;
  let reconnectTimer = null;
  let stopped = false;

  const send = (payload) => {
    if (ws && ws.readyState === WebSocketCtor.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const handleRequest = async (request) => {
    const { id, code } = request;
    if (typeof code !== 'string' || code.length === 0) {
      send({ type: 'error', id, error: 'request has no script code' });
      return;
    }
    try {
      const out = await queue.enqueue(() => runner.run(code));
      // The driver reports InDesign-side failures as __bridge_error JSON.
      let parsed = null;
      try {
        parsed = JSON.parse(out);
      } catch {
        /* plain string result */
      }
      if (parsed && typeof parsed === 'object' && parsed.__bridge_error) {
        send({ type: 'error', id, error: String(parsed.__bridge_error) });
        events.emit('failed', { id, error: String(parsed.__bridge_error) });
        return;
      }
      send({ type: 'result', id, result: out });
      events.emit('sent', { id, bytes: out.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send({ type: 'error', id, error: message });
      events.emit('failed', { id, error: message });
    }
  };

  const handleMessage = (raw) => {
    let request = null;
    try {
      request = JSON.parse(raw.toString());
    } catch {
      return;
    }
    // Server greeting and push events are not execution requests.
    if (!request || typeof request !== 'object') return;
    if (request.type === 'connected' || request.type === 'event') return;
    if (typeof request.id !== 'string') return;
    // Requests are { id, code, timeout? } — anything else is not ours to run.
    if (!('code' in request)) return;

    console.log(`📜 exec ${request.id} (${request.code.length} bytes)`);
    void handleRequest(request);
  };

  const connect = () => {
    if (stopped) return;
    ws = new WebSocketCtor(wsUrl);

    ws.on('open', () => {
      console.log(`✅ Bridge proxy connected — driving InDesign via ${wsUrl}`);
    });

    ws.on('message', handleMessage);

    ws.on('close', () => {
      if (stopped) return;
      console.log(`⚠️ Disconnected. Reconnecting in ${reconnectDelayMs / 1000}s...`);
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
    });

    ws.on('error', (err) => {
      console.error(`⚠️ WebSocket error: ${err.message}`);
      ws?.close();
    });
  };

  return {
    events,
    connect,
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      queue.clear();
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    },
    /** @visibleForTesting */
    handleMessage,
  };
}

/** Wire everything together and run as a CLI process. */
export function main(env = process.env) {
  const config = loadConfig(env);
  const runner = createJxaRunner({ appName: config.appName, timeoutMs: config.timeoutMs });
  const proxy = createBridgeProxy({
    wsUrl: config.wsUrl,
    runner,
    reconnectDelayMs: config.reconnectDelayMs,
  });

  proxy.events.on('sent', ({ id, bytes }) => console.log(`✅ ${id} -> ${bytes} bytes`));
  proxy.events.on('failed', ({ id, error }) => console.error(`❌ ${id}: ${error}`));

  process.on('SIGINT', () => {
    console.log('👋 Bridge proxy stopping...');
    proxy.stop();
    runner.cleanup();
    process.exit(0);
  });
  process.on('exit', runner.cleanup);

  console.log(`🔄 Bridge proxy starting -> ${config.wsUrl} (${config.appName})`);
  proxy.connect();
  return proxy;
}

// Run as CLI only when executed directly (tests import the pieces instead).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
