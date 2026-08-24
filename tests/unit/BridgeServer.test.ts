import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks (vi.mock factories are hoisted, so variables must use vi.hoisted) ──

const { mockHttpCreateServer, mockHttpServerListen, mockHttpServerClose } = vi.hoisted(
  () => {
    const mockHttpServerListen = vi.fn(
      (_port: number, _host: string, cb: () => void) => cb(),
    );
    const mockHttpServerClose = vi.fn((cb: () => void) => cb());
    const mockHttpCreateServer = vi.fn().mockReturnValue({
      listen: mockHttpServerListen,
      close: mockHttpServerClose,
    });
    return { mockHttpCreateServer, mockHttpServerListen, mockHttpServerClose };
  },
);

const { mockWssOn, mockWebSocketServer } = vi.hoisted(() => {
  const mockWssOn = vi.fn();
  const mockWebSocketServer = vi.fn().mockImplementation(() => ({
    on: mockWssOn,
    close: vi.fn(),
  }));
  return { mockWssOn, mockWebSocketServer };
});

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('http', () => ({
  createServer: (...args: unknown[]) => mockHttpCreateServer(...args),
}));

vi.mock('ws', () => {
  const MockWs = function () {} as unknown as { OPEN: number };
  MockWs.OPEN = 1;
  return {
    WebSocketServer: mockWebSocketServer,
    WebSocket: MockWs,
  };
});

vi.mock('../../src/utils/logger.js', () => ({
  logger: loggerMock,
}));

// ── Test-local helpers ──

interface MockWs {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
}

const mockWsInstances: MockWs[] = [];

function createMockWs(): MockWs {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const mock: MockWs = {
    readyState: 1,
    send: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    emit(event: string, ...args: unknown[]) {
      (listeners.get(event) || []).forEach((h) => h(...args));
    },
  };
  mockWsInstances.push(mock);
  return mock;
}

// ── SUT ──

import { BridgeServer } from '../../src/bridge/BridgeServer.js';
import { ScriptExecutor } from '../../src/bridge/ScriptExecutor.js';

