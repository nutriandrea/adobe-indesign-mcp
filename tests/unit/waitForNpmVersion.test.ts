/**
 * `scripts/wait-for-npm-version.mjs` exists because publishing to npm and the
 * MCP Registry reading from npm are two different systems that do not agree
 * instantly. `npm publish` exiting 0 means the version was accepted, not that
 * `/<package>/<version>` already answers: v1.6.1 was published successfully and
 * the registry job still got a 404 for it seconds later, then passed on a
 * re-run four minutes later.
 *
 * The failure mode is unpleasant precisely because it looks like a broken
 * release, so the guard is worth having in a unit test rather than only in the
 * workflow: a wait that silently does not wait would restore the flake and stay
 * invisible until the next release.
 *
 * The script polls a URL, so the tests inject `fetchImpl` and keep the real
 * clock — the timeout branch has to end by itself, and a no-op `sleep` would
 * make it loop forever instead of failing.
 */
import { describe, it, expect, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_REGISTRY,
  waitForNpmVersion,
} from '../../scripts/wait-for-npm-version.mjs';

const scriptPath = fileURLToPath(new URL('../../scripts/wait-for-npm-version.mjs', import.meta.url));

const ok = (version: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ version }),
});
const notFound = () => ({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) });

/** Answers with the given responses in order, repeating the last one forever. */
function sequence(responses: Array<() => unknown>) {
  let i = 0;
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const pick = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return pick();
  };
  return { fetchImpl, calls };
}

describe('waitForNpmVersion', () => {
  it('returns on the first attempt when the version is already served', async () => {
    const { fetchImpl, calls } = sequence([() => ok('1.2.3')]);
    const sleep = vi.fn(async () => {});

    const result = await waitForNpmVersion({
      name: 'indesign-nutria-mcp',
      version: '1.2.3',
      fetchImpl,
      sleep,
    });

    expect(result.attempts).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(calls).toEqual([`${DEFAULT_REGISTRY}/indesign-nutria-mcp/1.2.3`]);
  });

  it('keeps polling through 404s and resolves when the version propagates', async () => {
    const { fetchImpl, calls } = sequence([notFound, notFound, () => ok('1.2.3')]);
    const sleep = vi.fn(async () => {});

    const result = await waitForNpmVersion({
      name: 'indesign-nutria-mcp',
      version: '1.2.3',
      fetchImpl,
      sleep,
      intervalMs: 1,
      timeoutMs: 5000,
    });

    expect(result.attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(3);
  });

  it('treats a failing request like a 404 instead of giving up', async () => {
    let attempt = 0;
    const fetchImpl = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('ECONNRESET');
      return ok('1.2.3');
    };

    const result = await waitForNpmVersion({
      name: 'indesign-nutria-mcp',
      version: '1.2.3',
      fetchImpl,
      sleep: async () => {},
      intervalMs: 1,
      timeoutMs: 5000,
    });

    expect(result.attempts).toBe(2);
  });

  it('does not accept a 200 that serves a different version', async () => {
    // A registry that answers 200 with the wrong document is the interesting
    // case: trusting the status code alone would publish server.json for a
    // version npm is not serving.
    const { fetchImpl } = sequence([() => ok('9.9.9')]);

    await expect(
      waitForNpmVersion({
        name: 'indesign-nutria-mcp',
        version: '1.2.3',
        fetchImpl,
        intervalMs: 1,
        timeoutMs: 25,
      }),
    ).rejects.toThrow(/served version 9\.9\.9/);
  });

  it('gives up after the timeout, naming the version that never appeared', async () => {
    const { fetchImpl } = sequence([notFound]);

    await expect(
      waitForNpmVersion({
        name: 'indesign-nutria-mcp',
        version: '1.2.3',
        fetchImpl,
        intervalMs: 5,
        timeoutMs: 30,
      }),
    ).rejects.toThrow(/indesign-nutria-mcp@1\.2\.3 was still not served.*last: HTTP 404/);
  });

  it('rejects without a package name or version, rather than polling a broken URL', async () => {
    await expect(waitForNpmVersion({ version: '1.2.3' })).rejects.toThrow(/package name is required/);
    await expect(waitForNpmVersion({ name: 'x' })).rejects.toThrow(/version is required/);
  });
});

describe('scripts/wait-for-npm-version.mjs as a command', () => {
  /** Runs the script against a local HTTP server standing in for npm. */
  async function runAgainst(statuses: number[], args: string[], env: Record<string, string>) {
    let served = 0;
    const server = createServer((req, res) => {
      const status = statuses[Math.min(served, statuses.length - 1)];
      served += 1;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { version: args[0] } : { error: 'Not found' }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;

    try {
      return await new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
        const child = spawn(process.execPath, [scriptPath, ...args], {
          env: {
            ...process.env,
            NPM_REGISTRY_URL: `http://127.0.0.1:${port}`,
            NPM_VERSION_WAIT_INTERVAL_MS: '10',
            ...env,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += String(d)));
        child.stderr.on('data', (d) => (stderr += String(d)));
        child.on('error', fail);
        child.on('close', (code) => done({ code, stdout, stderr }));
      });
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }

  it('exits 0 once the version is served, and says how long it waited', async () => {
    const { code, stdout } = await runAgainst([404, 404, 200], ['9.9.9'], {
      NPM_VERSION_WAIT_TIMEOUT_MS: '10000',
    });

    expect(code).toBe(0);
    expect(stdout).toMatch(/answered after [\d.]+s \(3 attempt\(s\)\)/);
    expect(stdout).toMatch(/retrying in 10ms/);
  });

  it('exits 1 when the version never appears, so the release fails loudly', async () => {
    const { code, stderr } = await runAgainst([404], ['9.9.9'], {
      NPM_VERSION_WAIT_TIMEOUT_MS: '120',
    });

    expect(code).toBe(1);
    expect(stderr).toMatch(/9\.9\.9 was still not served/);
  });
});
