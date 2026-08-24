import { describe, it, expect } from 'vitest';
import { InDesignError, formatResponse, formatErrorResponse } from '../../src/utils/errorHandler.js';
import { escapeExtendScriptString, sanitizeCode, truncate, toUpperCaseFirst } from '../../src/utils/stringUtils.js';
import { createDocumentSchema, pageSchema, openDocumentSchema, addPageSchema, exportDocumentSchema } from '../../src/schemas/index.js';
import { ExportFormat, Units, PageOrientation, Alignment } from '../../src/types/enums.js';

// ── Error handler tests ──
describe('InDesignError', () => {
  it('should create error with message and code', () => {
    const err = new InDesignError('test error', 'TEST_CODE', new Error('cause'));
    expect(err.message).toBe('test error');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('InDesignError');
    expect(err.originalError).toBeInstanceOf(Error);
  });

  it('should default code to INDESIGN_ERROR', () => {
    const err = new InDesignError('msg');
    expect(err.code).toBe('INDESIGN_ERROR');
  });
});

describe('formatResponse', () => {
  it('should return ToolResult with text content', () => {
    const res = formatResponse({ foo: 'bar' });
    expect(res.content).toHaveLength(1);
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toBe('{"foo":"bar"}');
    expect(res.isError).toBeUndefined();
  });

  it('should stringify non-object data', () => {
    const res = formatResponse('hello');
    expect(res.content[0].text).toBe('"hello"');
  });
});

describe('formatErrorResponse', () => {
  it('should format Error instance', () => {
    const res = formatErrorResponse(new Error('boom'));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('boom');
  });

  it('should format InDesignError with message', () => {
    const res = formatErrorResponse(new InDesignError('bad', 'BAD_CODE'));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('bad');
  });

  it('should format string message', () => {
    const res = formatErrorResponse('simple string');
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('simple string');
  });
});

// ── String util tests ──
describe('escapeExtendScriptString', () => {
  it('escapes backslashes first', () => {
    expect(escapeExtendScriptString('a\\b')).toBe('a\\\\b');
  });

  it('escapes double quotes for double-quoted literals', () => {
    expect(escapeExtendScriptString('say "hi"')).toBe('say \\"hi\\"');
  });

  it('escapes newlines and carriage returns', () => {
    expect(escapeExtendScriptString('line1\nline2\rline3')).toBe('line1\\nline2\\rline3');
  });

  it('handles CRLF sequences', () => {
    expect(escapeExtendScriptString('a\r\nb')).toBe('a\\r\\nb');
  });

  it('leaves safe text untouched', () => {
    expect(escapeExtendScriptString('Ciao mondo 123!')).toBe('Ciao mondo 123!');
  });

  it('never produces an early string terminator (injection-style input)', () => {
    const evil = 'x"; app.quit(); "';
    const out = escapeExtendScriptString(evil);
    expect(out).not.toMatch(/(^|[^\\])"/);
  });

  it('handles lone trailing backslash', () => {
    expect(escapeExtendScriptString('path\\')).toBe('path\\\\');
  });
});

describe('sanitizeCode', () => {
  it('should block require("fs")', () => {
    expect(sanitizeCode('require("fs")')).toContain('/* blocked */');
  });

  it('should block process.exit', () => {
    expect(sanitizeCode('process.exit(0)')).toContain('/* blocked */');
  });

  it('should allow safe code', () => {
    const safe = 'app.documents.add();';
    expect(sanitizeCode(safe)).toBe(safe);
  });
});

describe('truncate', () => {
  it('should return string as-is if under max length', () => {
    expect(truncate('short')).toBe('short');
  });

  it('should truncate with ellipsis', () => {
    const long = 'a'.repeat(100);
    expect(truncate(long, 10)).toBe('a'.repeat(10) + '...');
  });
});

describe('toUpperCaseFirst', () => {
  it('should capitalize first letter', () => {
    expect(toUpperCaseFirst('hello')).toBe('Hello');
  });

  it('should handle empty string', () => {
    expect(toUpperCaseFirst('')).toBe('');
  });
});

// ── Schema tests ──
describe('createDocumentSchema', () => {
  it('should apply defaults', () => {
    const result = createDocumentSchema.parse({ width: 300, height: 400 });
    expect(result.width).toBe(300);
    expect(result.height).toBe(400);
    expect(result.pages).toBe(1);
    expect(result.facingPages).toBe(false);
    expect(result.orientation).toBe('portrait');
    expect(result.margins).toEqual({ top: 12, bottom: 12, left: 12, right: 12 });
  });

  it('should validate positive dimensions', () => {
    expect(() => createDocumentSchema.parse({ width: 0, height: 100 })).toThrow();
  });
});

describe('pageSchema', () => {
  it('should validate with required index', () => {
    expect(() => pageSchema.parse({})).toThrow();
    expect(pageSchema.parse({ index: 0 }).index).toBe(0);
  });

  it('should accept optional properties', () => {
    const result = pageSchema.parse({ index: 1, properties: { label: 'cover' } });
    expect(result.properties?.label).toBe('cover');
  });
});

describe('exportDocumentSchema', () => {
  it('should validate format enum', () => {
    expect(() => exportDocumentSchema.parse({ format: 'exe' })).toThrow();
    expect(exportDocumentSchema.parse({ format: 'pdf' }).format).toBe('pdf');
  });
});

// ── Enum tests ──
describe('enums', () => {
  it('should have expected export formats', () => {
    expect(ExportFormat.pdfType).toBe('pdfType');
    expect(ExportFormat.jpgType).toBe('jpgType');
    expect(ExportFormat.packageType).toBe('packageType');
  });

  it('should have page orientations', () => {
    expect(PageOrientation.portrait).toBe('portrait');
    expect(PageOrientation.landscape).toBe('landscape');
  });
});
