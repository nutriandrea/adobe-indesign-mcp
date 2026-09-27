import { describe, it, expect } from 'vitest';
import {
  normalizeResponseType,
  parseBridgeMessage,
  acceptedTypesDescription,
  BRIDGE_SUCCESS_ALIASES,
} from '../../src/bridge/protocol.js';

describe('protocol: normalizeResponseType', () => {
  it.each(['result', 'success', 'response'])('accepts %s as a success alias', (raw) => {
    expect(normalizeResponseType(raw)).toBe('result');
  });

  it('normalizes error to error', () => {
    expect(normalizeResponseType('error')).toBe('error');
  });

  it.each([
    ['unknown string', 'ok'],
    ['empty string', ''],
    ['non-string number', 42],
    ['non-string null', null],
    ['non-string undefined', undefined],
    ['non-string object', { type: 'result' }],
  ])('rejects %s', (_label, raw) => {
    expect(normalizeResponseType(raw)).toBeNull();
  });
});

describe('protocol: parseBridgeMessage', () => {
  it('parses a canonical result unchanged', () => {
    expect(parseBridgeMessage({ id: 'r1', type: 'result', result: 'x' })).toEqual({
      kind: 'response',
      response: { id: 'r1', type: 'result', result: 'x' },
    });
  });

  it('normalizes a legacy success response to canonical result', () => {
    expect(parseBridgeMessage({ id: 'r2', type: 'success', result: 'y' })).toEqual({
      kind: 'response',
      response: { id: 'r2', type: 'result', result: 'y' },
    });
  });

  it('normalizes a legacy response-type response to canonical result', () => {
    expect(parseBridgeMessage({ id: 'r3', type: 'response', result: 'z' })).toEqual({
      kind: 'response',
      response: { id: 'r3', type: 'result', result: 'z' },
    });
  });

  it('parses an error with a message', () => {
    expect(parseBridgeMessage({ id: 'e1', type: 'error', error: 'boom' })).toEqual({
      kind: 'response',
      response: { id: 'e1', type: 'error', error: 'boom' },
    });
  });

  it('accepts an error without a message (executor falls back to a generic one)', () => {
    expect(parseBridgeMessage({ id: 'e2', type: 'error' })).toEqual({
      kind: 'response',
      response: { id: 'e2', type: 'error' },
    });
  });

  it('passes through a missing result key as absent, not undefined-explicit', () => {
    expect(parseBridgeMessage({ id: 'r4', type: 'result' })).toEqual({
      kind: 'response',
      response: { id: 'r4', type: 'result' },
    });
    expect(parseBridgeMessage({ id: 'r4', type: 'result' }).kind === 'response').toBe(true);
  });

  it('routes an unknown type with a valid id as a loud protocol error', () => {
    const parsed = parseBridgeMessage({ id: 'r5', type: 'ok', result: 'x' });
    expect(parsed).toEqual({
      kind: 'response',
      response: {
        id: 'r5',
        type: 'error',
        error: expect.stringMatching(/unknown response type 'ok'/),
      },
    });
  });

  it.each([
    ['null payload', null],
    ['non-object payload', 'id: r1'],
    ['array payload', [{ id: 'r1', type: 'result' }]],
    ['missing id', { type: 'result', result: 'x' }],
    ['empty id', { id: '', type: 'result', result: 'x' }],
    ['numeric id', { id: 7, type: 'result', result: 'x' }],
  ])('reports %s as unroutable with a reason', (_label, payload) => {
    const parsed = parseBridgeMessage(payload);
    expect(parsed.kind).toBe('unroutable');
    if (parsed.kind === 'unroutable') {
      expect(parsed.reason.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['missing type with valid id', { id: 'r6', result: 'x' }],
    ['numeric type with valid id', { id: 'r7', type: 1, result: 'x' }],
    ['undefined type with valid id', { id: 'r8', type: undefined }],
  ])('routes %s as a loud protocol error, not unroutable', (_label, payload) => {
    const parsed = parseBridgeMessage(payload);
    expect(parsed.kind).toBe('response');
    if (parsed.kind === 'response') {
      expect(parsed.response.type).toBe('error');
      expect(parsed.response.error ?? '').toMatch(/unknown response type/);
    }
  });
});

describe('protocol: acceptedTypesDescription', () => {
  it('lists canonical types and aliases for logs and errors', () => {
    const description = acceptedTypesDescription();
    expect(description).toContain("'result' | 'error'");
    for (const alias of BRIDGE_SUCCESS_ALIASES) {
      expect(description).toContain(`'${alias}'`);
    }
  });
});
