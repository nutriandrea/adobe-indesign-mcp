import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { BridgeRequest, BridgeResponse, BridgeStatus } from '../types/index.js';
import { InDesignError } from '../utils/errorHandler.js';
import { sanitizeCode } from '../utils/stringUtils.js';
import { JSON_POLYFILL } from './jsonPolyfill.js';
import { getExtendScriptHelpers } from './extendScriptHelpers.js';

export class ScriptExecutor extends EventEmitter {
  private pending: Map<string, { resolve: (res: BridgeResponse) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }> = new Map();
  private defaultTimeout: number;
  private _undoGroupActive: boolean = false;
  private _connected: boolean = false;

  constructor(defaultTimeout: number = 30000) {
    super();
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Called by the BridgeServer when a plugin client connects or disconnects.
   * Connection state is independent from the pending request queue.
   */
  setConnected(connected: boolean): void {
    this._connected = connected;
  }

  get undoGroupActive(): boolean {
    return this._undoGroupActive;
  }

  startUndoGroup(): void {
    this._undoGroupActive = true;
  }

  endUndoGroup(): void {
    this._undoGroupActive = false;
  }

  async execute(
    code: string,
    timeout?: number,
    debug?: boolean,
  ): Promise<BridgeResponse> {
    const helpers = getExtendScriptHelpers();
    const polyfilled = JSON_POLYFILL + '\n' + helpers;

    let wrapped = code;

    if (debug) {
      wrapped = `
try {
  ${code}
} catch(e) {
  JSON.stringify({ __extendscript_error: true, message: e.message, line: e.line, fileName: e.fileName, stack: e.stack });
}`;
    }

    if (this._undoGroupActive) {
      wrapped = `
app.scriptPreferences.undoMode = UndoModes.ENTIRE_SCRIPT;
${wrapped}
app.scriptPreferences.undoMode = UndoModes.FAST_ENTIRE_SCRIPT;`;
    }

    const fullCode = polyfilled + '\n' + sanitizeCode(wrapped);
    const id = uuidv4();
    const request: BridgeRequest = {
      id,
      code: fullCode,
      timeout: timeout ?? this.defaultTimeout,
    };

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new InDesignError('Script execution timed out', 'EXECUTION_TIMEOUT'));
      }, request.timeout ?? this.defaultTimeout);

      this.pending.set(id, { resolve, reject, timer });
      this.emit('request', request);
    });
  }

  handleResponse(response: BridgeResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.type === 'error') {
      pending.reject(
        new InDesignError(response.error ?? 'Unknown bridge error', 'BRIDGE_ERROR'),
      );
    } else {
      pending.resolve(response);
    }
  }

  getStatus(): BridgeStatus {
    return {
      connected: this._connected,
      queueDepth: this.pending.size,
    };
  }

  cancelAll(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new InDesignError('Execution cancelled', 'CANCELLED'));
      this.pending.delete(id);
    }
  }
}
