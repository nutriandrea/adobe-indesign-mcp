/**
 * Live smoke test for the plugin-free macOS path.
 *
 *   MCP stdio -> BridgeServer (ws) -> bridge-proxy (JXA) -> Adobe InDesign
 *
 * This exists because the unit and integration suite cannot see the seams
 * between those four processes. 965 tests once passed against a build whose
 * bridge never listened on its port, so every tool call failed in the field and
 * nothing went red. Mocks cannot catch that class of bug; a real InDesign can.
 *
 * It is deliberately NOT part of `npm test` — it needs a running desktop app
 * and mutates real documents, so it cannot run on CI. Run it by hand before
 * releasing a change to the bridge, the protocol, the proxy or the driver:
 *
 *   npm run smoke:macos
 *
 * Exits non-zero on the first real failure. It creates one document, writes to
 * it, and closes it without saving.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.SMOKE_PORT || '8131';
const APP = process.env.INDESIGN_APP || 'Adobe InDesign 2026';
const EXPECTED_TOOLS = 194;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isInDesignRunning() {
  try {
    execFileSync('pgrep', ['-x', APP], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!isInDesignRunning()) {
  console.log(`SKIP  ${APP} is not running.`);
  console.log('      Launch it, then re-run: npm run smoke:macos');
  process.exit(0);
}

const server = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: REPO,
  env: { ...process.env, BRIDGE_PORT: PORT, LOG_LEVEL: 'error' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const pending = new Map();
createInterface({ input: server.stdout }).on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout on ${method}`));
    }, 60_000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      resolve(m);
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

function notify(method, params) {
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function bail(detail) {
  check('bridge reachable', false, detail);
  finish();
}

const textOf = (r) => {
  const c = r?.result?.content?.[0];
  return c?.type === 'text' ? c.text : JSON.stringify(r);
};

let proxy = null;
function cleanup() {
  proxy?.kill();
  server.kill();
}
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

function finish() {
  cleanup();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log(`failed: ${failed.map((f) => f.name).join(', ')}`);
  process.exit(failed.length ? 1 : 0);
}

try {
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-macos', version: '1.0.0' },
  });
  notify('notifications/initialized', {});
  const serverName = init?.result?.serverInfo?.name;
  check('initialize', Boolean(serverName), serverName ?? JSON.stringify(init).slice(0, 200));

  const list = await request('tools/list', {});
  const toolCount = list?.result?.tools?.length;
  check('tools/list returns the documented count', toolCount === EXPECTED_TOOLS, `got ${toolCount}`);

  proxy = spawn('node', ['bridge-proxy.mjs'], {
    cwd: REPO,
    env: { ...process.env, INDESIGN_APP: APP, BRIDGE_WS_URL: `ws://127.0.0.1:${PORT}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const proxyLog = [];
  proxy.stdout.on('data', (d) => proxyLog.push(String(d)));
  proxy.stderr.on('data', (d) => proxyLog.push(String(d)));
  let proxyExit = null;
  proxy.on('exit', (code) => {
    proxyExit = code;
  });

  let connected = false;
  for (let i = 0; i < 30 && !connected; i++) {
    await sleep(1000);
    const r = await request('resources/read', { uri: 'mcp://bridge/status' }).catch(() => null);
    const body = r?.result?.contents?.[0]?.text;
    if (body && /"connected"\s*:\s*true/.test(body)) connected = true;
    else if (proxyExit !== null) break;
  }
  if (!connected) {
    bail(
      proxyExit !== null
        ? `proxy exited ${proxyExit}: ${proxyLog.join('').slice(0, 300)}`
        : 'no connected client after 30s — is the bridge listening?',
    );
  } else {
    check('proxy connects to bridge', true);
  }

  if (connected) {
    const doc = await request('tools/call', {
      name: 'document_create',
      arguments: { width: 595.28, height: 841.89, pages: 1 },
    });
    const docText = textOf(doc);
    if (!/"pages"\s*:\s*1/.test(docText) && !/595/.test(docText)) {
      check('document_create', false, docText.slice(0, 200));
      finish();
    } else {
      check('document_create', true, docText.slice(0, 120));
    }

    const added = await request('tools/call', {
      name: 'text_addFrame',
      arguments: {
        pageIndex: 0,
        bounds: { top: 50, left: 50, bottom: 120, right: 300 },
        content: 'SMOKE OK',
      },
    });
    check('text_addFrame', !added?.result?.isError, textOf(added).slice(0, 160));

    const read = await request('tools/call', {
      name: 'text_getTextFrames',
      arguments: { pageIndex: 0 },
    });
    check(
      'text_getTextFrames round-trips content',
      /SMOKE OK/.test(textOf(read)),
      textOf(read).slice(0, 200),
    );

    const info = await request('tools/call', { name: 'document_getInfo', arguments: {} });
    check('document_getInfo', !info?.result?.isError, textOf(info).slice(0, 200));

    // Negative path: a bad reference must come back as a protocol error, not as
    // silence or a hang. A silent success here is how bridge bugs hide.
    const bad = await request('tools/call', {
      name: 'text_getContent',
      arguments: { pageIndex: 0, frameIndex: 999 },
    });
    check(
      'bad reference returns a clean error',
      Boolean(bad?.result?.isError) || /error|not found|invalid/i.test(textOf(bad)),
      textOf(bad).slice(0, 200),
    );

    // saveOptions defaults to 'ask', which raises a modal dialog in InDesign and
    // blocks the script until the bridge times out. Unattended callers must be
    // explicit — this is exactly the trap the check above documents.
    const closed = await request('tools/call', {
      name: 'document_close',
      arguments: { saveOptions: 'no' },
    });
    check('document_close', !closed?.result?.isError, textOf(closed).slice(0, 120));
  }
} catch (err) {
  check('harness', false, String(err));
}

finish();
