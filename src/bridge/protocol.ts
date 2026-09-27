/**
 * Bridge response protocol.
 *
 * Canonical contract (src/types/bridge.ts):
 *   { id: string, type: 'result' | 'error', result?: unknown, error?: string }
 *
 * Historical emitters have used non-canonical success type strings:
 *   - UXP plugin (plugin/index.js)      → 'success'
 *   - legacy macOS JXA bridge proxy     → 'response'
 * Both are accepted as success aliases so old plugins keep working while
 * they migrate, but an unknown type is a protocol violation and MUST
 * surface as an error — never silently resolve as success (the exact bug
 * class that made bridge errors invisible on macOS for months).
 */

import type { BridgeResponse } from '../types/index.js';

export type BridgeResponseType = 'result' | 'error';

/** Accepted spellings of a success response, oldest first. */
export const BRIDGE_SUCCESS_ALIASES: readonly string[] = ['result', 'success', 'response'];

/**
 * Normalize a raw response type to the canonical union.
 * Returns null when the type is not a recognized success alias or 'error'.
 */
export function normalizeResponseType(raw: unknown): BridgeResponseType | null {
  if (typeof raw !== 'string') return null;
  if (raw === 'error') return 'error';
  if (BRIDGE_SUCCESS_ALIASES.includes(raw)) return 'result';
  return null;
}

export type ParsedBridgeMessage =
  | { kind: 'response'; response: BridgeResponse }
  | { kind: 'unroutable'; reason: string };

/**
 * Validate an incoming bridge message payload.
 *
 * - Well-formed responses (canonical or legacy alias) are normalized to the
 *   canonical shape.
 * - A message with a valid id but an unknown type is routed as an error —
 *   the pending request fails immediately with a clear message instead of
 *   hanging until its timeout.
 * - Messages without a usable id cannot be routed to any pending request
 *   and are reported as unroutable so the caller can log and drop them.
 */
export function parseBridgeMessage(payload: unknown): ParsedBridgeMessage {
  if (typeof payload !== 'object' || payload === null) {
    return { kind: 'unroutable', reason: 'payload is not an object' };
  }
  const candidate = payload as Record<string, unknown>;

  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return { kind: 'unroutable', reason: 'missing or invalid id' };
  }

  const type = normalizeResponseType(candidate.type);
  if (type === null) {
    return {
      kind: 'response',
      response: {
        id: candidate.id,
        type: 'error',
        error:
          `Bridge protocol violation: unknown response type ` +
          `'${String(candidate.type)}' (expected ${acceptedTypesDescription()})`,
      },
    };
  }

  if (type === 'error') {
    return {
      kind: 'response',
      response: {
        id: candidate.id,
        type: 'error',
        ...(typeof candidate.error === 'string' ? { error: candidate.error } : {}),
      },
    };
  }

  return {
    kind: 'response',
    response: {
      id: candidate.id,
      type: 'result',
      ...('result' in candidate ? { result: candidate.result } : {}),
    },
  };
}

/**
 * Human-readable list of accepted types, for error messages and logs.
 */
export function acceptedTypesDescription(): string {
  return `canonical 'result' | 'error' (success aliases: ${BRIDGE_SUCCESS_ALIASES.map(
    (t) => `'${t}'`,
  ).join(', ')})`;
}
