import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScriptExecutor } from '../../src/bridge/ScriptExecutor.js';

describe('ScriptExecutor', () => {
  let executor: ScriptExecutor;

  beforeEach(() => {
    executor = new ScriptExecutor(10000);
  });

  afterEach(() => {
    executor.cancelAll();
    vi.useRealTimers();
  });

  it('should emit request with id and code on execute', () => {
    const onRequest = vi.fn();
    executor.on('request', onRequest);

    executor.execute('app.documents.add();', 5000);

    expect(onRequest).toHaveBeenCalledTimes(1);
    const req = onRequest.mock.calls[0][0];
    // Code is wrapped with JSON_POLYFILL + EXTENDSCRIPT_HELPERS, so check it contains the original
    expect(req.code).toContain('app.documents.add();');
    expect(req.timeout).toBe(5000);
    expect(typeof req.id).toBe('string');
    expect(req.id.length).toBeGreaterThan(0);

    executor.handleResponse({ id: req.id, type: 'result', result: '' });
  });

  it('should resolve when handleResponse is called with matching id', async () => {
    let requestId = '';
    executor.on('request', (req) => {
      requestId = req.id;
      setTimeout(() => {
        executor.handleResponse({ id: req.id, type: 'result', result: 'doc.indd' });
      }, 0);
    });

    const result = await executor.execute('app.activeDocument.name;');
    expect(result).toEqual({ id: requestId, type: 'result', result: 'doc.indd' });
  });

  it('should reject when handleResponse is called with error type', async () => {
    executor.on('request', (req) => {
      setTimeout(() => {
        executor.handleResponse({ id: req.id, type: 'error', error: 'bad code' });
      }, 0);
    });

    await expect(executor.execute('bad code')).rejects.toThrow('bad code');
  });

  it('should reject on timeout', async () => {
    vi.useFakeTimers();
    executor = new ScriptExecutor(5000);

    executor.on('request', () => {});

    const promise = executor.execute('slowScript()');
    vi.advanceTimersByTime(6000);

    await expect(promise).rejects.toThrow('Script execution timed out');
  });

  it('should sanitize dangerous code', async () => {
    executor.on('request', (req) => {
      expect(req.code).toContain('/* blocked */');
      expect(req.code).not.toContain('require("fs")');
      setTimeout(() => {
        executor.handleResponse({ id: req.id, type: 'result', result: '' });
      }, 0);
    });

    await executor.execute('require("fs")');
  });

  it('should report status with queue depth', () => {
    const status = executor.getStatus();
    expect(status).toHaveProperty('connected');
    expect(status).toHaveProperty('queueDepth');
    expect(status.queueDepth).toBe(0);
  });

  it('should report connected=false by default, not tied to pending queue', () => {
    expect(executor.getStatus().connected).toBe(false);
  });

  it('should reflect connection state set via setConnected', () => {
    executor.setConnected(true);
    expect(executor.getStatus().connected).toBe(true);

    executor.setConnected(false);
    expect(executor.getStatus().connected).toBe(false);
  });

  it('should keep connected independent from pending queue depth', async () => {
    executor.setConnected(true);
    const p = executor.execute('code');
    expect(executor.getStatus()).toEqual({ connected: true, queueDepth: 1 });
    executor.cancelAll();
    await expect(p).rejects.toThrow('Execution cancelled');
    expect(executor.getStatus()).toEqual({ connected: true, queueDepth: 0 });
  });

  it('should cancel all pending executions', async () => {
    const p1 = executor.execute('code1');
    const p2 = executor.execute('code2');

    expect(executor.getStatus().queueDepth).toBe(2);

    executor.cancelAll();
    expect(executor.getStatus().queueDepth).toBe(0);

    await expect(p1).rejects.toThrow('Execution cancelled');
    await expect(p2).rejects.toThrow('Execution cancelled');
  });
});
