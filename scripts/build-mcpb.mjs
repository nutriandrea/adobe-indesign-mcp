#!/usr/bin/env node
/**
 * Builds a distributable `.mcpb` (MCP Bundle) for the InDesign server.
 *
 *   npm run build:mcpb   ->  dist-mcpb/indesign-nutria-mcp-<version>.mcpb
 *
 * The bundle is an MCPB v0.3 archive: `manifest.json` at the root next to a
 * self-contained copy of the server. The layout is deliberately the *published
 * package* layout, not the `server/` convention, because the server resolves
 * `assets/windows/*.vbs` as `../../assets/…` from `dist/bridge/` — so the bytes
 * on disk inside the bundle have to sit where `verify:pack` proved they work.
 * `mcpb/manifest.json` therefore points `entry_point` at `dist/index.js`.
 *
 * The server files come from `npm pack`, so the bundle contains exactly what
 * `verify:pack` already asserted is complete, plus production dependencies. It
 * is not committed — it is attached to the GitHub Release by `release.yml`.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(root, 'dist-mcpb');
const STAGE = join(OUT_DIR, 'stage');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

function has(bin) {
  // `-v`, not `--version`: Info-ZIP is the implementation on macOS and Linux and
  // it does not promise long options.
  return spawnSync(bin, ['-v'], { stdio: 'ignore' }).status === 0;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

if (!has('zip') || !has('unzip')) {
  console.error(
    'build:mcpb: `zip` and `unzip` must both be on PATH. MCPB is a zip archive, and the build ' +
      're-opens its own output to boot the server inside it (macOS and most Linux images ship both).',
  );
  process.exit(1);
}

if (!existsSync(join(root, 'dist', 'index.js'))) {
  console.error('build:mcpb: dist/index.js is missing. Run `npm run build` first.');
  process.exit(1);
}

const icon = join(root, 'plugin', 'icon-96.png');

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

// 1. The exact files `npm pack` ships — the artifact verify:pack already booted.
process.stdout.write('build:mcpb: packing the package ... ');
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--json', '--pack-destination', STAGE], { cwd: root, encoding: 'utf8' }),
)[0];
console.log('ok');

const tarball = join(STAGE, packed.filename);
execFileSync('tar', ['-xzf', tarball, '-C', STAGE, '--strip-components=1']);
rmSync(tarball, { force: true });

// 2. The MCPB manifest, at the archive root, with its version pinned to the package.
const manifest = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf-8'));
if (manifest.version !== version) {
  console.error(
    `build:mcpb: mcpb/manifest.json says ${manifest.version} but package.json says ${version}. ` +
      'A release bumps both; tests/unit/serverVersion.test.ts fails on the drift.',
  );
  process.exit(1);
}
cpSync(join(root, 'mcpb', 'manifest.json'), join(STAGE, 'manifest.json'));
if (existsSync(icon)) cpSync(icon, join(STAGE, 'icon.png'));

// 3. Production dependencies, installed from the bundle's own package.json.
process.stdout.write('build:mcpb: installing production dependencies ... ');
execFileSync(
  'npm',
  ['install', '--omit=dev', '--no-save', '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: STAGE, stdio: 'ignore' },
);
console.log('ok');

// 4. The archive. The entry point the manifest names must be inside it.
const entry = join(STAGE, manifest.server.entry_point);
if (!existsSync(entry)) {
  console.error(`build:mcpb: manifest entry_point ${manifest.server.entry_point} is not in the bundle`);
  process.exit(1);
}

const out = join(OUT_DIR, `${pkg.name}-${version}.mcpb`);
rmSync(out, { force: true });
// -X drops the extra file attributes (uid/gid, resource forks) that differ per
// machine. The archive is still NOT byte-reproducible — `npm install` writes its
// own metadata — so two builds of the same version hash differently. That is
// acceptable for the registry, which hashes the artifact actually uploaded.
execFileSync('zip', ['-r', '-q', '-X', out, '.'], { cwd: STAGE });

const bytes = statSync(out).size;
const files = walk(STAGE).length;
const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex');

// 5. Prove the archive rather than the staging directory. An MCPB that unzips
//    but cannot answer `initialize` is the failure this whole script exists to
//    prevent, and it is invisible from the staging tree — the manifest could
//    name a file that only exists in the build directory.
const checkDir = mkdtempSync(join(tmpdir(), 'mcpb-check-'));
try {
  execFileSync('unzip', ['-q', out, '-d', checkDir]);

  if (!existsSync(join(checkDir, 'manifest.json'))) {
    console.error('build:mcpb: the archive has no manifest.json at its root');
    process.exit(1);
  }
  // The one relative path the Windows path depends on: dist/bridge/*.js reaches
  // `../../assets/…`, so the asset has to sit at the archive root.
  if (!existsSync(join(checkDir, 'assets', 'windows', 'run_jsx_persistent.vbs'))) {
    console.error(
      'build:mcpb: assets/windows/run_jsx_persistent.vbs is missing from the archive root, ' +
        'so the packaged Windows bridge would be broken on first use',
    );
    process.exit(1);
  }

  const booted = await bootFromBundle(join(checkDir, manifest.server.entry_point), checkDir);
  if (booted.tools !== 198) {
    console.error(`build:mcpb: the bundled server advertises ${booted.tools} tools, expected 198`);
    process.exit(1);
  }
  if (!booted.instructions) {
    console.error('build:mcpb: the bundled server did not advertise the workflow contract');
    process.exit(1);
  }
  if (booted.version !== version) {
    console.error(`build:mcpb: the bundled server announces ${booted.version}, expected ${version}`);
    process.exit(1);
  }

  console.log(
    `build:mcpb: wrote ${relative(root, out)} — ${version}, ${files} files, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB`,
  );
  console.log(
    `build:mcpb: the archive boots, announces v${booted.version}, and advertises ${booted.tools} tools`,
  );
  console.log(
    `build:mcpb: sha256 ${sha256} ` +
      '(a registry `registryType: "mcpb"` entry would need this plus the artifact on a release)',
  );
} finally {
  rmSync(checkDir, { recursive: true, force: true });
}

/** Spawn the bundled entry point and complete an initialize + tools/list handshake. */
function bootFromBundle(entry, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      cwd,
      env: { ...process.env, BRIDGE_PORT: '8201', LOG_LEVEL: 'error' },
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
      reject(new Error(`the bundled server exited early (code ${code})\n${stderr}`));
    });
    const send = (o) => child.stdin.write(`${JSON.stringify(o)}\n`);
    const seen = { present: false, serverVersion: null };
    createInterface({ input: child.stdout }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.id === 1) {
        seen.present = typeof msg.result?.instructions === 'string';
        seen.serverVersion = msg.result?.serverInfo?.version ?? null;
        send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      } else if (msg.id === 2) {
        clearTimeout(timer);
        child.removeAllListeners('exit');
        child.kill();
        resolve({
          tools: msg.result?.tools?.length ?? 0,
          instructions: seen.present,
          version: seen.serverVersion,
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
        clientInfo: { name: 'build-mcpb', version: '1.0.0' },
      },
    });
  });
}
