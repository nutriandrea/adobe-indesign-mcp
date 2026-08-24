import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';

// ── Hoisted mocks ──

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── SUT ──

import { loadConfig } from '../../src/utils/configLoader.js';

describe('configLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should return defaults when no config path provided and default file missing', () => {
      mockExistsSync.mockReturnValue(false);

      const config = loadConfig();

      expect(config).toEqual({
        bridge: { port: 8120, host: '127.0.0.1', maxPayload: 1048576, timeout: 30000 },
        httpBridge: { enabled: false, port: 3000, host: '127.0.0.1', token: '' },
        server: { transport: 'stdio', name: 'indesign-nutria-mcp', version: '1.0.0' },
        logging: { level: 'info' },
      });
    });

    it('should load and validate config from provided path', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          bridge: { port: 9000, timeout: 60000 },
          logging: { level: 'debug' },
        }),
      );

      const config = loadConfig('/custom/path/config.json');

      expect(config.bridge.port).toBe(9000);
      expect(config.bridge.timeout).toBe(60000);
      expect(config.logging.level).toBe('debug');
      // Defaults for unspecified fields
      expect(config.bridge.host).toBe('127.0.0.1');
      expect(config.server.transport).toBe('stdio');
    });

    it('should try indesign-nutria-mcp.json when no path and default exists', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('indesign-nutria-mcp.json');
      });
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          bridge: { host: '0.0.0.0' },
          httpBridge: { enabled: true, token: 'abc123' },
        }),
      );

      const config = loadConfig();

      expect(config.bridge.host).toBe('0.0.0.0');
      expect(config.httpBridge.enabled).toBe(true);
      expect(config.httpBridge.token).toBe('abc123');
      expect(config.httpBridge.port).toBe(3000); // default
    });

    it('should fall back to defaults when config file is invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json');

      const config = loadConfig('/bad/config.json');

      // Falls back to defaults on parse error
      expect(config.bridge.port).toBe(8120);
      expect(config.logging.level).toBe('info');
    });

    it('should fall back to defaults when config fails Zod validation', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ bridge: { port: 'not-a-number' } }),
      );

      const config = loadConfig('/invalid/config.json');

      expect(config.bridge.port).toBe(8120); // default
    });

    it('should handle all bridge config overrides', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          bridge: { port: 9090, host: '0.0.0.0', maxPayload: 2097152, timeout: 120000 },
        }),
      );

      const config = loadConfig('/full/config.json');

      expect(config.bridge).toEqual({
        port: 9090,
        host: '0.0.0.0',
        maxPayload: 2097152,
        timeout: 120000,
      });
    });

    it('should handle server config overrides', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          server: { transport: 'websocket', name: 'custom', version: '2.0.0' },
        }),
      );

      const config = loadConfig('/server/config.json');

      expect(config.server).toEqual({
        transport: 'websocket',
        name: 'custom',
        version: '2.0.0',
      });
    });

    it('should reject invalid transport value', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ server: { transport: 'invalid' } }),
      );

      const config = loadConfig('/bad-transport.json');

      // Falls back to defaults due to Zod validation failure
      expect(config.server.transport).toBe('stdio');
    });

    it('should reject invalid logging level', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ logging: { level: 'trace' } }),
      );

      const config = loadConfig('/bad-log-level.json');

      expect(config.logging.level).toBe('info'); // default
    });

    it('should call existsSync with resolved absolute path', () => {
      const absolutePath = resolve('/resolved/path.json');
      mockExistsSync.mockReturnValue(false);

      loadConfig('/resolved/path.json');

      expect(mockExistsSync).toHaveBeenCalledWith(absolutePath);
    });
  });
});

describe('configLoader — environment variable support', () => {
  const ENV_KEYS = [
    'BRIDGE_PORT', 'BRIDGE_HOST', 'BRIDGE_MAX_PAYLOAD', 'BRIDGE_TIMEOUT',
    'HTTP_BRIDGE_ENABLED', 'HTTP_BRIDGE_PORT', 'HTTP_BRIDGE_HOST', 'BRIDGE_TOKEN',
    'SERVER_TRANSPORT', 'SERVER_NAME', 'SERVER_VERSION',
    'LOG_LEVEL', 'LOG_LEVEL_OVERRIDE',
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('applies BRIDGE_* env vars over defaults', () => {
    process.env.BRIDGE_PORT = '9999';
    process.env.BRIDGE_HOST = '0.0.0.0';
    process.env.BRIDGE_TIMEOUT = '45000';
    process.env.BRIDGE_MAX_PAYLOAD = '2097152';

    const config = loadConfig();
    expect(config.bridge.port).toBe(9999);
    expect(config.bridge.host).toBe('0.0.0.0');
    expect(config.bridge.timeout).toBe(45000);
    expect(config.bridge.maxPayload).toBe(2097152);
  });

  it('env overrides values coming from the JSON config file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ bridge: { port: 9000 } }));
    process.env.BRIDGE_PORT = '7777';

    const config = loadConfig('/tmp/whatever.json');
    expect(config.bridge.port).toBe(7777);
  });

  it('parses HTTP_BRIDGE_ENABLED as boolean and BRIDGE_TOKEN as string', () => {
    process.env.HTTP_BRIDGE_ENABLED = 'true';
    process.env.HTTP_BRIDGE_PORT = '4000';
    process.env.BRIDGE_TOKEN = 's3cret';

    const config = loadConfig();
    expect(config.httpBridge.enabled).toBe(true);
    expect(config.httpBridge.port).toBe(4000);
    expect(config.httpBridge.token).toBe('s3cret');
  });

  it('parses SERVER_* and LOG_LEVEL env vars', () => {
    process.env.SERVER_TRANSPORT = 'websocket';
    process.env.SERVER_NAME = 'custom-mcp';
    process.env.LOG_LEVEL = 'debug';

    const config = loadConfig();
    expect(config.server.transport).toBe('websocket');
    expect(config.server.name).toBe('custom-mcp');
    expect(config.logging.level).toBe('debug');
  });

  it('ignores invalid env values instead of crashing', () => {
    process.env.BRIDGE_PORT = 'not-a-number';
    process.env.SERVER_TRANSPORT = 'carrier-pigeon';
    process.env.HTTP_BRIDGE_ENABLED = 'maybe';

    const config = loadConfig();
    expect(config.bridge.port).toBe(8120);
    expect(config.server.transport).toBe('stdio');
    expect(config.httpBridge.enabled).toBe(false);
  });

  it('treats empty strings as unset', () => {
    process.env.BRIDGE_PORT = '';
    process.env.BRIDGE_TOKEN = '';

    const config = loadConfig();
    expect(config.bridge.port).toBe(8120);
    expect(config.httpBridge.token).toBe('');
  });
});
