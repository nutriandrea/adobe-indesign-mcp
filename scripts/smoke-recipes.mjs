/**
 * Live gate for the two recipes (plan S4).
 *
 * These tools cannot be proven by the unit suite. Their unit tests pin the
 * *shape* of the ExtendScript they emit — that it calls `place`, links
 * `nextTextFrame`, validates the preset — but not that InDesign agrees. Two
 * things in particular are unverifiable without a running app:
 *
 *   1. that `TextFrame.place(File)` plus `nextTextFrame` actually flows a story
 *      and creates the pages it needs, and
 *   2. that the whole flow is **one** undo step, so a single Undo puts the
 *      document back the way it was.
 *
 * The plan's S4 exit criterion is a *measured* advantage, and its verification
 * is "live smoke per recipe; assert one Undo reverts the whole outcome". This
 * script is that gate. It is deliberately NOT part of `npm test` — it needs a
 * running desktop app and mutates real documents:
 *
 *   npm run smoke:recipes
 *
 * It uses its own bridge port (8133) so it never collides with the main smoke
 * test (8131) or a developer's own bridge (8120). It creates one document,
 * flows a long text file through it, undoes that flow, exports a PDF, and
 * closes without saving. Exits non-zero on the first real failure.
 *
 * The turn/token delta versus the atomic chain is *not* measurable here — it
 * needs a model in the loop. The script prints the round-trip counts it can
 * measure (the recipe is 1 call; the chain it replaces is many) and leaves the
 * token half to the maintainer.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.SMOKE_PORT || '8133';
const APP = process.env.INDESIGN_APP || 'Adobe InDesign 2026';
const EXPECTED_TOOLS = 198;

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
  console.log('      Launch it, then re-run: npm run smoke:recipes');
  process.exit(0);
}

// A scratch directory outside the repo: one text file to flow, one PDF target.
const workdir = mkdtempSync(join(tmpdir(), 'indesign-recipes-'));
const storyPath = join(workdir, 'story.txt');
const pdfPath = join(workdir, 'out.pdf');

// Long enough to overflow a single A4 page several times over, so the recipe
// *must* create pages — that is the behaviour under test. If the text fit on
// one page we would be asserting nothing.
const storyText = Array.from(
  { length: 300 },
  (_, i) => `Paragraph ${i + 1}: the quick brown fox jumps over the lazy dog.`,
).join('\n');
writeFileSync(storyPath, storyText);

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
    }, 120_000);
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
const call = (name, args) => request('tools/call', { name, arguments: args });
const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
/** Page count from `document_getState`, tolerant of an unexpected shape. */
const pageCount = async () => {
  const state = parse(textOf(await call('document_getState', {})));
  return state?.activeDocument?.pages ?? null;
};

let proxy = null;
function cleanup() {
  proxy?.kill();
  server.kill();
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
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
    clientInfo: { name: 'smoke-recipes', version: '1.0.0' },
  });
  notify('notifications/initialized', {});
  check('initialize', Boolean(init?.result?.serverInfo?.name), init?.result?.serverInfo?.name);

  const list = await request('tools/list', {});
  const toolCount = list?.result?.tools?.length;
  check('tools/list returns the documented count', toolCount === EXPECTED_TOOLS, `got ${toolCount}`);
  const names = new Set((list?.result?.tools ?? []).map((t) => t.name));
  check(
    'both recipes are advertised',
    names.has('recipe_flowTextStory') && names.has('recipe_exportPreset'),
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
    const created = await call('document_create', { width: 595.28, height: 841.89, pages: 1 });
    check('document_create', !created?.result?.isError, textOf(created).slice(0, 120));

    const before = await pageCount();
    check('document starts on a single page', before === 1, `pages=${before}`);

    // ---- recipe_flowTextStory ------------------------------------------
    const flow = await call('recipe_flowTextStory', { filePath: storyPath, maxPages: 25 });
    const flowText = textOf(flow);
    const flowBody = parse(flowText);
    check('recipe_flowTextStory succeeds', !flow?.result?.isError, flowText.slice(0, 200));

    const frames = flowBody?.framesCreated;
    const pagesUsed = flowBody?.pagesUsed;
    const pagesAdded = flowBody?.pagesAdded;
    check(
      'recipe_flowTextStory reports one frame per page',
      Array.isArray(pagesUsed) && pagesUsed.length === frames && frames >= 1,
      `framesCreated=${frames} pagesUsed=${JSON.stringify(pagesUsed)}`,
    );
    check(
      'recipe_flowTextStory created the pages it needed',
      typeof pagesAdded === 'number' && pagesAdded >= 1,
      `pagesAdded=${pagesAdded}`,
    );
    check(
      'recipe_flowTextStory flowed the whole story',
      flowBody?.overflows === false,
      `overflows=${flowBody?.overflows} storyLength=${flowBody?.storyLength}`,
    );

    const after = await pageCount();
    check(
      'document grew by the reported pages',
      typeof pagesAdded === 'number' && after === before + pagesAdded,
      `${before} -> ${after}`,
    );

    // ---- one Undo reverts the whole flow --------------------------------
    const undone = await call('undo', {});
    check('undo succeeds', !undone?.result?.isError, textOf(undone).slice(0, 120));
    const restored = await pageCount();
    check(
      'one Undo reverts the whole flow',
      restored === before,
      `pages ${after} -> ${restored} (expected ${before})`,
    );

    // ---- recipe_exportPreset: the error path lists the valid names ------
    const badPreset = await call('recipe_exportPreset', {
      presetName: '__no_such_preset__',
      filePath: pdfPath,
    });
    const badEnvelope = parse(textOf(badPreset));
    const available = String(badEnvelope?.message ?? '').match(/Available:\s*(.+)$/s);
    check(
      'unknown preset fails as invalid_arguments and lists the valid names',
      Boolean(badPreset?.result?.isError) &&
        badEnvelope?.code === 'invalid_arguments' &&
        Boolean(available),
      badEnvelope ? `code=${badEnvelope.code}` : textOf(badPreset).slice(0, 200),
    );

    // ---- recipe_exportPreset: the happy path ----------------------------
    if (available) {
      const presetName = available[1].split(',')[0].trim();
      const exported = await call('recipe_exportPreset', { presetName, filePath: pdfPath });
      const body = parse(textOf(exported));
      const wrote = existsSync(pdfPath);
      check(
        'recipe_exportPreset exports with a real preset',
        !exported?.result?.isError && wrote,
        `${presetName} -> ${wrote ? 'file written' : 'no file'}`,
      );
      check(
        'recipe_exportPreset echoes the target',
        body?.exportedTo === pdfPath,
        body ? String(body.exportedTo) : textOf(exported).slice(0, 120),
      );
    } else {
      check('recipe_exportPreset exports with a real preset', false, 'no preset names to try');
    }

    // The round-trip half of the S4 measurement. The token half needs a model
    // in the loop and is left to the maintainer.
    console.log(
      '\nround-trips: recipe_flowTextStory = 1 tool call. The atomic chain it replaces is ' +
        'text_addFrame + N x (pages_add + text_addFrame + a frame-link step) + a re-read to see ' +
        'where the story ended — a round-trip per page, then another to confirm.',
    );

    const closed = await call('document_close', { saveOptions: 'no' });
    check('document_close', !closed?.result?.isError, textOf(closed).slice(0, 120));
  }
} catch (err) {
  check('harness', false, String(err));
}

finish();
