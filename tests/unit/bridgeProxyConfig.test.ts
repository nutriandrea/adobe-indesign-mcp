import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../bridge-proxy.mjs';

describe('bridge-proxy: loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const config = loadConfig({});
    expect(config).toEqual({
      appName: 'Adobe InDesign 2026',
      wsUrl: 'ws://127.0.0.1:8120',
      timeoutMs: 120_000,
      reconnectDelayMs: 3_000,
    });
  });

  it('reads INDESIGN_APP, BRIDGE_WS_URL and BRIDGE_TIMEOUT_MS', () => {
    const config = loadConfig({
      INDESIGN_APP: 'Adobe InDesign 2025',
      BRIDGE_WS_URL: 'ws://10.0.0.2:9000',
      BRIDGE_TIMEOUT_MS: '45000',
    });
    expect(config.appName).toBe('Adobe InDesign 2025');
    expect(config.wsUrl).toBe('ws://10.0.0.2:9000');
    expect(config.timeoutMs).toBe(45_000);
  });

  it('falls back to defaults on malformed numeric values', () => {
    const config = loadConfig({ BRIDGE_TIMEOUT_MS: 'not-a-number' });
    expect(config.timeoutMs).toBe(120_000);
  });
});
