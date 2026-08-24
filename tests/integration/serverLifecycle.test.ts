import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndesignMcpServer } from '../../src/server/IndesignMcpServer.js';
import { ExpressBridgeServer } from '../../src/bridge/ExpressBridgeServer.js';
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
