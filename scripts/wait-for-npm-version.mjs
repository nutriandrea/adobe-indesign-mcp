#!/usr/bin/env node
/**
 * Blocks until the npm registry serves a version that was just published.
 *
 * The MCP Registry proves ownership by fetching the package from npm and
 * matching its `mcpName` against `server.json`, so it has to run after the npm
 * publish. That ordering is necessary but not sufficient: `npm publish`
 * returning successfully does not mean npm's read paths already serve the
 * version. The publish is accepted, and `/<package>/<version>` can keep
 * answering 404 for minutes while the packument and the CDN catch up.
 *
 * v1.6.1 is the case that produced this script. The registry job started
 * seconds after `npm publish` exited 0, asked npm for 1.6.1, got `status: 404`,
 * and `mcp-publisher publish` refused with:
 *
 *   NPM package 'indesign-nutria-mcp' exists, but version '1.6.1' was not found
 *   (status: 404). A newly published release can take a moment to appear on the
 *   registry. Wait and retry
 *
 * Nothing was wrong with the release: the version was served about four minutes
 * later, and re-running the job by hand passed. The failure was timing, but it
 * reported itself as a broken release — the worst kind of red build, the kind
 * that teaches a maintainer to re-run without reading.
 *
 * The wait is bounded on purpose. A job that waits forever hides the real
 * failure (a publish that never landed), so this gives up after
 * `NPM_VERSION_WAIT_TIMEOUT_MS` and says which version never appeared.
 *
 * Usage:
 *   node scripts/wait-for-npm-version.mjs              # version from package.json
 *   node scripts/wait-for-npm-version.mjs 1.6.1        # explicit version
 *
 * Env:
 *   NPM_REGISTRY_URL               default https://registry.npmjs.org
 *   NPM_VERSION_WAIT_TIMEOUT_MS    default 900000 (15 min)
 *   NPM_VERSION_WAIT_INTERVAL_MS   default 10000 (10 s)
 */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_INTERVAL_MS = 10 * 1000;

/**
 * Polls `/<name>/<version>` until it answers with that version.
 *
 * Resolves with the attempt count and elapsed time; rejects on timeout. Every
 * dependency that touches the outside world is injectable so the retry
 * behaviour can be tested without a network or a long wait.
 */
export async function waitForNpmVersion({
  name,
  version,
  registry = DEFAULT_REGISTRY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  log = () => {},
} = {}) {
  if (!name) throw new Error('wait-for-npm-version: a package name is required');
  if (!version) throw new Error('wait-for-npm-version: a version is required');
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'wait-for-npm-version: no fetch implementation available (Node >= 18 provides a global fetch)',
    );
  }

  const url = `${registry.replace(/\/+$/, '')}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const started = Date.now();
  let attempts = 0;
  let last = 'no attempt was made';

  for (;;) {
    attempts += 1;
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (response.ok) {
        // A 200 for the version endpoint is the answer we want, but the served
        // document is what proves it: a misconfigured registry (or a proxy)
        // could answer 200 with something else entirely, and publishing
        // server.json on that basis is the mistake this is meant to prevent.
        const served = (await response.json())?.version;
        if (served === version) {
          const waitedMs = Date.now() - started;
          log(`wait-for-npm-version: ${name}@${version} is served after ${attempts} attempt(s)`);
          return { attempts, waitedMs, url };
        }
        last = `the registry served version ${String(served)}`;
      } else {
        last = `HTTP ${response.status}`;
      }
    } catch (error) {
      // Connection resets and DNS blips are as transient as a 404 here, and a
      // release should not fail on one of them.
      last = `request failed: ${error?.message ?? String(error)}`;
    }

    const elapsed = Date.now() - started;
    if (elapsed >= timeoutMs) break;

    log(
      `wait-for-npm-version: ${name}@${version} not served yet (${last}); retrying in ${intervalMs}ms`,
    );
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }

  throw new Error(
    `wait-for-npm-version: ${name}@${version} was still not served by ${registry} after ${Math.round(
      (Date.now() - started) / 1000,
    )}s and ${attempts} attempt(s) (last: ${last}). If the publish itself failed, fix that; if npm is only slow, re-run this job.`,
  );
}

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`wait-for-npm-version: ${name} must be a positive number of milliseconds, got '${raw}'`);
  }
  return value;
}

/** True only when this file is the node entry point, so importing it stays side-effect free. */
function isEntryPoint() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    const version = process.argv[2] ?? pkg.version;
    const { attempts, waitedMs, url } = await waitForNpmVersion({
      name: pkg.name,
      version,
      registry: process.env.NPM_REGISTRY_URL ?? DEFAULT_REGISTRY,
      timeoutMs: envNumber('NPM_VERSION_WAIT_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
      intervalMs: envNumber('NPM_VERSION_WAIT_INTERVAL_MS', DEFAULT_INTERVAL_MS),
      log: (line) => console.log(line),
    });
    console.log(
      `wait-for-npm-version: ${url} answered after ${(waitedMs / 1000).toFixed(1)}s (${attempts} attempt(s))`,
    );
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  }
}
