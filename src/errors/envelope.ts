/**
 * Structured error envelopes for agent self-correction.
 *
 * A tool that fails with prose leaves the host guessing whether the document is
 * missing, the reference is stale, or the bridge is down — and guessing is
 * where wasted turns come from. Each failure is classified into a typed code
 * and, where a remedy exists, carries the tool to call next.
 *
 * Every `suggested_next_tool` must name a tool that is actually registered;
 * tests/contract/errorRecovery.test.ts enforces that against the live registry.
 * A hint pointing at a tool that does not exist is worse than no hint.
 */

/** Failure classes a host can branch on. Extend when a new class appears. */
export type InDesignErrorCode =
  | 'bridge_not_connected'
  | 'bridge_error'
  | 'execution_timeout'
  | 'execution_cancelled'
  | 'script_blocked_by_policy'
  | 'extendscript_runtime_error'
  | 'document_not_found'
  | 'no_active_document'
  | 'page_not_found'
  | 'invalid_reference'
  | 'invalid_arguments'
  | 'file_not_found'
  | 'missing_font'
  | 'link_missing'
  | 'output_too_large'
  | 'unknown';

export interface InDesignErrorEnvelope {
  ok: false;
  code: InDesignErrorCode;
  message: string;
  suggested_next_tool?: string;
  suggested_args?: Record<string, unknown>;
  /** ExtendScript failures know their source line and file. */
  line?: number;
  file?: string;
  /** Present when the runtime supplied a stack trace. */
  stack?: string;
}

interface Rule {
  pattern: RegExp;
  code: InDesignErrorCode;
  suggested_next_tool?: string;
  /** Arguments to pass when retrying with `suggested_next_tool`. */
  suggested_args?: Record<string, unknown>;
}

/**
 * Ordered most specific first — the first match wins, so a broad rule placed
 * early would shadow everything after it.
 */
const RULES: readonly Rule[] = [
  // A blocked construct is a deliberate refusal, not a malfunction. It carries
  // no remedy: the caller has to change what it sent.
  { pattern: /blocked by the indesign mcp security policy/i, code: 'script_blocked_by_policy' },

  // An output that will not fit the transport. Not an object-model error, and
  // the remedy is to ask for less, so it belongs with the refusal classes.
  {
    pattern: /over the \d+-byte cap|output too large|payload too large/i,
    code: 'output_too_large',
    suggested_next_tool: 'preview_document',
    suggested_args: { resolutionPpi: 96 },
  },

  {
    pattern: /bridge is not connected|not connected to|no client connected/i,
    code: 'bridge_not_connected',
  },
  { pattern: /execution cancelled|execution canceled/i, code: 'execution_cancelled' },
  {
    pattern: /script execution timed out|timed out|timeout/i,
    code: 'execution_timeout',
    // The cheapest liveness probe available today. There is no ping tool yet;
    // when one lands (see the blueprint, S3) this should point at it.
    suggested_next_tool: 'document_listOpen',
  },

  // The ExtendScript object model reports a stale index or a vanished object as
  // the bare string "Object is invalid" — the single most common failure in
  // practice, and the one most in need of a reorientation hint.
  {
    pattern: /object is invalid|invalid object|does not exist|no such/i,
    code: 'invalid_reference',
    suggested_next_tool: 'document_getInfo',
  },
  {
    pattern: /no documents? (?:are )?open|no active document/i,
    code: 'no_active_document',
    suggested_next_tool: 'document_listOpen',
  },
  {
    pattern: /document not found/i,
    code: 'document_not_found',
    suggested_next_tool: 'document_listOpen',
  },
  // A `document_id` naming a document that is not open — the resolver's own
  // error. Without this rule the message falls through to the generic
  // ExtendScript class and the host is told to re-read the document it just
  // failed to reach; the open documents are already in the message, and the
  // hint says how to re-derive a valid id.
  {
    pattern: /document_id .+ is not open/i,
    code: 'document_not_found',
    suggested_next_tool: 'document_listOpen',
  },
  {
    pattern: /page (?:not found|index out of range)|invalid page/i,
    code: 'page_not_found',
    suggested_next_tool: 'document_getInfo',
  },
  {
    pattern: /frame (?:not found|index)|invalid frame/i,
    code: 'invalid_reference',
    suggested_next_tool: 'document_getInfo',
  },

  {
    pattern: /font .*not (?:found|available)|missing font/i,
    code: 'missing_font',
    suggested_next_tool: 'font_missing_check',
  },
  {
    pattern: /link .*missing|missing link|link is missing/i,
    code: 'link_missing',
    suggested_next_tool: 'image_getLinks',
  },

  // `recipe_exportPreset` validates its preset live and names the valid ones
  // in the message — the caller's fix is to resend, not to retry a chain.
  {
    pattern: /pdf export preset .*not found|not a valid pdf export preset/i,
    code: 'invalid_arguments',
  },

  {
    pattern:
      /invalid file path|file path must|expected .* received|invalid argument|invalid parameter/i,
    code: 'invalid_arguments',
  },
  { pattern: /file not found|cannot find file|enoent/i, code: 'file_not_found' },

  {
    pattern: /extendscript|syntax error|expected: ?;/i,
    code: 'extendscript_runtime_error',
    suggested_next_tool: 'document_getInfo',
  },
];

