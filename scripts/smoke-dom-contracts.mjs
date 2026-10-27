/**
 * Live contract check for the three tool areas whose unit tests cannot see the
 * truth: images, links and preflight.
 *
 * The unit suite pins the *shape* of the ExtendScript each handler emits. It
 * cannot know whether InDesign has the member it names, and that gap shipped
 * real defects: `Image.imageLink`, `Link.embedded`, `Link.embed()` and
 * `Document.preflightProcesses` are all plausible, all documented-looking, and
 * all absent from the object model. Six tools failed on every document while
 * the suite stayed green.
 *
 * Each check below is one of the things that was actually wrong, written as the
 * assertion that would have caught it:
 *
 *   - images resolve their source through `itemLink`, and report a native and
 *     effective resolution that comes from the graphic rather than a constant;
 *   - links report a readable status instead of `{}`, embedding goes through
 *     `unlink()`, unembedding needs no folder, and a source edited on disk is
 *     reported out of date while a deleted one is reported missing;
 *   - preflight runs on `Application.preflightProcesses` with a profile, reads
 *     `aggregatedResults`, and leaves no process behind.
 *
 * It needs a running desktop InDesign and it opens throwaway documents, so it
 * is deliberately NOT part of `npm test`:
 *
 *   npm run smoke:dom
 *
 * Every document it creates is closed without saving. It uses its own bridge
 * port (8137) so it never collides with the main bridge on 8120.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.SMOKE_PORT || '8137';
const APP = process.env.INDESIGN_APP || 'Adobe InDesign 2026';

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
  console.log('      Launch it, then re-run: npm run smoke:dom');
  process.exit(0);
}

// ── A tiny PNG writer ───────────────────────────────────────────────────────
// The image checks need a real graphic on disk to place, relink and delete.
// Generating it here keeps the script dependency-free; a Python one-liner in a
// temporary directory is how these checks were run by hand, and it is not
// something a repo script should rely on.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(path, [red, green, blue], size = 16) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = y * stride + 1 + x * 3;
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', header),
      pngChunk('IDAT', deflateSync(raw)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

// ── MCP client ──────────────────────────────────────────────────────────────

const workdir = mkdtempSync(join(tmpdir(), 'indesign-dom-contracts-'));

// detached, so that killing this process kills the whole group. `npx` starts
// `tsx`, which starts node: killing the npx child alone leaves a server holding
// the port, and the next run then talks to a server whose proxy is gone and
// reports "bridge not connected" while everything looks fine.
const server = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: REPO,
  env: { ...process.env, BRIDGE_PORT: PORT, LOG_LEVEL: 'error' },
  stdio: ['pipe', 'pipe', 'pipe'],
  detached: true,
});

const pending = new Map();
createInterface({ input: server.stdout }).on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
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
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

function notify(method, params) {
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

const textOf = (response) => {
  const content = response?.result?.content?.[0];
  return content?.type === 'text' ? content.text : JSON.stringify(response);
};

/** Call a tool and keep both the text and whether the server flagged an error. */
async function call(name, args = {}) {
  const response = await request('tools/call', { name, arguments: args });
  return { text: textOf(response), isError: Boolean(response?.result?.isError) };
}

/** Call a tool that is expected to return JSON and parse it. */
async function callJson(name, args = {}) {
  const { text, isError } = await call(name, args);
  if (isError) throw new Error(`${name} failed: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} did not return JSON: ${text.slice(0, 200)}`);
  }
}

const script = async (code) => (await call('script_run', { code })).text;
const scriptJson = async (code) => JSON.parse(await script(code));

// ── Checks ──────────────────────────────────────────────────────────────────

