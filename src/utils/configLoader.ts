import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const configSchema = z.object({
  bridge: z
    .object({
      port: z.number().int().positive().default(8120),
      host: z.string().default('127.0.0.1'),
      maxPayload: z.number().int().positive().default(1048576),
      timeout: z.number().int().positive().default(30000),
    })
    .default({}),
  httpBridge: z
    .object({
      enabled: z.boolean().default(false),
      port: z.number().int().positive().default(3000),
      host: z.string().default('127.0.0.1'),
      token: z.string().default(''),
    })
    .default({}),
  server: z
    .object({
      transport: z.enum(['stdio', 'websocket']).default('stdio'),
      name: z.string().default('indesign-nutria-mcp'),
      version: z.string().default('1.0.0'),
    })
    .default({}),
  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    })
    .default({}),
});

export type AppConfig = z.infer<typeof configSchema>;

const defaultConfig: AppConfig = {
  bridge: {
    port: 8120,
    host: '127.0.0.1',
    maxPayload: 1048576,
    timeout: 30000,
  },
  httpBridge: {
    enabled: false,
    port: 3000,
    host: '127.0.0.1',
    token: '',
  },
  server: {
    transport: 'stdio',
    name: 'indesign-nutria-mcp',
    version: '1.0.0',
  },
  logging: {
    level: 'info',
  },
};

export function loadConfig(configPath?: string): AppConfig {
  let base: AppConfig = defaultConfig;

  if (configPath && existsSync(resolve(configPath))) {
    try {
      const raw = JSON.parse(readFileSync(resolve(configPath), 'utf-8'));
      base = configSchema.parse(raw);
    } catch (err) {
      console.warn(`Config load failed at ${configPath}, using defaults:`, err);
    }
  } else if (existsSync(resolve('indesign-nutria-mcp.json'))) {
    try {
      const raw = JSON.parse(readFileSync(resolve('indesign-nutria-mcp.json'), 'utf-8'));
      base = configSchema.parse(raw);
    } catch {
      base = defaultConfig;
    }
  }

  return applyEnvOverrides(base);
}

// ── Environment variable overrides ──
// Precedence: environment > JSON config file > defaults.
// Invalid or empty values are ignored so a bad export can never wedge startup.

function envStr(name: string): string | undefined {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : undefined;
}

function envInt(name: string): number | undefined {
  const v = envStr(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function envBool(name: string): boolean | undefined {
  const v = envStr(name);
  if (v === undefined) return undefined;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

function applyEnvOverrides(base: AppConfig): AppConfig {
  const merged: AppConfig = {
    bridge: {
      ...base.bridge,
      ...(envInt('BRIDGE_PORT') !== undefined && { port: envInt('BRIDGE_PORT') }),
      ...(envStr('BRIDGE_HOST') !== undefined && { host: envStr('BRIDGE_HOST') }),
      ...(envInt('BRIDGE_MAX_PAYLOAD') !== undefined && { maxPayload: envInt('BRIDGE_MAX_PAYLOAD') }),
      ...(envInt('BRIDGE_TIMEOUT') !== undefined && { timeout: envInt('BRIDGE_TIMEOUT') }),
    },
    httpBridge: {
      ...base.httpBridge,
      ...(envBool('HTTP_BRIDGE_ENABLED') !== undefined && { enabled: envBool('HTTP_BRIDGE_ENABLED') }),
      ...(envInt('HTTP_BRIDGE_PORT') !== undefined && { port: envInt('HTTP_BRIDGE_PORT') }),
      ...(envStr('HTTP_BRIDGE_HOST') !== undefined && { host: envStr('HTTP_BRIDGE_HOST') }),
      ...(envStr('BRIDGE_TOKEN') !== undefined && { token: envStr('BRIDGE_TOKEN') }),
    },
    server: {
      ...base.server,
      ...(envStr('SERVER_TRANSPORT') === 'stdio' || envStr('SERVER_TRANSPORT') === 'websocket'
        ? { transport: envStr('SERVER_TRANSPORT') as 'stdio' | 'websocket' }
        : {}),
      ...(envStr('SERVER_NAME') !== undefined && { name: envStr('SERVER_NAME') }),
      ...(envStr('SERVER_VERSION') !== undefined && { version: envStr('SERVER_VERSION') }),
    },
    logging: {
      ...base.logging,
      ...(envStr('LOG_LEVEL_OVERRIDE') !== undefined &&
      ['debug', 'info', 'warn', 'error'].includes(envStr('LOG_LEVEL_OVERRIDE')!)
        ? { level: envStr('LOG_LEVEL_OVERRIDE') as AppConfig['logging']['level'] }
        : {}),
      ...(!envStr('LOG_LEVEL_OVERRIDE') &&
      envStr('LOG_LEVEL') !== undefined &&
      ['debug', 'info', 'warn', 'error'].includes(envStr('LOG_LEVEL')!)
        ? { level: envStr('LOG_LEVEL') as AppConfig['logging']['level'] }
        : {}),
    },
  };

  // Final validation guarantees the shape even if env parsing drifted.
  return configSchema.parse(merged);
}
