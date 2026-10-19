#!/usr/bin/env node
/**
 * Builds the Agensi upload zip for the free companion skill.
 *
 *   npm run build:agensi  ->  dist-agensi/indesign-layout-<version>.zip
 *
 * Agensi's creator checklist fixes the shape of the archive, and getting it
 * wrong is invisible until a reviewer rejects it: one top-level folder named
 * after the skill, `SKILL.md` at the root of that folder, text files only, no
 * OS cruft. The build therefore re-opens its own output and asserts the shape,
 * rather than trusting that `zip` did what the staging tree suggests.
 *
 * `config/` is not committed under `marketplace/agensi/` — it is copied from
 * `examples/` here, so the configs a buyer receives are the same bytes the
 * repo's `distributionManifests` test already validates. A second hand-kept
 * copy would drift.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'marketplace', 'agensi');
const EXAMPLES = join(root, 'examples');
const OUT_DIR = join(root, 'dist-agensi');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

/** Extensions the archive may contain. Text only — a binary is a scan flag. */
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.txt', '.yaml', '.yml']);

function has(bin) {
  // `-v`, not `--version`: Info-ZIP does not promise long options.
  return spawnSync(bin, ['-v'], { stdio: 'ignore' }).status === 0;
}

function fail(message) {
  console.error(`build:agensi: ${message}`);
  process.exit(1);
}

if (!has('zip') || !has('unzip')) {
  fail('`zip` and `unzip` must both be on PATH — the archive is a zip and the build re-opens it.');
}

// 1. The skill's own name decides every path in the archive, so read it first.
const skillMd = join(SRC, 'indesign-layout', 'SKILL.md');
if (!existsSync(skillMd)) fail(`missing ${relative(root, skillMd)}`);

const frontmatter = readFileSync(skillMd, 'utf-8').match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatter) fail('SKILL.md has no YAML frontmatter');
const name = frontmatter[1].match(/^name:\s*(\S+)\s*$/m)?.[1];
if (!name) fail('SKILL.md frontmatter has no `name`');
if (!/^[a-z0-9-]+$/.test(name)) {
  fail(`skill name "${name}" must be lowercase letters, numbers and hyphens only`);
}
if (!/^description:\s*\S+/m.test(frontmatter[1])) {
  fail('SKILL.md frontmatter has no `description` (the field the agent triggers on)');
}

const SKILL_DIR_NAME = name; // Agensi requires folder name === frontmatter name
const SKILL_DIR = join(SRC, SKILL_DIR_NAME);

for (const required of ['SETUP.md', 'README.md']) {
  if (!existsSync(join(SKILL_DIR, required))) fail(`missing ${relative(root, join(SKILL_DIR, required))}`);
}
if (!existsSync(EXAMPLES)) fail('examples/ is missing — the configs the zip carries live there');

// 2. Stage the skill folder exactly as the zip should contain it.
const STAGE = join(OUT_DIR, SKILL_DIR_NAME);
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

for (const file of ['SKILL.md', 'SETUP.md', 'README.md']) {
  cpSync(join(SKILL_DIR, file), join(STAGE, file));
}
cpSync(EXAMPLES, join(STAGE, 'config'), { recursive: true });

// 3. OS cruft is the one thing the checklist names by filename.
for (const junk of ['.DS_Store', 'Thumbs.db']) {
  rmSync(join(STAGE, junk), { force: true });
  rmSync(join(STAGE, 'config', junk), { force: true });
}

// 4. The archive: a single top-level folder, so `zip` runs from its parent.
const out = join(OUT_DIR, `${SKILL_DIR_NAME}-${version}.zip`);
execFileSync('zip', ['-r', '-q', '-X', out, SKILL_DIR_NAME], { cwd: OUT_DIR });

const bytes = statSync(out).size;
const sha256 = createHash('sha256').update(readFileSync(out)).digest('hex');

// 5. Prove the archive, not the staging tree. Read the entry list back and hold
//    it to the checklist — this is the check that a rejected upload would skip.
const entries = execFileSync('unzip', ['-Z1', out], { encoding: 'utf-8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const problems = [];
for (const entry of entries) {
  if (!entry.startsWith(`${SKILL_DIR_NAME}/`)) {
    problems.push(`"${entry}" is not inside the single top-level "${SKILL_DIR_NAME}/" folder`);
  }
  if (/\.DS_Store|Thumbs\.db|__MACOSX/.test(entry)) problems.push(`OS cruft in the archive: "${entry}"`);
}

const mustHave = [
  'SKILL.md',
  'SETUP.md',
  'README.md',
  'config/claude-desktop.json',
  'config/claude-desktop.windows.json',
  'config/cursor.json',
  'config/claude-code.md',
];
for (const file of mustHave) {
  const entry = `${SKILL_DIR_NAME}/${file}`;
  if (!entries.includes(entry)) problems.push(`missing from the archive: "${entry}"`);
}

for (const entry of entries) {
  if (entry.endsWith('/')) continue; // a directory, not a file
  const dot = entry.lastIndexOf('.');
  const ext = dot === -1 ? '' : entry.slice(dot);
  if (!TEXT_EXTENSIONS.has(ext)) problems.push(`non-text file in the archive: "${entry}"`);
}

// The frontmatter inside the archive must still name the folder it sits in.
const packagedName = readFileSync(join(STAGE, 'SKILL.md'), 'utf-8').match(/^name:\s*(\S+)\s*$/m)?.[1];
if (packagedName !== SKILL_DIR_NAME) {
  problems.push(`SKILL.md says name: ${packagedName} but the folder is ${SKILL_DIR_NAME}`);
}

if (problems.length > 0) {
  console.error('build:agensi: the archive would fail Agensi review:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const fileCount = entries.filter((e) => !e.endsWith('/')).length;
console.log(
  `build:agensi: wrote ${relative(root, out)} — v${version}, ${fileCount} files, ` +
    `${(bytes / 1024).toFixed(1)} KB`,
);
console.log(
  `build:agensi: shape verified — single "${SKILL_DIR_NAME}/" folder, SKILL.md at its root, ` +
    `${entries.length} archive entries, text only`,
);
console.log(`build:agensi: sha256 ${sha256}`);
