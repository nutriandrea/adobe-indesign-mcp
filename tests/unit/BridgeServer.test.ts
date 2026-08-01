import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──

const { mockWsInstances, mockWebSocketCtor } = vi.hoisted(() => {
  const mockWsInstances: Array<{
    url: string;
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: unknown[]) => void;
  }> = [];

  const mockWebSocketCtor = vi.fn().mockImplementation(function (this: {
    url: string;
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: unknown[]) => void;
  }, url: string) {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    this.url = url;
    this.readyState = 0; // CONNECTING — flips to OPEN on the 'open' event
    this.send = vi.fn();
    this.close = vi.fn();
    this.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    });
    this.emit = (event: string, ...args: unknown[]) => {
      if (event === 'open') this.readyState = 1;
      if (event === 'close') this.readyState = 3;
      (listeners.get(event) || []).forEach((h) => h(...args));
    };
    mockWsInstances.push(this);
  });

  return { mockWsInstances, mockWebSocketCtor };
});

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('ws', () => {
  const MockWs = mockWebSocketCtor as unknown as {
    OPEN: number;
  };
  MockWs.OPEN = 1;
  return { WebSocket: MockWs };
});

vi.mock('../../src/utils/logger.js', () => ({
  logger: loggerMock,
}));

// ── SUT ──

import { BridgeServer } from '../../src/bridge/BridgeServer.js';
import { ScriptExecutor } from '../../src/bridge/ScriptExecutor.js';

describe('BridgeServer (client mode)', () => {
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
    vi.useFakeTimers();
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
    it('should store options and executor, start disconnected', () => {
      expect(bridgeServer).toBeDefined();
      expect(bridgeServer.connected).toBe(false);
      expect(bridgeServer.connectionCount).toBe(0);
    });
  });

  describe('start', () => {
    it('should connect to the bridge URL as a WebSocket CLIENT (no port binding)', async () => {
      await bridgeServer.start();

      expect(mockWebSocketCtor).toHaveBeenCalledTimes(1);
      expect(mockWsInstances[0].url).toBe('ws://127.0.0.1:8120');
      expect(bridgeServer.connected).toBe(false); // not open yet
    });

    it('should set connected=true when the socket opens', async () => {
      await bridgeServer.start();
      mockWsInstances[0].emit('open');
      expect(bridgeServer.connected).toBe(true);
      expect(bridgeServer.connectionCount).toBe(1);
    });
  });

  describe('message handling', () => {
    it('should forward bridge responses to executor.handleResponse', async () => {
      const spy = vi.spyOn(executor, 'handleResponse');
      await bridgeServer.start();
      mockWsInstances[0].emit('open');

      mockWsInstances[0].emit('message', JSON.stringify({ id: 'abc', type: 'result', result: '{}' }));

      expect(spy).toHaveBeenCalledWith({ id: 'abc', type: 'result', result: '{}' });
    });

    it('should ignore invalid JSON messages gracefully', async () => {
      const spy = vi.spyOn(executor, 'handleResponse');
      await bridgeServer.start();
      mockWsInstances[0].emit('open');

      mockWsInstances[0].emit('message', 'not json {{{');

      expect(spy).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('executor event forwarding', () => {
    it('should send executor request events to the bridge when connected', async () => {
      await bridgeServer.start();
      mockWsInstances[0].emit('open');

      executor.execute('var x = 1;');
      const sent = mockWsInstances[0].send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string));
      expect(sent.length).toBe(1);
      expect(sent[0]).toMatchObject({ code: expect.stringContaining('var x = 1;') });
      expect(sent[0].id).toBeTruthy();
    });

    it('should reject with a clear error when the bridge is not connected', async () => {
      // start() but never emit 'open' → not connected
      await bridgeServer.start();

      await expect(executor.execute('var x = 1;')).rejects.toThrow(/Bridge is not connected/i);
    });
  });

  describe('connection lifecycle', () => {
    it('should update connected flag and schedule reconnect on close', async () => {
      await bridgeServer.start();
      mockWsInstances[0].emit('open');
      expect(bridgeServer.connected).toBe(true);

      mockWsInstances[0].emit('close');
      expect(bridgeServer.connected).toBe(false);
      expect(bridgeServer.connectionCount).toBe(0);

      // Reconnect should be scheduled (fake timers)
      vi.advanceTimersByTime(3000);
      expect(mockWebSocketCtor).toHaveBeenCalledTimes(2);
    });

    it('should not reconnect after stop()', async () => {
      await bridgeServer.start();
      mockWsInstances[0].emit('open');
      await bridgeServer.stop();

      mockWsInstances[0].emit('close');
      vi.advanceTimersByTime(30000);
      expect(mockWebSocketCtor).toHaveBeenCalledTimes(1);
    });

    it('should close the socket on stop()', async () => {
      await bridgeServer.start();
      mockWsInstances[0].emit('open');
      await bridgeServer.stop();

      expect(mockWsInstances[0].close).toHaveBeenCalled();
      expect(bridgeServer.connected).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should reflect executor queue depth', async () => {
      await bridgeServer.start();
      mockWsInstances[0].emit('open');

      const status = bridgeServer.getStatus();
      expect(status).toHaveProperty('connected', true);
      expect(status).toHaveProperty('queueDepth');
    });
  });
});
