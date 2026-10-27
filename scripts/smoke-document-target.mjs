/**
 * Live smoke test for per-call document targeting (`document_id`).
 *
 *   MCP stdio -> BridgeServer (ws) -> bridge-proxy (JXA) -> Adobe InDesign
 *
 * The unit suite proves the wiring: `registerTool` adds `document_id` to the
 * schema, `wrapExtendScript` injects it as a string literal, and the resolver
 * throws when the target is not open. What no mocked test can prove is the
 * thing the feature is *for* — that with two real documents open, a call that
 * names the non-front document edits that document and leaves the front one
 * alone. That is the whole point of the change, so it is checked here, against
 * a real InDesign, over the real four processes.
 *
 * Also checked live: index targeting, the no-`document_id` default still being
 * the front document (the additive guarantee), a target that is not open
 * arriving as a `document_not_found` envelope that suggests `document_listOpen`,
 * and a hostile `document_id` being inert rather than executed.
 *
 * It is deliberately NOT part of `npm test` — it needs a running desktop app
 * and mutates real documents (it creates two, then closes them without
 * saving). Run it by hand before releasing changes to the resolver, the
 * wrapper, `registerTool` or the document handlers:
 *
 *   npm run smoke:target
 *
 * It runs on its own bridge port so it never touches a developer's bridge on
 * 8120. Exits non-zero on the first real failure, and leaves every document it
 * did not create untouched.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.SMOKE_TARGET_PORT || '8132';
const APP = process.env.INDESIGN_APP || 'Adobe InDesign 2026';
const EXPECTED_TOOLS = 199;

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
  console.log('      Launch it, then re-run: npm run smoke:target');
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

/** Call a tool and normalise the two shapes it can return. */
async function callTool(name, args) {
  const r = await request('tools/call', { name, arguments: args });
  const text = textOf(r);
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { isError: Boolean(r?.result?.isError), text, json };
}

/** The names of every open document, in `app.documents` order. */
async function openNames() {
  const r = await callTool('document_listOpen', {});
  return Array.isArray(r.json) ? r.json.map((d) => d.name) : [];
}

/** The editing state of one document — `document_id` decides which. */
async function stateOf(documentId) {
  const args = documentId === undefined ? {} : { document_id: documentId };
  const r = await callTool('document_getState', args);
  return r.json;
}

const BOUNDS = { top: 50, left: 50, bottom: 120, right: 300 };

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

// Distinctive tokens so a marker can never be confused with earlier content.
const M = 'TGTSMOKE';
const CREATED = [];