/** Maps the bridge's own transport codes onto envelope codes. */
const ERROR_CODE_MAP: Record<string, InDesignErrorCode> = {
  VALIDATION_ERROR: 'invalid_arguments',
  EXECUTION_TIMEOUT: 'execution_timeout',
  CANCELLED: 'execution_cancelled',
  BRIDGE_ERROR: 'bridge_error',
  EXTENDSCRIPT_RUNTIME_ERROR: 'extendscript_runtime_error',
  OUTPUT_TOO_LARGE: 'output_too_large',
};

/**
 * Codes the bridge uses as a catch-all for "the script failed". They are the
 * *least* specific thing the bridge can say, so they must not outrank the
 * script's own message — the macOS bridge reports every InDesign-side failure
 * (a stale reference, a missing document, a bad preset) as BRIDGE_ERROR, and if
 * that code short-circuited the rules then the whole classification table would
 * be unreachable in production, which is exactly what the live smoke found.
 * The specific transport codes above stay authoritative.
 */
const GENERIC_CODES: ReadonlySet<string> = new Set(['BRIDGE_ERROR', 'EXTENDSCRIPT_RUNTIME_ERROR']);

export function classifyError(message: string, code?: string): InDesignErrorCode {
  const mapped = code ? ERROR_CODE_MAP[code] : undefined;

  // A *specific* transport code is authoritative: the bridge knows more about a
  // timeout or a cancellation than a regex does.
  if (mapped && !(code && GENERIC_CODES.has(code))) return mapped;

  for (const rule of RULES) {
    if (rule.pattern.test(message)) return rule.code;
  }

  // A generic code whose message matches nothing still gets its own envelope.
  if (mapped) return mapped;
  return 'unknown';
}

export function suggestedToolFor(message: string, code?: string): string | undefined {
  // classifyError already resolves transport codes ahead of message patterns,
  // so looking the classified code up in the rule table is enough.
  return ruleFor(classifyError(message, code))?.suggested_next_tool;
}

function ruleFor(code: InDesignErrorCode): Rule | undefined {
  return RULES.find((r) => r.code === code && r.suggested_next_tool);
}

/**
 * Builds the envelope. The original message is preserved verbatim so existing
 * callers that read the text still see what they saw before.
 */
export function toErrorEnvelope(input: {
  message: string;
  code?: string;
  line?: number;
  file?: string;
  stack?: string;
  suggestedArgs?: Record<string, unknown>;
}): InDesignErrorEnvelope {
  const code = classifyError(input.message, input.code);
  const rule = ruleFor(code);
  const envelope: InDesignErrorEnvelope = {
    ok: false,
    code,
    message: input.message,
  };

  if (rule?.suggested_next_tool) envelope.suggested_next_tool = rule.suggested_next_tool;
  // An explicit override wins over the rule's canned arguments.
  if (input.suggestedArgs) envelope.suggested_args = input.suggestedArgs;
  else if (rule?.suggested_args) envelope.suggested_args = rule.suggested_args;
  if (typeof input.line === 'number') envelope.line = input.line;
  if (input.file) envelope.file = input.file;
  if (input.stack) envelope.stack = input.stack;

  return envelope;
}

/** Every tool this module may point at, for the contract test to verify. */
export function suggestedTools(): string[] {
  const names = RULES.map((r) => r.suggested_next_tool).filter((n): n is string => Boolean(n));
  return [...new Set(names)].sort();
}

// ── Success envelope (S1b, behind a flag) ──
//
// The failure envelope above is always on. The *success* shape is a breaking
// change for any host that reads fields off `content[0].text`, so it ships
// behind `responseEnvelope.success` (default off) for one release, then becomes
// the default. `setSuccessEnvelopeEnabled` is called once at startup from the
// server constructor.

let successEnvelopeEnabled = false;

export function setSuccessEnvelopeEnabled(enabled: boolean): void {
  successEnvelopeEnabled = enabled;
}

export function isSuccessEnvelopeEnabled(): boolean {
  return successEnvelopeEnabled;
}

/**
 * Wraps a successful payload so it carries `ok: true`, mirroring the failure
 * envelope.
 *
 * Object results keep their fields at the **top level** (`{ ...data, ok: true }`)
 * rather than nesting under `data`: a host that already reads `parsed.name` keeps
 * working, which is the whole point of spreading rather than nesting. Arrays and
 * scalars are nested under `result`, because spreading an array would lose it and
 * a result that carries its own `ok` key would collide.
 */
export function wrapSuccess(data: unknown): unknown {
  if (Array.isArray(data)) return { ok: true, result: data };
  if (data !== null && typeof data === 'object') {
    return { ...(data as Record<string, unknown>), ok: true };
  }
  return { ok: true, result: data };
}