describe('BridgeServer', () => {
  let executor: ScriptExecutor;
  let bridgeServer: BridgeServer;

  const defaultOptions = {
    port: 8120,
    host: '127.0.0.1',
    maxPayload: 1048576,
    timeout: 30000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWsInstances.length = 0;
    executor = new ScriptExecutor(30000);
    bridgeServer = new BridgeServer(defaultOptions, executor);
  });

  afterEach(async () => {
    vi.useRealTimers();
    try {
      await bridgeServer.stop();
    } catch {
      // cleanup
    }
  });

  describe('constructor', () => {
    it('should store options and executor', () => {
      expect(bridgeServer).toBeDefined();
      expect(bridgeServer.connected).toBe(false);
      expect(bridgeServer.connectionCount).toBe(0);
    });
  });

  describe('start', () => {
    it('should create HTTP and WebSocket servers and resolve', async () => {
      await bridgeServer.start();

      expect(mockHttpCreateServer).toHaveBeenCalledTimes(1);
      expect(mockWebSocketServer).toHaveBeenCalledWith({
        server: expect.any(Object),
        maxPayload: defaultOptions.maxPayload,
      });
      expect(mockHttpServerListen).toHaveBeenCalledWith(
        8120,
        '127.0.0.1',
        expect.any(Function),
      );
      expect(mockWssOn).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('connection handling', () => {
    function getConnectionHandler() {
      return mockWssOn.mock.calls.find((c) => c[0] === 'connection')?.[1] as
        | ((ws: MockWs) => void)
        | undefined;
    }

    it('should track connection and send connected message', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      getConnectionHandler()!(ws);

      expect(bridgeServer.connected).toBe(true);
      expect(bridgeServer.connectionCount).toBe(1);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'connected', version: '1.0.0' }),
      );
    });

    it('should forward incoming messages to executor.handleResponse', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      getConnectionHandler()!(ws);

      const responsePayload = { id: 'abc-123', type: 'result' as const, result: 'ok' };
      const messageHandler = ws.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as ((raw: Buffer) => void) | undefined;
      expect(messageHandler).toBeDefined();

      const executorHandleSpy = vi.spyOn(executor, 'handleResponse');
      messageHandler!(Buffer.from(JSON.stringify(responsePayload)));

      expect(executorHandleSpy).toHaveBeenCalledWith(responsePayload);
    });

    it('should handle invalid JSON messages gracefully', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      getConnectionHandler()!(ws);

      const messageHandler = ws.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as ((raw: Buffer) => void) | undefined;

      expect(() => messageHandler!(Buffer.from('invalid json'))).not.toThrow();
    });

    it('should update connected flag on close', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      getConnectionHandler()!(ws);
      expect(bridgeServer.connected).toBe(true);

      const closeHandler = ws.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'close',
      )?.[1] as (() => void) | undefined;
      closeHandler!();

      expect(bridgeServer.connected).toBe(false);
      expect(bridgeServer.connectionCount).toBe(0);
    });

    it('should update connected flag on error and remove connection', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      getConnectionHandler()!(ws);
      expect(bridgeServer.connected).toBe(true);

      const errorHandler = ws.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'error',
      )?.[1] as ((err: Error) => void) | undefined;
      errorHandler!(new Error('connection lost'));

      expect(bridgeServer.connected).toBe(false);
      expect(bridgeServer.connectionCount).toBe(0);
    });

    it('should keep connected=true when at least one connection remains', async () => {
      await bridgeServer.start();
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      getConnectionHandler()!(ws1);
      getConnectionHandler()!(ws2);
      expect(bridgeServer.connected).toBe(true);
      expect(bridgeServer.connectionCount).toBe(2);

      const closeHandler1 = ws1.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'close',
      )?.[1] as (() => void) | undefined;
      closeHandler1!();

      expect(bridgeServer.connected).toBe(true);
      expect(bridgeServer.connectionCount).toBe(1);
    });
  });

  describe('stop', () => {
    it('should close all connections and the server', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      const connectionHandler = mockWssOn.mock.calls.find(
        (c) => c[0] === 'connection',
      )?.[1] as ((ws: MockWs) => void) | undefined;
      connectionHandler!(ws);

      await bridgeServer.stop();

      expect(ws.close).toHaveBeenCalled();
      expect(bridgeServer.connected).toBe(false);
      expect(bridgeServer.connectionCount).toBe(0);
    });

    it('should resolve when already stopped', async () => {
      await expect(bridgeServer.stop()).resolves.toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('should return connected=false and queueDepth=0 by default', () => {
      expect(bridgeServer.getStatus()).toEqual({ connected: false, queueDepth: 0 });
    });

    it('should reflect executor queue depth', () => {
      // Simulate a live plugin so requests stay queued (fast-fail off)
      (bridgeServer as unknown as { _connected: boolean })._connected = true;
      executor.on('request', () => {});
      executor.execute('some code');

      const status = bridgeServer.getStatus();
      expect(status.queueDepth).toBe(1);
      expect(status.connected).toBe(true);
    });

    it('should propagate bridge connection state to executor', async () => {
      await bridgeServer.start();

      const ws = createMockWs();
      const connectionHandler = mockWssOn.mock.calls.find(
        (c) => c[0] === 'connection',
      )?.[1] as ((ws: MockWs) => void) | undefined;
      connectionHandler!(ws);
      expect(executor.getStatus().connected).toBe(true);

      ws.emit('close', 1000, Buffer.from(''));
      expect(executor.getStatus().connected).toBe(false);
    });
  });

  describe('health checks', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should ping active connections on health check interval', async () => {
      const server = new BridgeServer(
        { ...defaultOptions, healthCheckIntervalMs: 1000 },
        executor,
      );
      await server.start();

      const ws = createMockWs();
      const connectionHandler = mockWssOn.mock.calls.find(
        (c) => c[0] === 'connection',
      )?.[1] as ((ws: MockWs) => void) | undefined;
      connectionHandler!(ws);

      vi.advanceTimersByTime(1500);

      expect(ws.ping).toHaveBeenCalled();

      await server.stop();
    });

    it('should close stale connections with no activity', async () => {
      const server = new BridgeServer(
        { ...defaultOptions, healthCheckIntervalMs: 500, staleTimeoutMs: 1000 },
        executor,
      );
      await server.start();

      const ws = createMockWs();
      const connectionHandler = mockWssOn.mock.calls.find(
        (c) => c[0] === 'connection',
      )?.[1] as ((ws: MockWs) => void) | undefined;
      connectionHandler!(ws);

      vi.advanceTimersByTime(2000);

      expect(ws.close).toHaveBeenCalledWith(
        4001,
        'Connection stale - no activity detected',
      );

      await server.stop();
    });
  });

  describe('executor event forwarding', () => {
    it('should broadcast request events to connected clients', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      const connectionHandler = mockWssOn.mock.calls.find(
        (c) => c[0] === 'connection',
      )?.[1] as ((ws: MockWs) => void) | undefined;
      connectionHandler!(ws);

      executor.on('request', () => {});
      executor.execute('app.documents.add();');

      expect(ws.send).toHaveBeenCalled();
      const sentCall = ws.send.mock.calls[1] as [string];
      const sentData = JSON.parse(sentCall[0]);
      expect(sentData).toHaveProperty('id');
      expect(sentData).toHaveProperty('code');
      expect(sentData.code).toContain('app.documents.add();');
    });

    it('should not send to closed connections', async () => {
      await bridgeServer.start();
      const ws = createMockWs();
      ws.readyState = 3; // CLOSED
      const connectionHandler = mockWssOn.mock.calls.find(
        (c) => c[0] === 'connection',
      )?.[1] as ((ws: MockWs) => void) | undefined;
      connectionHandler!(ws);

      executor.on('request', () => {});
      executor.execute('some code');

      expect(ws.send).toHaveBeenCalledTimes(1); // only connected message
    });
  });

describe('fast-fail when disconnected', () => {
  it('should reject requests immediately when no bridge client is connected', async () => {
    vi.useFakeTimers();
    await bridgeServer.start();

    // Short timeout so RED fails fast with a clear message mismatch;
    // GREEN must reject well before any timer fires.
    const p = executor.execute('app.documents.length;', 100);
    const expectation = expect(p).rejects.toThrow(/not connected/i);

    await vi.advanceTimersByTimeAsync(200);
    await expectation;
  });

  it('should still deliver requests once a client has connected', async () => {
    vi.useFakeTimers();
    await bridgeServer.start();

    const ws = createMockWs();
    const connectionHandler = mockWssOn.mock.calls.find(
      (c) => c[0] === 'connection',
    )?.[1] as ((ws: MockWs) => void) | undefined;
    connectionHandler!(ws);

    const p = executor.execute('1 + 1;');
    await vi.advanceTimersByTimeAsync(0);
    // calls[0] is the 'connected' greeting; the routed request follows
    expect(ws.send).toHaveBeenCalledTimes(2);

    const sent = JSON.parse(ws.send.mock.calls[1][0] as string);
    executor.handleResponse({ id: sent.id, type: 'result', result: '2' });
    await expect(p).resolves.toEqual({ id: sent.id, type: 'result', result: '2' });
  });
});
});
