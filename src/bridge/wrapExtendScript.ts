import { JSON_POLYFILL } from './jsonPolyfill.js';
import { getExtendScriptHelpers } from './extendScriptHelpers.js';
import { sanitizeCode } from '../utils/stringUtils.js';

export interface WrapOptions {
  debug?: boolean;
  undoGroupActive?: boolean;
}

/**
 * Shared ExtendScript wrapping used by every executor backend (UXP WebSocket,
 * Windows COM). Produces the full script string: JSON polyfill + DOM shims +
 * optional debug/error-report wrapper + undo-mode preferences, all sanitized.
 */
export function wrapExtendScript(code: string, options: WrapOptions = {}): string {
  const helpers = getExtendScriptHelpers();
  const polyfilled = JSON_POLYFILL + '\n' + helpers;

  let wrapped = code;

  if (options.debug) {
    wrapped = `
try {
  ${code}
} catch(e) {
  JSON.stringify({ __extendscript_error: true, message: e.message, line: e.line, fileName: e.fileName, stack: e.stack });
}`;
  }

  if (options.undoGroupActive) {
    wrapped = `
app.scriptPreferences.undoMode = UndoModes.ENTIRE_SCRIPT;
${wrapped}
app.scriptPreferences.undoMode = UndoModes.FAST_ENTIRE_SCRIPT;`;
  }

  return polyfilled + '\n' + sanitizeCode(wrapped);
}