try {
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-document-target', version: '1.0.0' },
  });
  notify('notifications/initialized', {});
  const serverName = init?.result?.serverInfo?.name;
  check('initialize', Boolean(serverName), serverName ?? JSON.stringify(init).slice(0, 200));

  // The contract is the only thing the host sees before it picks tools, so
  // `document_id` has to be named there for the feature to be reachable.
  const instructions = init?.result?.instructions;
  check(
    'the workflow contract names document_id',
    typeof instructions === 'string' && instructions.includes('document_id'),
    typeof instructions === 'string' ? `${instructions.length} chars` : 'absent',
  );

  const list = await request('tools/list', {});
  const tools = list?.result?.tools ?? [];
  check('tools/list returns the documented count', tools.length === EXPECTED_TOOLS, `got ${tools.length}`);

  // `registerTool` adds the parameter centrally; this is the live proof it
  // reaches the wire, which is the failure mode the SDK's schema stripping
  // would produce (an unknown key is dropped before the handler ever runs).
  const addFrame = tools.find((t) => t.name === 'text_addFrame');
  check(
    'document_id is advertised in a tool schema',
    Boolean(addFrame?.inputSchema?.properties?.document_id),
    JSON.stringify(addFrame?.inputSchema?.properties?.document_id ?? null).slice(0, 120),
  );

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
    // Whatever the user already had open must survive this test untouched.
    const before = await openNames();
    check('document_listOpen reads the pre-existing documents', Array.isArray(before), `${before.length} open`);

    const a = await callTool('document_create', { width: 595.28, height: 841.89, pages: 1 });
    const nameA = a.json?.name;
    if (nameA) CREATED.push(nameA);
    check('document_create (A)', Boolean(nameA), String(nameA));

    const b = await callTool('document_create', { width: 595.28, height: 841.89, pages: 1 });
    const nameB = b.json?.name;
    if (nameB) CREATED.push(nameB);
    check('document_create (B)', Boolean(nameB), String(nameB));

    if (!nameA || !nameB || nameA === nameB) {
      check('two distinct documents open', false, `${nameA} / ${nameB}`);
      finish();
    }

    // The ordering is InDesign's; do not assume it. Read which is front.
    const frontState = await stateOf();
    const front = frontState?.activeDocument?.name;
    const other = front === nameA ? nameB : nameA;
    check('the front document is one of the two just created', front === nameA || front === nameB, String(front));
    check('the two documents have distinct indices', frontState?.activeDocumentIndex !== undefined, `index=${frontState?.activeDocumentIndex}`);
    check(
      'document_listOpen reports both',
      (await openNames()).includes(nameA) && (await openNames()).includes(nameB),
      `${nameA}, ${nameB}`,
    );

    const otherState = await stateOf(other);
    const indexOther = otherState?.activeDocumentIndex;
    const indexFront = frontState?.activeDocumentIndex;
    check(
      'document_getState honours document_id',
      otherState?.activeDocument?.name === other,
      `${other} -> ${otherState?.activeDocument?.name}`,
    );
    check('the two indices differ', indexOther !== indexFront, `${indexOther} vs ${indexFront}`);

    // ── The point of the feature: name the NON-front document ──────────────
    const wrote = await callTool('text_addFrame', {
      document_id: other,
      pageIndex: 0,
      bounds: BOUNDS,
      content: `${M}-BY-NAME-ON-OTHER`,
    });
    check('text_addFrame into the non-front document by name is accepted', !wrote.isError, wrote.text.slice(0, 160));

    const readOther = await callTool('text_getTextFrames', { document_id: other, pageIndex: 0 });
    check(
      'the named document received the edit',
      new RegExp(`${M}-BY-NAME-ON-OTHER`).test(readOther.text),
      readOther.text.slice(0, 160),
    );

    const readFront = await callTool('text_getTextFrames', { document_id: front, pageIndex: 0 });
    check(
      'the front document was left alone',
      !new RegExp(`${M}-BY-NAME-ON-OTHER`).test(readFront.text),
      readFront.text.slice(0, 160),
    );

    // ── Index targeting resolves to the same document ──────────────────────
    const wroteIdx = await callTool('text_addFrame', {
      document_id: indexOther,
      pageIndex: 0,
      bounds: { top: 200, left: 50, bottom: 270, right: 300 },
      content: `${M}-BY-INDEX-ON-OTHER`,
    });
    check('text_addFrame by 0-based index is accepted', !wroteIdx.isError, wroteIdx.text.slice(0, 160));

    const readIdx = await callTool('text_getTextFrames', { document_id: other, pageIndex: 0 });
    check(
      'the index targeted the same document as the name',
      new RegExp(`${M}-BY-INDEX-ON-OTHER`).test(readIdx.text),
      readIdx.text.slice(0, 160),
    );

    // ── No document_id is still the front document (additive guarantee) ────
    const wroteFront = await callTool('text_addFrame', {
      pageIndex: 0,
      bounds: { top: 350, left: 50, bottom: 420, right: 300 },
      content: `${M}-NO-TARGET-FRONT`,
    });
    check('text_addFrame with no document_id is accepted', !wroteFront.isError, wroteFront.text.slice(0, 160));

    const frontAfter = await callTool('text_getTextFrames', { document_id: front, pageIndex: 0 });
    check(
      'without document_id the edit lands on the front document',
      new RegExp(`${M}-NO-TARGET-FRONT`).test(frontAfter.text),
      frontAfter.text.slice(0, 160),
    );
    const otherAfter = await callTool('text_getTextFrames', { document_id: other, pageIndex: 0 });
    check(
      'without document_id the non-front document is untouched',
      !new RegExp(`${M}-NO-TARGET-FRONT`).test(otherAfter.text),
      otherAfter.text.slice(0, 160),
    );

    // ── A target that is not open fails loudly, with a recovery hint ───────
    const missing = await callTool('text_getTextFrames', {
      document_id: 'definitely-not-open-in-this-session.indd',
      pageIndex: 0,
    });
    check(
      'an unopened document_id returns a structured error envelope',
      missing.isError && missing.json?.ok === false,
      missing.text.slice(0, 200),
    );
    check(
      'the envelope classifies it as document_not_found',
      missing.json?.code === 'document_not_found',
      String(missing.json?.code),
    );
    check(
      'the envelope suggests document_listOpen',
      missing.json?.suggested_next_tool === 'document_listOpen',
      String(missing.json?.suggested_next_tool),
    );

    // ── A hostile document_id is inert, never executed ─────────────────────
    // If the literal were not escaped, this payload would close document 0.
    const hostile = `x'); app.documents[0].close(SaveOptions.NO); ('y`;
    await callTool('text_getTextFrames', { document_id: hostile, pageIndex: 0 });
    const namesAfterHostile = await openNames();
    check(
      'a hostile document_id is not executed',
      namesAfterHostile.length >= before.length + 2 &&
        namesAfterHostile.includes(nameA) &&
        namesAfterHostile.includes(nameB),
      `${namesAfterHostile.length} open: ${namesAfterHostile.join(', ').slice(0, 120)}`,
    );

    // ── Clean up: close only what this test created, without saving ────────
    for (const name of [nameB, nameA]) {
      const closed = await callTool('document_close', { document_id: name, saveOptions: 'no' });
      check(`document_close ${name} without saving`, !closed.isError, closed.text.slice(0, 120));
    }

    const after = await openNames();
    check(
      'both created documents are closed',
      !after.includes(nameA) && !after.includes(nameB),
      after.join(', ').slice(0, 160),
    );
    check(
      'every pre-existing document survived',
      before.every((n) => after.includes(n)),
      `before=[${before.join(', ')}] after=[${after.join(', ')}]`,
    );
  }
} catch (err) {
  check('harness', false, String(err));
}

finish();