const results = [];
let section = 'setup';
function check(name, ok, detail) {
  results.push({ section, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${section}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function begin(name) {
  section = name;
  console.log(`\n── ${name} ──`);
}

/** Open a throwaway document, run the body, close it without saving. */
async function withDocument(body, { savePath } = {}) {
  await callJson('document_create', { width: 400, height: 400, pages: 1 });
  if (savePath) await callJson('document_save', { filePath: savePath });
  try {
    await body();
  } finally {
    const closed = await call('document_close', { saveOptions: 'no' });
    if (closed.isError) console.error(`  could not close the document: ${closed.text}`);
  }
}

let proxy = null;
function shutdown() {
  for (const child of [proxy, server]) {
    if (!child?.pid) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill();
      } catch {}
    }
  }
  rmSync(workdir, { recursive: true, force: true });
}

async function main() {
  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-dom-contracts', version: '1' },
  });
  notify('notifications/initialized', {});

  proxy = spawn('node', ['bridge-proxy.mjs'], {
    cwd: REPO,
    env: { ...process.env, INDESIGN_APP: APP, BRIDGE_WS_URL: `ws://127.0.0.1:${PORT}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proxy.stderr.on('data', (d) => process.stderr.write(`[proxy] ${d}`));

  let connected = false;
  for (let attempt = 0; attempt < 30 && !connected; attempt++) {
    await sleep(1000);
    const status = await request('resources/read', { uri: 'mcp://bridge/status' }).catch(() => null);
    connected = /"connected"\s*:\s*true/.test(status?.result?.contents?.[0]?.text ?? '');
  }
  if (!connected) throw new Error(`bridge on ${PORT} never connected`);
  begin('setup');
  check('bridge connected', true);

  // ── Images ────────────────────────────────────────────────────────────────
  begin('images');
  const firstPng = join(workdir, 'first.png');
  const secondPng = join(workdir, 'second.png');
  writePng(firstPng, [10, 120, 200]);
  writePng(secondPng, [200, 60, 10]);

  await withDocument(async () => {
    const placed = await callJson('image_place', { pageIndex: 0, filePath: firstPng, x: 20, y: 20 });
    // Image.imageLink does not exist: the place succeeded and then threw while
    // reading it back, which made a good place look like a failed one.
    check('image_place completes and reports what it placed', placed.index === 0, JSON.stringify(placed).slice(0, 120));
    check('image_place reports the link status it read', placed.linkStatus === 'normal', String(placed.linkStatus));

    const list = await callJson('image_list', { pageIndex: 0 });
    check('image_list finds the graphic', list.length === 1, `${list.length} graphics`);
    check('image_list names the placed file', /first\.png$/.test(list[0]?.filePath ?? ''), String(list[0]?.filePath));

    const info = await callJson('image_info', { pageIndex: 0, itemIndex: 0 });
    check('image_info reports the real source path', /first\.png$/.test(info.filePath ?? ''), String(info.filePath));
    // Both numbers used to be invented: actualPpi was the constant 300, and
    // effectivePpi was horizontalScale, a percentage.
    const nativePpi = Array.isArray(info.actualPpi) ? info.actualPpi[0] : info.actualPpi;
    const effectivePpi = Array.isArray(info.effectivePpi) ? info.effectivePpi[0] : info.effectivePpi;
    check('image_info reports a native resolution, not the constant 300', nativePpi !== 300 && nativePpi > 0, String(nativePpi));
    check('image_info reports an effective resolution', effectivePpi > 0, String(effectivePpi));
    check('image_info reports a readable link status', info.linkStatus === 'normal', String(info.linkStatus));

    const relinked = await callJson('image_relink', { pageIndex: 0, itemIndex: 0, filePath: secondPng });
    check('image_relink succeeds', /relink/i.test(JSON.stringify(relinked)), JSON.stringify(relinked).slice(0, 120));
    const afterRelink = await callJson('image_info', { pageIndex: 0, itemIndex: 0 });
    check('the relink actually took effect', /second\.png$/.test(afterRelink.filePath ?? ''), String(afterRelink.filePath));

    // A source that disappears is the case packaging refuses over.
    rmSync(secondPng, { force: true });
    const missing = await callJson('image_info', { pageIndex: 0, itemIndex: 0 });
    check('a deleted source is reported as missing', missing.linkStatus === 'link_missing', String(missing.linkStatus));
  });

  // ── Links ─────────────────────────────────────────────────────────────────
  begin('links');
  const linkedPng = join(workdir, 'linked.png');
  writePng(linkedPng, [200, 80, 20]);

  await withDocument(async () => {
    await callJson('image_place', { pageIndex: 0, filePath: linkedPng, x: 20, y: 20 });

    // Link.embedded does not exist, so all three of these failed outright on
    // any document that had a link.
    const listed = await callJson('resources_listLinks', {});
    check('resources_listLinks works', Array.isArray(listed) && listed.length === 1, `${listed.length} links`);
    check('it reports a readable status', listed[0]?.status === 'normal', String(listed[0]?.status));
    check('it reports the link as not embedded', listed[0]?.embedded === false, String(listed[0]?.embedded));

    const info = await callJson('resources_getLinkInfo', { linkIndex: 0 });
    check('resources_getLinkInfo works', info.name === 'linked.png', String(info.name));
    check('it names the file type', Boolean(info.linkType), String(info.linkType));
    check('it reports the file size and status', info.size > 0 && info.status === 'normal', `size=${info.size} status=${info.status}`);

    const imageLinks = await callJson('image_getLinks', {});
    check('image_getLinks works', imageLinks.length === 1, `${imageLinks.length} links`);
    check('image_getLinks reports a readable status', imageLinks[0]?.status === 'normal', String(imageLinks[0]?.status));

    // Link.embed() does not exist; unlink() embeds the file.
    const embedded = await callJson('resources_embedLink', { linkIndex: 0 });
    check('resources_embedLink works', embedded.status === 'embedded', String(embedded.status));
    check('it reports the link as embedded', embedded.embedded === true, String(embedded.embedded));
    const embeddedInfo = await callJson('resources_getLinkInfo', { linkIndex: 0 });
    check('the document agrees the link is embedded', embeddedInfo.status === 'embedded', String(embeddedInfo.status));

    // unembed() takes the folder to copy into; with none it links back to the
    // original source, which is the behaviour callers want and needs no guess.
    const unembedded = await callJson('resources_unembedLink', { linkIndex: 0 });
    check('resources_unembedLink works without a folder', unembedded.status === 'normal', String(unembedded.status));
    check('it links back to the original file', /linked\.png$/.test(unembedded.filePath ?? ''), String(unembedded.filePath));

    // A source edited after placing is out of date, and the bulk tool can fix
    // that one without being told a path.
    writePng(linkedPng, [20, 80, 200]);
    const stale = await callJson('resources_getLinkInfo', { linkIndex: 0 });
    check('a source edited on disk is reported out of date', stale.status === 'link_out_of_date', String(stale.status));

    // everyItem().relink() throws: relink() needs a path a bulk call cannot
    // invent, so this tool updates what it can and names what it cannot.
    const bulk = await callJson('resources_updateAllLinks', {});
    check('resources_updateAllLinks works instead of throwing', Array.isArray(bulk.updated), JSON.stringify(bulk).slice(0, 140));
    check('it updates the stale link it found', bulk.updated.length === 1, JSON.stringify(bulk.updated));
    const refreshed = await callJson('resources_getLinkInfo', { linkIndex: 0 });
    check('the link is normal after the update', refreshed.status === 'normal', String(refreshed.status));

    rmSync(linkedPng, { force: true });
    const missing = await callJson('resources_getLinkInfo', { linkIndex: 0 });
    check('a deleted source is reported missing', missing.status === 'link_missing', String(missing.status));

    const bulkAgain = await callJson('resources_updateAllLinks', {});
    check('the bulk tool reports the missing link by name', bulkAgain.missing.length === 1, JSON.stringify(bulkAgain.missing));
    check('it does not pretend to have updated it', bulkAgain.updated.length === 0, JSON.stringify(bulkAgain.updated));
  });

  // ── Preflight ─────────────────────────────────────────────────────────────
  begin('preflight');
  await withDocument(
    async () => {
      // Opening a document starts InDesign's own live preflight, so the
      // baseline has to be taken once the document exists.
      const baseline = await scriptJson('JSON.stringify({ processes: app.preflightProcesses.length, profiles: app.preflightProfiles.length })');
      check('the app exposes preflight profiles', baseline.profiles > 0, `${baseline.profiles} profiles`);

      const clean = await callJson('export_preflight', {});
      check('preflight runs on a clean document', clean.hasErrors === false, `hasErrors=${clean.hasErrors}`);
      check('it reports no findings', clean.findingCount === 0, `${clean.findingCount} findings`);
      check('it names the profile it ran', Boolean(clean.profile), String(clean.profile));

      // Packaging runs the preflight setup embedded in the *document*, not the
      // profile above, so the two can disagree. Assert the outcome on disk
      // rather than trusting the report: a refusal writes nothing, and a
      // success has to leave the document in the folder it names.
      const packageDir = join(workdir, 'package');
      mkdirSync(packageDir, { recursive: true });
      const pkg = await call('export_package', { folderPath: packageDir });
      check('export_package responds', !pkg.isError, pkg.text.slice(0, 140));
      const packaged = pkg.isError ? null : JSON.parse(pkg.text);
      const onDisk = readdirSync(packageDir);
      check(
        'a reported refusal is not also reported as a copy',
        !(packaged?.error && packaged?.copiedFiles),
        JSON.stringify(packaged).slice(0, 140),
      );
      check(
        'the report matches what is on disk',
        Boolean(packaged?.error) ? onDisk.length === 0 : packaged?.copiedFiles === onDisk.length && onDisk.length > 0,
        `copiedFiles=${packaged?.copiedFiles ?? 'none'} onDisk=${onDisk.length}`,
      );
      check(
        'packaging either copies the document or says why it did not',
        Boolean(packaged?.copiedFiles) || Boolean(packaged?.error),
        String(packaged?.error ?? packaged?.copiedFiles),
      );

      // Overset text: a problem the profile InDesign ships with does report.
      await script(`
        var doc = __resolveDocument();
        var frame = doc.pages[0].textFrames.add({ geometricBounds: [20, 20, 60, 90] });
        frame.contents = new Array(40).join("Riga di testo che deborda. ");
        "filled";
      `);
      const dirty = await callJson('export_preflight', {});
      check('preflight reports a document with problems', dirty.hasErrors === true, `hasErrors=${dirty.hasErrors}`);
      check('the findings carry the names InDesign uses', dirty.findings.some((f) => f.errorName.length > 0), JSON.stringify(dirty.findings.map((f) => f.errorName)));
      check('the findings carry page and detail where present', dirty.findings.some((f) => f.pageNumber === '1' && f.details.length > 0), JSON.stringify(dirty.findings.find((f) => f.pageNumber === '1') ?? null).slice(0, 160));
      check('the raw report is included', /Errors Found/i.test(dirty.processResults), String(dirty.processResults).slice(0, 100));

      const named = await callJson('export_preflight', { profile: clean.profile });
      check('a profile named explicitly runs', named.profile === clean.profile, String(named.profile));

      // itemByName() cannot resolve "[Basic]" / "[di base]", so the name is
      // matched against the collection and an unknown one fails with the list.
      const bogus = await call('export_preflight', { profile: 'ThisProfileDoesNotExist' });
      check('an unknown profile fails loudly', bogus.isError, bogus.text.slice(0, 120));
      check('the failure lists the profiles that exist', /Available profiles/i.test(bogus.text), bogus.text.slice(0, 160));

      const after = await scriptJson('JSON.stringify({ processes: app.preflightProcesses.length })');
      check('the runs left no preflight process behind', after.processes === baseline.processes, `before=${baseline.processes} after=${after.processes}`);
    },
    { savePath: join(workdir, 'preflight.indd') },
  );

}

let failure = null;
try {
  await main();
} catch (err) {
  failure = err;
  check('the run completed', false, err instanceof Error ? err.message : String(err));
} finally {
  shutdown();
}

const failed = results.filter((r) => !r.ok);
const bySection = [...new Set(results.map((r) => r.section))];
console.log('');
for (const name of bySection) {
  const inSection = results.filter((r) => r.section === name);
  console.log(`${name}: ${inSection.filter((r) => r.ok).length}/${inSection.length}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log(`failed: ${failed.map((f) => `[${f.section}] ${f.name}`).join(', ')}`);
  if (failure) console.error(failure);
  process.exit(1);
}
