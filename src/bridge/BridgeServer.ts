import { createServer, type Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { BridgeResponse, BridgeStatus } from '../types/index.js';
import { ScriptExecutor } from './ScriptExecutor.js';
import { logger } from '../utils/logger.js';

const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;  // 30s
const DEFAULT_STALE_TIMEOUT = 120000;          // 2min without any message = stale
export interface BridgeServerOptions {
  port: number;
  host: string;
  maxPayload: number;
  timeout: number;
  healthCheckIntervalMs?: number;
  staleTimeoutMs?: number;
}

export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private httpServer: Server | null = null;
  private executor: ScriptExecutor;
  private options: BridgeServerOptions;
  private connections: Set<WebSocket> = new Set();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity: Map<WebSocket, number> = new Map();
  private _connected: boolean = false;

  constructor(options: BridgeServerOptions, executor: ScriptExecutor) {
    this.options = options;
    this.executor = executor;

    this.executor.on('request', (request) => {
      // Fast-fail: with no plugin connected, a request could never be answered,
      // so reject immediately instead of letting it hang until the timeout.
      if (!this._connected) {
        this.executor.handleResponse({
          id: request.id,
          type: 'error',
          error:
            'Bridge is not connected — the InDesign plugin is not reachable. ' +
            'Open InDesign and make sure the MCP bridge panel is running.',
        });
        return;
      }
      this.broadcast(JSON.stringify(request));
    });
  }

  /** Whether at least one WebSocket connection is open */
  get connected(): boolean {
    return this._connected;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = createServer();
      this.wss = new WebSocketServer({
        server: this.httpServer,
        maxPayload: this.options.maxPayload,
      });

      this.wss.on('connection', (ws) => {
        this.connections.add(ws);
        this.lastActivity.set(ws, Date.now());
        this._connected = true;
        this.executor.setConnected(true);
        logger.info('Bridge client connected');

        ws.on('message', (raw) => {
          this.lastActivity.set(ws, Date.now());
          try {
            const response: BridgeResponse = JSON.parse(raw.toString());
            this.executor.handleResponse(response);
          } catch (err) {
            logger.error('Invalid bridge message', { error: err instanceof Error ? err.message : String(err) });
          }
        });

        ws.on('close', () => {
          this.connections.delete(ws);
          this.lastActivity.delete(ws);
          if (this.connections.size === 0) {
            this._connected = false;
            this.executor.setConnected(false);
          }
          logger.info('Bridge client disconnected');
        });

        ws.on('error', (err) => {
          logger.error('Bridge WebSocket error', { error: err.message });
          this.connections.delete(ws);
          this.lastActivity.delete(ws);
          if (this.connections.size === 0) {
            this._connected = false;
            this.executor.setConnected(false);
          }
        });

        ws.send(JSON.stringify({ type: 'connected', version: '1.0.0' }));
      });

      this.httpServer.listen(this.options.port, this.options.host, () => {
        logger.info(`Bridge server listening on ${this.options.host}:${this.options.port}`);
        this.startHealthChecks();
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.stopHealthChecks();
    for (const ws of this.connections) {
      ws.close();
    }
    this.connections.clear();
    this.lastActivity.clear();
    this._connected = false;
    this.executor.setConnected(false);

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => resolve());
        this.httpServer = null;
      });
    }
  }

  getStatus(): BridgeStatus {
    const execStatus = this.executor.getStatus();
    return {
      connected: this._connected,
      queueDepth: execStatus.queueDepth,
    };
  }

  /** Number of active WebSocket connections */
  get connectionCount(): number {
    return this.connections.size;
  }

  // ── Health checks ──

  private startHealthChecks(): void {
    const interval = this.options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL;
    this.healthCheckTimer = setInterval(() => this.runHealthCheck(), interval);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private runHealthCheck(): void {
    const now = Date.now();
    const staleTimeout = this.options.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT;

    for (const ws of this.connections) {
      // Close stale connections
      const lastActive = this.lastActivity.get(ws) ?? 0;
      if (now - lastActive > staleTimeout) {
        logger.warn('Closing stale bridge connection (no activity)', {
          idleMs: now - lastActive,
          staleTimeout,
        });
        ws.close(4001, 'Connection stale - no activity detected');
        this.connections.delete(ws);
        this.lastActivity.delete(ws);
        continue;
      }

      // Ping active connections
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }

    // Update connected flag
    this._connected = this.connections.size > 0;
  }

  // ── Messaging ──

  private broadcast(data: string): void {
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}
