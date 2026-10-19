#!/usr/bin/env node
/**
 * Packs the package, installs the tarball into a temp dir, and boots the
 * packed server over stdio.
 *
 * Importing the entry point is not an option: `src/index.ts` calls `main()` at
 * module scope, so an import would start the server and hang. Spawning the
 * packed binary and completing a real initialize + tools/list handshake is both
 * possible and a stronger check — it proves the artifact a user installs
 * actually runs, not merely that it can be resolved.
 *
 * It also asserts that the files the package's own entry points reference are
 * inside the tarball. That is not hypothetical: `.npmignore` excluded
 * `bridge-proxy.mjs` while shipping `start-bridge.sh`, which execs it, so the
 * plugin-free macOS setup could not have worked from an npm install. A
 * handshake alone would not have noticed, because the server only reaches for
 * the proxy when it runs a script.
 *
 * And it asserts the version the packed server announces on `initialize` is the
 * version in `package.json` — the one field a host or a bug report uses to tell
 * which build is running. `tests/unit/serverVersion.test.ts` checks the literal
 * against `package.json`; this checks the artifact a user actually installs,
 * which is the only place the bug was ever visible.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_NAME = 'indesign-nutria-mcp';

/**
 * Files that must be in the tarball because something already in the tarball
 * invokes them: the `bin` entry the package declares, and the runtime pieces
 * `start-bridge.sh` and the server reach for.
 */
const REQUIRED_RUNTIME_FILES = [
  'dist/index.js',
  'bridge-proxy.mjs',
  'jxa-driver.js',
  'start-bridge.sh',
  'assets/windows/run_jsx_persistent.vbs',
  // The UXP panel is the documented alternative to the proxy, and the skill is
  // what a host loads to use the tools well. Neither is reached by the server
  // itself, so neither would be missed by the boot handshake above — which is
  // exactly why they are named here.
  'plugin/manifest.json',
  'plugin/index.js',
  'skills/indesign/indesign-mcp-layout/SKILL.md',
];

const fail = (message) => {
  console.error(`verify-pack: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
};

const tmp = mkdtempSync(join(tmpdir(), 'mcp-pack-'));
let tarball;
process.on('exit', () => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  if (tarball) {
    try {
      rmSync(join(root, tarball), { force: true });
    } catch {
      /* best effort */
    }
  }
});

if (!existsSync(join(root, 'dist/index.js'))) {
  console.error('verify-pack: dist/index.js is missing. Run `npm run build` first.');
  process.exit(1);
}

function run(label, fn) {
  process.stdout.write(`verify-pack: ${label} ... `);
  const value = fn();
  console.log('ok');
  return value;
}

/**
 * npm hands its own configuration down to lifecycle scripts, so a
 * `prepublishOnly` run started by `npm publish --dry-run` puts
 * `npm_config_dry_run` in the environment of everything below it. Under that
 * flag `npm pack` reports a tarball it never writes and `npm install` fails
 * with ENOENT on the prefix directory it never creates (exit 254) — a dry run
 * reported as a broken package, at the one moment a maintainer is checking
 * whether the package is sound. This script exists to inspect real files, so
 * it drops the inherited flag for its children.
 *
 * The flag arrives through the environment, and a `--dry-run=false` on each
 * command does override it, but dropping it once here is what keeps both npm
 * calls below (and anything they spawn) out of dry-run mode.
 */
delete process.env.npm_config_dry_run;

const packed = run('npm pack', () =>
  JSON.parse(execFileSync('npm', ['pack', '--json'], { cwd: root, encoding: 'utf8' }))[0],
);
tarball = packed.filename;
const packagedPaths = new Set(packed.files.map((f) => f.path));

const missing = REQUIRED_RUNTIME_FILES.filter((p) => !packagedPaths.has(p));
if (missing.length > 0) {
  console.error(`verify-pack: the tarball is missing files it needs at runtime:`);
  for (const p of missing) console.error(`  - ${p}`);
  console.error(
    `  (packed ${packagedPaths.size} files; check the files allowlist in package.json — an entry point shipped without the file it runs is broken on install)`,
  );
  process.exit(1);
}

run('npm install into a temp dir', () =>
  execFileSync('npm', ['install', '--prefix', tmp, '--no-save', '--no-package-lock', join(root, tarball)], {
    cwd: root,
    stdio: 'ignore',
  }),
);

const pkgDir = join(tmp, 'node_modules', PKG_NAME);
if (!existsSync(join(pkgDir, 'package.json'))) {
  fail(`expected the installed package at ${pkgDir}`);
}

const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const binRel = typeof installed.bin === 'string' ? installed.bin : Object.values(installed.bin ?? {})[0];
if (!binRel) fail('the package declares no bin entry');
const entry = join(pkgDir, binRel);
if (!existsSync(entry)) fail(`the declared bin entry ${binRel} is not in the installed package`);

const result = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [entry], {
    cwd: tmp,
    env: { ...process.env, BRIDGE_PORT: '8199', LOG_LEVEL: 'error' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error('timed out waiting for initialize'));
  }, 30000);
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });
  child.on('error', reject);
  child.on('exit', (code) => {
    clearTimeout(timer);
    reject(new Error(`server exited early (code ${code})\n${stderr}`));
  });
  const send = (o) => child.stdin.write(`${JSON.stringify(o)}\n`);
  const instructions = { present: false, serverVersion: null };
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === 1) {
      instructions.present = typeof msg.result?.instructions === 'string';
      instructions.serverVersion = msg.result?.serverInfo?.version ?? null;
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    } else if (msg.id === 2) {
      clearTimeout(timer);
      child.removeAllListeners('exit');
      child.kill();
      resolve({
        tools: msg.result?.tools?.length ?? 0,
        instructions: instructions.present,
        serverVersion: instructions.serverVersion,
      });
    }
  });
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'verify-pack', version: '1.0.0' },
    },
  });
});

if (result.tools < 1) fail(`the packed server advertised ${result.tools} tools`);
if (!result.instructions) fail('the packed server did not advertise the workflow contract');

const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).version;
if (result.serverVersion !== declared) {
  fail(
    `the packed server announces version ${result.serverVersion} on initialize, but package.json says ${declared} — a stale version is worse than an absent one, because it looks authoritative`,
  );
}

console.log(
  `verify-pack: the packed artifact boots, announces v${result.serverVersion}, and advertises ${result.tools} tools and the workflow contract`,
);
