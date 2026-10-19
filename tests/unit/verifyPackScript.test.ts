/**
 * `scripts/verify-pack.mjs` is the one check that runs from inside npm rather
 * than beside it: `prepublishOnly` calls it, so `npm publish --dry-run` puts
 * `npm_config_dry_run` into the environment of everything it spawns. Under that
 * flag npm does less than it reports — `npm pack` returns a manifest, a shasum
 * and a size for a tarball it never writes, and `npm install` exits 254 with
 * ENOENT on the prefix directory it never creates. The result is a verification
 * script that reports a broken package, at the moment a maintainer is running
 * exactly that check to find out whether the package is sound.
 *
 * The script drops the inherited flag before it spawns anything. Keeping that
 * drop, and keeping it first, is the whole guard: the failure it prevents is
 * invisible in review (one line deleting one variable) and its symptom points
 * at the tarball rather than at npm's dry-run mode.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../../scripts/verify-pack.mjs', import.meta.url)),
  'utf-8',
);

const DROP = 'delete process.env.npm_config_dry_run';

describe('scripts/verify-pack.mjs survives being run by npm', () => {
  it('drops the dry-run flag npm hands down to lifecycle scripts', () => {
    expect(source).toContain(DROP);
  });

  it('drops it before the first npm child, so no npm call inherits it', () => {
    const drop = source.indexOf(DROP);
    const firstNpmChild = source.indexOf("execFileSync('npm'");
    expect(firstNpmChild).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(firstNpmChild);
  });
});
