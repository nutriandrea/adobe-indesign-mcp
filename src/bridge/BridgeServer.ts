import { WebSocket } from 'ws';
import type { BridgeResponse, BridgeStatus } from '../types/index.js';
import { ScriptExecutor } from './ScriptExecutor.js';
import { logger } from '../utils/logger.js';

const DEFAULT_RECONNECT_DELAY = 3000; // 3s

export interface BridgeServerOptions {
  port: number;
  host: string;
  maxPayload: number;
  timeout: number;
  reconnectDelayMs?: number;
}

/**
 * Client-mode bridge connection (architecture fixed 2026-08-01):
 * The MCP server does NOT bind a port. It connects as a WebSocket CLIENT to
 * the singleton Windows COM bridge (bridge-proxy-persistent.mjs), which owns
 * the single persistent InDesign COM instance. Any number of MCP server
 * instances can therefore share one bridge / one InDesign / one document set
 * without EADDRINUSE collisions.
 */
export class BridgeServer {
  private ws: WebSocket | null = null;
  private executor: ScriptExecutor;
  private options: BridgeServerOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected: boolean = false;
  private _stopped: boolean = false;

  constructor(options: BridgeServerOptions, executor: ScriptExecutor) {
    this.options = options;
    this.executor = executor;

    this.executor.on('request', (request) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(request));
      } else {
        logger.error('Bridge not connected — cannot dispatch request', { id: request.id });
        this.executor.handleResponse({
          id: request.id,
          type: 'error',
          error:
            'Bridge is not connected. Start the Windows COM bridge (node bridge-proxy-persistent.mjs) and try again.',
        });
      }
    });
  }

  /** Whether the bridge WebSocket is open */
  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    // Client mode: connect to the singleton bridge. No port binding,
    // so multiple MCP server instances can coexist without EADDRINUSE.
    this._stopped = false;
    this.connect();
    return Promise.resolve();
  }

  private connect(): void {
    if (this._stopped) return;

    const url = `ws://${this.options.host}:${this.options.port}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      logger.error('Bridge client creation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      logger.info(`Connected to bridge at ${url}`);
      this._connected = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    ws.on('message', (raw) => {
      try {
        const msg: BridgeResponse = JSON.parse(raw.toString());
        if (msg.id) {
          this.executor.handleResponse(msg);
        }
      } catch (err) {
        logger.error('Invalid bridge message', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    ws.on('close', () => {
      this._connected = false;
      this.ws = null;
      logger.warn(`Bridge connection closed (${url}). Reconnecting...`);
      this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      // 'close' will follow and handle the reconnect — do not schedule here.
      logger.error('Bridge WebSocket error', { error: err.message });
    });
  }

  private scheduleReconnect(): void {
    if (this._stopped) return;
    if (this.reconnectTimer) return;
    const delay = this.options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      this._connected = false;
      try { ws.close(); } catch { /* noop */ }
    }
  }

  getStatus(): BridgeStatus {
    const execStatus = this.executor.getStatus();
    return {
      connected: this._connected,
      queueDepth: execStatus.queueDepth,
    };
  }

  /** Number of active WebSocket connections (0 or 1 in client mode) */
  get connectionCount(): number {
    return this._connected ? 1 : 0;
  }
}
