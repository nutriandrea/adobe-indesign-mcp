import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndesignMcpServer } from '../../src/server/IndesignMcpServer.js';
import { ExpressBridgeServer } from '../../src/bridge/ExpressBridgeServer.js';
import { BridgeServer } from '../../src/bridge/BridgeServer.js';
import type { AppConfig } from '../../src/utils/configLoader.js';

vi.mock('../../src/bridge/ExpressBridgeServer.js', () => ({
  ExpressBridgeServer: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getApp: vi.fn(() => ({})),
  })),
}));

vi.mock('../../src/bridge/ScriptExecutor.js', () => ({
  ScriptExecutor: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ success: true, data: null }),
    cancelAll: vi.fn(),
    getStatus: vi.fn().mockReturnValue({}),
  })),
}));

vi.mock('../../src/bridge/BridgeServer.js', () => ({
  BridgeServer: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    events: { on: vi.fn() },
  })),
}));

vi.mock('../../src/bridge/ComScriptExecutor.js', () => ({
  ComScriptExecutor: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({ success: true, data: null }),
    cancelAll: vi.fn(),
    getStatus: vi.fn().mockReturnValue({}),
  })),
}));

const mockConfig: AppConfig = {
  bridge: {
    port: 8120,
    host: '127.0.0.1',
    maxPayload: 1048576,
    timeout: 30000,
  },
  httpBridge: {
    enabled: true,
    port: 18999,
    host: '127.0.0.1',
    token: 'test-token',
  },
  server: {
    name: 'indesign-nutria-mcp',
    version: '1.0.0',
    transport: 'stdio',
  },
  logging: {
    level: 'silent',
  },
  comBridge: {
    enabled: false,
  },
};

describe('IndesignMcpServer Lifecycle', () => {
  beforeEach(() => {
    vi.mocked(ExpressBridgeServer).mockClear();
  });

  it('should create server instance with config', () => {
    const server = new IndesignMcpServer(mockConfig);
    expect(server).toBeInstanceOf(IndesignMcpServer);
  });

  it('should create ExpressBridgeServer on start when httpBridge is enabled', async () => {
    const server = new IndesignMcpServer(mockConfig);
    try { await server.start(); } catch { /* transport may fail in CI */ }
    expect(ExpressBridgeServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 18999,
        host: '127.0.0.1',
        token: 'test-token',
      }),
      expect.any(Object),
    );
  });

  it('should initialize Express bridge without throwing', async () => {
    const server = new IndesignMcpServer(mockConfig);
    // ExpressBridgeServer.start() is mocked so it resolves
    // Stdio transport connect may fail, but that's a separate concern
    await expect(server.start()).resolves.not.toThrow();
  });
});

describe('WebSocket bridge startup', () => {
  /**
   * The bridge is how InDesign is reached in every configuration that uses
   * ScriptExecutor — the UXP plugin, and the macOS JXA proxy. It was gated
   * behind `transport === 'websocket'`, but 'stdio' is the default MCP
   * transport, so the default configuration never opened the bridge: no
   * client could connect and every tool call failed with "Bridge is not
   * connected". MCP transport and the InDesign bridge are independent
   * concerns and must not be coupled.
   */
  it('starts the WebSocket bridge on the default stdio transport', async () => {
    vi.mocked(BridgeServer).mockClear();
    const server = new IndesignMcpServer(mockConfig);
    try {
      await server.start();
    } catch {
      /* stdio transport may fail in CI; the bridge decision is what matters */
    }
    expect(mockConfig.server.transport).toBe('stdio');
    expect(BridgeServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 8120, host: '127.0.0.1' }),
      expect.any(Object),
    );
  });

  it('still starts the bridge when the MCP transport is websocket', async () => {
    vi.mocked(BridgeServer).mockClear();
    const server = new IndesignMcpServer({
      ...mockConfig,
      server: { ...mockConfig.server, transport: 'websocket' },
    });
    try {
      await server.start();
    } catch {
      /* see above */
    }
    expect(BridgeServer).toHaveBeenCalled();
  });

  it('skips the WebSocket bridge when the Windows COM executor is in use', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.mocked(BridgeServer).mockClear();
    try {
      const server = new IndesignMcpServer({
        ...mockConfig,
        comBridge: { enabled: true },
      } as typeof mockConfig);
      try {
        await server.start();
      } catch {
        /* see above */
      }
      // COM talks to InDesign in-process; a WebSocket listener would be dead weight.
      expect(BridgeServer).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});

describe('COM bridge opt-in', () => {
  it('refuses to start with comBridge enabled on non-Windows platforms', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      expect(
        () =>
          new IndesignMcpServer({
            ...mockConfig,
            comBridge: { enabled: true },
          } as typeof mockConfig),
      ).toThrow(/requires Windows/);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('constructs the COM executor when enabled on win32', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const server = new IndesignMcpServer({
        ...mockConfig,
        comBridge: { enabled: true },
      } as typeof mockConfig);
      expect(server).toBeDefined();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});
