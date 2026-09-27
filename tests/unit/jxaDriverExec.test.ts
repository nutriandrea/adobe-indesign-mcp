/**
 * Real-execution tests for jxa-driver.js.
 *
 * The driver runs as `osascript -l JavaScript jxa-driver.js <script> <app>`.
 * That contract is invisible to type-checking and to every other test, and it
 * has two traps:
 *
 *  1. osascript reports a script's *result* on stderr, not stdout. A driver that
 *     worked perfectly would look like a failure to anything reading stdout.
 *  2. osascript invokes `run(argv)` itself, and there is no global `argv`. A
 *     driver that looks broken-but-obviously-fine to a reader — declaring run()
 *     and then explicitly calling `run(argv);` — dies with
 *     "ReferenceError: Can't find variable: argv (-2700)" on every single call.
 *
 * These tests spawn the real osascript against a bogus application name, which
 * needs no InDesign licence and no running instance, and assert that the driver
 * is reachable end to end, that argv is threaded through, and that a failure
 * comes back as parseable JSON rather than a raw JXA stack trace.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DRIVER = join(REPO_ROOT, 'jxa-driver.js');
const BOGUS_APP = 'NoSuchApplicationForTests0000';

let scriptDir: string;

function writeScript(name: string, code: string): string {
  const file = join(scriptDir, name);
  writeFileSync(file, code, 'utf-8');
  return file;
}

/**
 * osascript reports a script's *result* on stderr, not stdout — that was one of
 * the original proxy bugs. We surface both streams so tests can assert on the
 * stream the result actually lands on.
 */
function runDriver(scriptFile: string, app = BOGUS_APP) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', DRIVER, scriptFile, app],
      { encoding: 'utf-8', timeout: 30_000 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: number }).code === 'number' ? (err as { code: number }).code : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** The result string, wherever osascript chose to put it. */
function resultOf(run: { stdout: string; stderr: string }): string {
  return (run.stderr.trim() || run.stdout.trim()).trim();
}

beforeAll(() => {
  scriptDir = mkdtempSync(join(tmpdir(), 'jxa-driver-test-'));
});

afterAll(() => {
  rmSync(scriptDir, { recursive: true, force: true });
});

describe('jxa-driver.js real execution', () => {
  it('is actually invoked, and reports a failure as parseable JSON', async () => {
    const script = writeScript('valid.jsx', 'app.documents.length');
    const run = await runDriver(script);

    // Non-empty output is the whole point: if osascript never reached run(), the
    // driver would emit nothing at all.
    const result = resultOf(run);
    expect(result, 'driver produced no output — osascript never reached run(argv)').not.toBe('');

    // Bogus app name must surface as structured JSON the proxy can forward,
    // not a raw JXA exception with a multi-line stack trace.
    const parsed = JSON.parse(result) as { __bridge_error?: string };
    expect(typeof parsed.__bridge_error, `expected __bridge_error, got: ${result}`).toBe('string');
    expect(parsed.__bridge_error).toBeTruthy();
  });

  it('is not shadowed by a stray explicit run(argv) call', async () => {
    // Guards the exact edit that breaks this driver: declaring run(argv) and then
    // also calling it, which dies on a non-existent global `argv`. osascript
    // already performs the call.
    const source = readFileSync(DRIVER, 'utf-8');
    const trailing = source.slice(source.indexOf('\n}', source.lastIndexOf('function run')));
    expect(
      /\brun\(\s*argv\s*\)\s*;/.test(trailing),
      'jxa-driver.js calls run(argv) explicitly after the function body — ' +
        'osascript already invokes it, and there is no global argv variable',
    ).toBe(false);
  });

  it('exits cleanly so a failed call is not a transport failure', async () => {
    const script = writeScript('clean.jsx', '1');
    const run = await runDriver(script);
    expect(run.code).toBe(0);
  });

  it('reports a missing script file as an error, not silence', async () => {
    const run = await runDriver(join(scriptDir, 'does-not-exist.jsx'));
    const result = resultOf(run);
    expect(result).not.toBe('');
    const parsed = JSON.parse(result) as { __bridge_error?: string };
    expect(typeof parsed.__bridge_error).toBe('string');
  });

  it('reports an empty script as an error, not a blank success', async () => {
    const script = writeScript('empty.jsx', '');
    const run = await runDriver(script);
    const parsed = JSON.parse(resultOf(run)) as { __bridge_error?: string };
    expect(parsed.__bridge_error).toBe('empty script file');
  });

  it('passes the script path through argv without mangling spaces and quotes', async () => {
    // The bug this replaces was shell -e quoting, which corrupted any quote or
    // backslash. A path full of them must still be read back correctly.
    const nasty = join(scriptDir, "a b'c\"d\\e.jsx");
    writeFileSync(nasty, 'app.documents.length', 'utf-8');
    const run = await runDriver(nasty);

    // Reading the file succeeded, so the failure must be about the app, not
    // about the path.
    const parsed = JSON.parse(resultOf(run)) as { __bridge_error?: string };
    expect(parsed.__bridge_error).not.toMatch(/cannot read script file/);
  });
});
