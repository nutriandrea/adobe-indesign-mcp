/**
 * Regenerates `server.json` — the MCP Registry manifest — from package.json.
 *
 *   npm run server:json            # write server.json
 *   npm run server:json -- --check # exit 1 if the file on disk is stale
 *
 * Every field here is load-bearing, and none of them can be checked by a human
 * reading the file:
 *
 *  - `name` MUST equal the `mcpName` in package.json. That equality is the
 *    *only* thing the registry uses to prove the npm package belongs to this
 *    GitHub account; get it wrong and the publish is rejected with a generic
 *    "package validation failed".
 *  - `version` and `packages[0].version` MUST equal the published package
 *    version. A hand-maintained copy is the exact drift that once shipped a
 *    1.4.2 build announcing 1.0.0 — see `SERVER_VERSION` and
 *    `tests/unit/serverVersion.test.ts`.
 *  - `packages[0].identifier` MUST equal the package name, because that is what
 *    the registry tells a client to install.
 *  - `description` MUST be at most 100 *bytes*, which is a limit of the
 *    registry, not of npm: the publish is rejected with a bare
 *    `expected length <= 100` and nothing saying which file was wrong.
 *
 * So it is generated, and `npm run verify:server-json` (in `npm run verify` and
 * in CI) fails the build the moment the checked-in file disagrees with the
 * package. `tests/unit/distributionManifests.test.ts` pins the shape.
 *
 * A `registryType: "mcpb"` entry is deliberately absent: the registry requires a
 * `fileSha256` of an artifact already uploaded to GitHub Releases, which cannot
 * exist at generation time. The `.mcpb` is attached to the release by
 * `.github/workflows/release.yml` instead (see `npm run build:mcpb`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(root, 'server.json');

/**
 * Pinned by date, not by "latest": the schema URL is part of the registry's
 * versioned contract, and a moving one would change the meaning of this file
 * without any commit here changing.
 */
const SCHEMA = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

export interface PackageJson {
  name: string;
  version: string;
  description?: string;
  mcpName?: string;
  repository?: { url?: string };
}

/** `git+https://github.com/o/r.git` -> `https://github.com/o/r` (what the registry expects). */
export function repositoryUrl(url: string): string {
  return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

export function render(pkg: PackageJson): string {
  if (!pkg.mcpName) {
    throw new Error(
      'package.json has no `mcpName`. The MCP Registry proves npm ownership by matching ' +
        '`mcpName` against `name` in server.json, so the publish cannot be verified without it.',
    );
  }

  // The registry's limit is 100 and it is a *registry* limit, not an npm one.
  // Count bytes rather than characters: UTF-8 bytes are always >= characters,
  // so this is the conservative check, and an em dash is one character but
  // three bytes. The registry's own rejection only says "expected length <= 100"
  // and names no file, so this is where the message has to come from.
  const description = pkg.description ?? '';
  const descriptionBytes = Buffer.byteLength(description, 'utf-8');
  if (descriptionBytes > 100) {
    throw new Error(
      `package.json description is ${descriptionBytes} bytes but the MCP Registry allows at most ` +
        '100. Shorten `description` in package.json, then run `npm run server:json`.',
    );
  }

  const manifest = {
    $schema: SCHEMA,
    name: pkg.mcpName,
    title: 'Adobe InDesign',
    description: pkg.description,
    version: pkg.version,
    repository: {
      url: repositoryUrl(pkg.repository?.url ?? ''),
      source: 'github',
    },
    packages: [
      {
        registryType: 'npm',
        identifier: pkg.name,
        version: pkg.version,
        transport: { type: 'stdio' },
      },
    ],
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function main(): void {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as PackageJson;
  const generated = render(pkg);

  if (process.argv.includes('--check')) {
    let current: string;
    try {
      current = readFileSync(OUTPUT, 'utf-8');
    } catch {
      console.error('server.json is missing. Run: npm run server:json');
      process.exit(1);
    }
    if (current !== generated) {
      console.error(
        'server.json is out of date with package.json ' +
          `(package is ${pkg.name}@${pkg.version}). Run: npm run server:json`,
      );
      process.exit(1);
    }
    console.log(`server.json matches package.json (${pkg.mcpName}@${pkg.version})`);
    return;
  }

  writeFileSync(OUTPUT, generated, 'utf-8');
  console.log(`wrote server.json — ${pkg.mcpName}@${pkg.version}, npm ${pkg.name}`);
}

main();
