import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createJxaRunner } from '../../bridge-proxy.mjs';

describe('bridge-proxy: createJxaRunner', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'runner-test-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes the script to a temp file, passes it to the driver, then removes it', async () => {
    const seen: {
      cmd?: string;
      args?: string[];
      contentAtCall?: string;
      fileExistedAtCall: boolean;
    }[] = [];
    const runner = createJxaRunner({
      appName: 'Adobe InDesign 2026',
      timeoutMs: 1_000,
      tmpRoot,
      execFileFn: ((cmd: string, args: string[], _opts: unknown, cb: Function) => {
        const scriptFile = args[3] as string;
        seen.push({
          cmd,
          args,
          contentAtCall: existsSync(scriptFile) ? readFileSync(scriptFile, 'utf-8') : undefined,
          fileExistedAtCall: existsSync(scriptFile),
        });
        cb(null, '42\n');
      }) as never,
    });

    const out = await runner.run('app.name;');
    expect(out).toBe('42');

    expect(seen).toHaveLength(1);
    expect(seen[0].cmd).toBe('osascript');
    // No shell involved: args are passed directly to execFile.
    expect(seen[0].args?.slice(0, 2)).toEqual(['-l', 'JavaScript']);
    expect(seen[0].args?.[2]).toMatch(/jxa-driver\.js$/);
    expect(seen[0].args?.[4]).toBe('Adobe InDesign 2026');
    // The script file existed at call time, with the script as its content...
    expect(seen[0].fileExistedAtCall).toBe(true);
    expect(seen[0].contentAtCall).toContain('app.name;');
    // ...and is removed after the call.
    const scriptFile = seen[0].args?.[3] as string;
    expect(scriptFile.startsWith(tmpRoot)).toBe(true);
    expect(scriptFile.endsWith('.jsx')).toBe(true);
    expect(existsSync(scriptFile)).toBe(false);
  });

  it('never places script content on the command line', async () => {
    const marker = 'SECRET_SCRIPT_MARKER_QUOTING_RISK';
    const calls: string[][] = [];
    const runner = createJxaRunner({
      tmpRoot,
      execFileFn: ((_cmd: string, args: string[], _o: unknown, cb: Function) => {
        calls.push(args);
        cb(null, 'ok');
      }) as never,
    });

    await runner.run(`var s = "${marker}"; s;`);

    const commandLine = calls[0].join(' ');
    expect(commandLine).not.toContain(marker);
  });

  it('trims a single trailing newline from the driver output', async () => {
    const runner = createJxaRunner({
      tmpRoot,
      execFileFn: ((_c: string, _a: string[], _o: unknown, cb: Function) => cb(null, 'x\n')) as never,
    });
    expect(await runner.run('code')).toBe('x');
  });

  it('propagates stderr from the driver as the error message', async () => {
    const runner = createJxaRunner({
      tmpRoot,
      execFileFn: ((_c: string, _a: string[], _o: unknown, cb: Function) =>
        cb({ message: 'spawn failure', stderr: 'osascript: can\'t go there' }, '')) as never,
    });
    await expect(runner.run('code')).rejects.toThrow("osascript: can't go there");
  });

  it('falls back to err.message when stderr is absent', async () => {
    const runner = createJxaRunner({
      tmpRoot,
      execFileFn: ((_c: string, _a: string[], _o: unknown, cb: Function) =>
        cb({ message: 'spawn failure' }, '')) as never,
    });
    await expect(runner.run('code')).rejects.toThrow('spawn failure');
  });

  it('rejects empty or non-string code without spawning', async () => {
    let spawned = 0;
    const runner = createJxaRunner({
      tmpRoot,
      execFileFn: ((_c: string, _a: string[], _o: unknown, cb: Function) => {
        spawned += 1;
        cb(null, '');
      }) as never,
    });
    await expect(runner.run('')).rejects.toThrow('empty script');
    await expect(runner.run(undefined as unknown as string)).rejects.toThrow('empty script');
    expect(spawned).toBe(0);
  });

  it('removes the temp root on cleanup', async () => {
    const runner = createJxaRunner({
      tmpRoot,
      execFileFn: ((_c: string, _a: string[], _o: unknown, cb: Function) => cb(null, '')) as never,
    });
    await runner.run('code');
    expect(existsSync(tmpRoot)).toBe(true);
    runner.cleanup();
    expect(existsSync(tmpRoot)).toBe(false);
    // Idempotent: a second cleanup must not throw on the missing dir.
    expect(() => runner.cleanup()).not.toThrow();
  });
});
