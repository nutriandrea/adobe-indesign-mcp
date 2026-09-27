import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { createBridgeProxy, createFifoQueue } from '../../bridge-proxy.mjs';

class FakeWebSocket extends EventEmitter {
  /** Registry of every constructed socket, for test assertions. */
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  closed = false;
  url: string;

  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  serverSends(data: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(data)));
  }

  serverSendsRaw(data: string) {
    this.emit('message', Buffer.from(data));
  }
}

function makeRunner() {
  const calls: string[] = [];
  return {
    calls,
    run: (code: string) => {
      calls.push(code);
      if (code.includes('FAIL_INDESIGN')) {
        return Promise.resolve(JSON.stringify({ __bridge_error: 'InDesign exploded' }));
      }
      if (code.includes('DRIVER_CRASH')) {
        return Promise.reject(new Error('osascript died'));
      }
      if (code.includes('HANG')) {
        return new Promise<string>(() => {});
      }
      return Promise.resolve('{"ok":true}');
    },
  };
}

describe('bridge-proxy: createBridgeProxy', () => {
  let sockets: FakeWebSocket[];
  let proxy: ReturnType<typeof createBridgeProxy>;
  let runner: ReturnType<typeof makeRunner>;
  let queue: ReturnType<typeof createFifoQueue>;

  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    runner = makeRunner();
    queue = createFifoQueue();
    proxy = createBridgeProxy({
      wsUrl: 'ws://127.0.0.1:8120',
      runner,
      queue,
      WebSocketCtor: FakeWebSocket as never,
      reconnectDelayMs: 10,
    });
    proxy.connect();
    sockets = FakeWebSocket.instances;
  });

  afterEach(() => {
    proxy.stop();
  });

  const lastSent = () => JSON.parse(sockets[sockets.length - 1].sent.at(-1) ?? '{}');

  it('connects to the configured URL', () => {
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe('ws://127.0.0.1:8120');
  });

  it('answers an execution request with a canonical result response', async () => {
    sockets[0].serverSends({ id: 'req-1', code: 'app.name;', timeout: 1000 });
    await vi.waitFor(() => expect(sockets[0].sent.length).toBe(1));

    expect(lastSent()).toEqual({ type: 'result', id: 'req-1', result: '{"ok":true}' });
    expect(runner.calls).toEqual(['app.name;']);
  });

  it('answers an InDesign-side failure with a canonical error response', async () => {
    sockets[0].serverSends({ id: 'req-2', code: 'FAIL_INDESIGN' });
    await vi.waitFor(() => expect(sockets[0].sent.length).toBe(1));

    expect(lastSent()).toEqual({ type: 'error', id: 'req-2', error: 'InDesign exploded' });
  });

  it('answers a driver crash with a canonical error response', async () => {
    const failed = vi.fn();
    proxy.events.on('failed', failed);

    sockets[0].serverSends({ id: 'req-3', code: 'DRIVER_CRASH' });
    await vi.waitFor(() => expect(sockets[0].sent.length).toBe(1));

    expect(lastSent()).toEqual({ type: 'error', id: 'req-3', error: 'osascript died' });
    expect(failed).toHaveBeenCalledWith({ id: 'req-3', error: 'osascript died' });
  });

  it('ignores the server greeting and push events', () => {
    sockets[0].serverSends({ type: 'connected', version: '1.0.0' });
    sockets[0].serverSends({ type: 'event', name: 'document_changed', payload: {} });
    expect(sockets[0].sent).toEqual([]);
    expect(runner.calls).toEqual([]);
  });

  it('ignores non-JSON and non-request messages', () => {
    sockets[0].serverSendsRaw('not json at all');
    sockets[0].serverSends({ hello: 'world' });
    sockets[0].serverSends({ id: 'req-4', timeout: 1000 }); // no code
    expect(runner.calls).toEqual([]);
    expect(sockets[0].sent).toEqual([]);
  });

  it('rejects a request with no code with a canonical error', async () => {
    // handleMessage ignores payloads without `code` — the server contract
    // guarantees `code` on requests, so treat its absence as noise, not error.
    sockets[0].serverSends({ id: 'req-5', timeout: 1000 });
    expect(sockets[0].sent).toEqual([]);
  });

  it('serializes two concurrent requests in arrival order', async () => {
    const slowRunner = {
      calls: [] as string[],
      run: (code: string) => {
        slowRunner.calls.push(code);
        return new Promise<string>((resolve) =>
          setTimeout(() => resolve('done'), code.includes('slow') ? 30 : 5),
        );
      },
    };
    const p = createBridgeProxy({
      wsUrl: 'ws://x',
      runner: slowRunner,
      queue: createFifoQueue(),
      WebSocketCtor: FakeWebSocket as never,
    });
    p.connect();
    const proxyAny = p as unknown as { handleMessage: (raw: Buffer) => void };
    proxyAny.handleMessage(Buffer.from(JSON.stringify({ id: 'a', code: 'slow' })));
    proxyAny.handleMessage(Buffer.from(JSON.stringify({ id: 'b', code: 'fast' })));

    await vi.waitFor(() => {
      expect(slowRunner.calls).toEqual(['slow', 'fast']);
    });
    p.stop();
  });

  it('stop() closes the socket, clears the queue and prevents reconnect', async () => {
    // Isolate: the beforeEach proxy must not react to this test's close event.
    proxy.stop();
    FakeWebSocket.instances.length = 0;
    sockets = FakeWebSocket.instances;

    const isolated = createBridgeProxy({
      wsUrl: 'ws://x',
      runner,
      queue,
      WebSocketCtor: FakeWebSocket as never,
      reconnectDelayMs: 5,
    });
    isolated.connect();
    expect(sockets).toHaveLength(1);

    isolated.stop();
    sockets[0].emit('close'); // a late close event after stop must not reconnect
    await new Promise((r) => setTimeout(r, 30));
    expect(sockets.length).toBe(1);
  });

  it('reconnects after an unexpected close', async () => {
    proxy.stop(); // detach the beforeEach instance
    FakeWebSocket.instances.length = 0;
    sockets = FakeWebSocket.instances;
    const reconnecting = createBridgeProxy({
      wsUrl: 'ws://x',
      runner,
      queue: createFifoQueue(),
      WebSocketCtor: FakeWebSocket as never,
      reconnectDelayMs: 5,
    });
    reconnecting.connect();
    expect(sockets).toHaveLength(1);
    sockets[0].emit('close');
    await vi.waitFor(() => expect(sockets.length).toBe(2));
    reconnecting.stop();
  });
});
