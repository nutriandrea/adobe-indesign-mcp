import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { ComScriptExecutor } from '../../src/bridge/ComScriptExecutor.js';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockUnlinkSync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ spawn: mockSpawn }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, writeFileSync: mockWriteFileSync, unlinkSync: mockUnlinkSync };
});

class FakeChild extends EventEmitter {
  stdin = { write: vi.fn(), end: vi.fn() };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
  pid = 4242;
  exitCode: number | null = null; // null = still running, like real ChildProcess
}

describe('ComScriptExecutor', () => {
  let child: FakeChild;
  let executor: ComScriptExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    child = new FakeChild();
    mockSpawn.mockReturnValue(child);
    executor = new ComScriptExecutor(1000);
  });

  afterEach(async () => {
    await executor.stop();
    vi.useRealTimers();
  });

  function lastTempFileContent(): string {
    expect(mockWriteFileSync).toHaveBeenCalled();
    const [path, content] = mockWriteFileSync.mock.calls.at(-1);
    expect(String(path)).toMatch(/\.jsx$/);
    return content as string;
  }

  it('starts the persistent cscript process lazily on first execute', async () => {
    const p = executor.execute('1 + 1;');
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('cscript');
    expect(args.join(' ')).toContain('.vbs');
    expect(args.join(' ')).toContain('//nologo');

    child.stdout.emit('data', Buffer.from(`{"ok":true}\n`));
    await p;
    expect(child.stdin.write).toHaveBeenCalledTimes(1);
  });

  it('writes NEVER_INTERACT + wrapped code to a temp file and sends its path on stdin', async () => {
    const p = executor.execute('app.documents.length;');
    const content = lastTempFileContent();
    expect(content).toContain('userInteractionLevel');
    expect(content).toContain('// JSON polyfill for ExtendScript');
    expect(content).toContain('app.documents.length;');

    const sentLine = (child.stdin.write.mock.calls[0][0] as string).trim();
    expect(mockWriteFileSync.mock.calls[0][0]).toBe(sentLine);

    child.stdout.emit('data', Buffer.from('"7"\n'));
    const res = await p;
    expect(res.type).toBe('result');
    expect(res.result).toBe('"7"');
  });

  it('resolves pending requests FIFO from stdout lines with the client-side id', async () => {
    const p1 = executor.execute('first;');
    const p2 = executor.execute('second;');
    child.stdout.emit('data', Buffer.from('"one"\n"two"\n'));

    const [r1, r2] = await Promise.all([p1, p2]);
    // ids are generated client-side (the VBS does not echo them) and must be
    // unique per request while results keep stdin submission order
    expect(typeof r1.id).toBe('string');
    expect(r1.id).not.toBe(r2.id);
    expect(r1.result).toBe('"one"');
    expect(r2.result).toBe('"two"');
  });

  it('rejects with InDesignError when the bridge answers "ERROR: ..."', async () => {
    const p = executor.execute('boom;');
    child.stdout.emit('data', Buffer.from('ERROR: Object required\n'));
    await expect(p).rejects.toMatchObject({
      name: 'InDesignError',
      code: 'BRIDGE_ERROR',
      message: expect.stringContaining('Object required'),
    });
  });

  it('rejects queued requests when the cscript process exits unexpectedly', async () => {
    const p = executor.execute('x;');
    child.emit('close', 1, null);
    await expect(p).rejects.toMatchObject({ code: 'COM_PROCESS_EXIT' });
    expect(executor.getStatus().connected).toBe(false);
  });

  it('times out like the UXP path', async () => {
    vi.useFakeTimers();
    const p = executor.execute('slow;', 50);
    const expectation = expect(p).rejects.toMatchObject({ code: 'EXECUTION_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(60);
    await expectation;
  });

  it('reports connected while the process is alive and cleans temp files on stop', async () => {
    const p = executor.execute('y;');
    child.stdout.emit('data', Buffer.from('"ok"\n'));
    await p;
    expect(executor.getStatus().connected).toBe(true);

    const tempPath = mockWriteFileSync.mock.calls[0][0];
    await executor.stop();
    expect(child.kill).toHaveBeenCalled();
    expect(mockUnlinkSync).toHaveBeenCalledWith(tempPath);
  });
});
