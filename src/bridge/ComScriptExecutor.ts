import { spawn, type ChildProcess } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { ScriptExecutor } from './ScriptExecutor.js';
import { wrapExtendScript } from './wrapExtendScript.js';
import { InDesignError } from '../utils/errorHandler.js';
import type { BridgeResponse, BridgeStatus } from '../types/index.js';

// Windows COM dialogs would hang DoScript forever — suppress them all.
const NEVER_INTERACT = 'app.scriptPreferences.userInteractionLevel = 1699311169;';

interface PendingComRequest {
  id: string;
  tempFile: string;
  timer: NodeJS.Timeout;
  resolve: (res: BridgeResponse) => void;
  reject: (err: Error) => void;
}

/**
 * Windows backend: drives InDesign via COM automation (cscript + VBScript
 * DoScript) instead of the UXP WebSocket plugin. Opt-in through config; the
 * default macOS-friendly UXP path is untouched. Requests are executed FIFO by
 * one persistent cscript process, so stdout lines map 1:1 to submissions.
 */
export class ComScriptExecutor extends ScriptExecutor {
  private proc?: ChildProcess;
  private buffer = '';
  private queue: PendingComRequest[] = [];
  private vbsPath: string;
  private readonly timeoutMs: number;

  constructor(
    defaultTimeout: number = 30000,
    options: { cscriptPath?: string; vbsPath?: string } = {},
  ) {
    super(defaultTimeout);
    this.timeoutMs = defaultTimeout;
    this.vbsPath =
      options.vbsPath ??
      resolve(fileURLToPath(new URL('.', import.meta.url)), '../../assets/windows/run_jsx_persistent.vbs');
    this.cscriptPath = options.cscriptPath ?? 'cscript';
  }

  private cscriptPath: string;

  private ensureProcess(): ChildProcess {
    if (this.proc && this.proc.exitCode === null) return this.proc;

    const proc = spawn(this.cscriptPath, ['//nologo', this.vbsPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    proc.stdout!.on('data', (chunk: string | Buffer) => this.onStdout(String(chunk)));
    proc.stderr!.on('data', () => {
      // cscript noise (banner remnants etc.) — never part of the protocol
    });
    proc.on('close', () => {
      const dead = new InDesignError(
        'Windows COM bridge exited — is InDesign running on this machine?',
        'COM_PROCESS_EXIT',
      );
      this.failAllPending(dead);
      this.buffer = '';
      this.proc = undefined;
    });

    this.proc = proc;
    return proc;
  }

  async execute(code: string, timeout?: number, debug?: boolean): Promise<BridgeResponse> {
    const proc = this.ensureProcess();

    const fullCode = [NEVER_INTERACT, wrapExtendScript(code, { debug, undoGroupActive: this.undoGroupActive })].join('\n');
    const id = uuidv4();
    const tempFile = join(tmpdir(), `indesign-nutria-mcp-${id}.jsx`);
    writeFileSync(tempFile, fullCode, 'utf-8');

    return new Promise<BridgeResponse>((res, rej) => {
      const timer = setTimeout(() => {
        this.removePending(id);
        cleanupTemp(tempFile);
        rej(new InDesignError('Script execution timed out', 'EXECUTION_TIMEOUT'));
      }, timeout ?? this.timeoutMs);

      this.queue.push({ id, tempFile, timer, resolve: res, reject: rej });
      proc.stdin!.write(`${tempFile}\n`);
    });
  }

  getStatus(): BridgeStatus {
    return {
      connected: Boolean(this.proc && this.proc.exitCode === null),
      queueDepth: this.queue.length,
    };
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    for (const pending of [...this.queue]) {
      clearTimeout(pending.timer);
      cleanupTemp(pending.tempFile);
    }
    this.queue = [];
    if (this.proc.exitCode === null) this.proc.kill();
    this.proc = undefined;
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line === '') continue;
      this.settle(line);
    }
  }

  private settle(line: string): void {
    const pending = this.queue.shift();
    if (!pending) return;

    clearTimeout(pending.timer);
    cleanupTemp(pending.tempFile);

    if (line.startsWith('ERROR:')) {
      pending.reject(new InDesignError(line.slice(6).trim(), 'BRIDGE_ERROR'));
      return;
    }
    pending.resolve({ id: pending.id, type: 'result', result: line });
  }

  private removePending(id: string): void {
    const index = this.queue.findIndex((p) => p.id === id);
    if (index !== -1) this.queue.splice(index, 1)[0];
  }

  private failAllPending(err: InDesignError): void {
    for (const pending of this.queue) {
      clearTimeout(pending.timer);
      cleanupTemp(pending.tempFile);
      pending.reject(err);
    }
    this.queue = [];
  }
}

function cleanupTemp(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // best effort
  }
}

