import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { loadConfig } from '../../src/utils/configLoader';

/**
 * The config that ships in the repo is what most users get by passing
 * `--config indesign-nutria-mcp.json`, so it must start on every platform.
 */
const SHIPPED_CONFIG = fileURLToPath(
  new URL('../../indesign-nutria-mcp.json', import.meta.url),
);
const raw = JSON.parse(readFileSync(SHIPPED_CONFIG, 'utf-8')) as Record<string, unknown>;

describe('shipped indesign-nutria-mcp.json', () => {
  it('parses through the real config loader', () => {
    expect(() => loadConfig(SHIPPED_CONFIG)).not.toThrow();
  });

  it('uses the stdio transport the server actually speaks', () => {
    // The MCP protocol runs over stdio; port 8120 is the InDesign bridge,
    // which is configured separately under "bridge".
    expect((raw.server as { transport: string }).transport).toBe('stdio');
  });

  it('does not enable the Windows COM bridge (it aborts startup elsewhere)', () => {
    // comBridge.enabled defaults to false and InDesignMcpServer throws on any
    // non-Windows platform when it is on, so shipping it enabled would make
    // this config unusable on macOS and Linux.
    const comBridge = raw.comBridge as { enabled?: boolean } | undefined;
    expect(comBridge?.enabled ?? false).toBe(false);
  });

  it('keeps the bridge on loopback with a bounded payload', () => {
    const bridge = raw.bridge as { host: string; port: number; maxPayload: number };
    expect(bridge.host).toBe('127.0.0.1');
    expect(bridge.port).toBe(8120);
    expect(bridge.maxPayload).toBeGreaterThan(0);
  });

  it('does not ship a token in the disabled http bridge', () => {
    const httpBridge = raw.httpBridge as { enabled: boolean; token: string };
    // An empty token is the documented "disabled" sentinel; a real value here
    // would be a committed secret.
    expect(httpBridge.enabled).toBe(false);
    expect(httpBridge.token).toBe('');
  });
});
