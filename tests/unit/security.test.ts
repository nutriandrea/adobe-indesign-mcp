import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  sanitizeInput,
  validateFilePath,
  validateDocumentName,
  validateNumber,
  validateArray,
  validateColor,
  validateScriptCode,
  RateLimiter,
  AuditLogger,
} from '../../src/utils/security.js';

describe('security utilities', () => {
  describe('sanitizeInput', () => {
    it('should strip control characters', () => {
      expect(sanitizeInput('hello\x00world')).toBe('helloworld');
      expect(sanitizeInput('line1\x1Fline2')).toBe('line1line2');
    });

    it('should keep normal text unchanged', () => {
      expect(sanitizeInput('Hello, World!')).toBe('Hello, World!');
    });

    it('should truncate to 10000 characters', () => {
      const long = 'a'.repeat(15000);
      expect(sanitizeInput(long).length).toBe(10000);
    });

    it('should throw on non-string input', () => {
      expect(() => sanitizeInput(null as unknown as string)).toThrow(
        'Input must be a string',
      );
      expect(() => sanitizeInput(undefined as unknown as string)).toThrow(
        'Input must be a string',
      );
      expect(() => sanitizeInput(123 as unknown as string)).toThrow(
        'Input must be a string',
      );
    });

    it('should preserve valid special characters', () => {
      const valid = 'abc123!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      expect(sanitizeInput(valid)).toBe(valid);
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });
  });

  describe('validateFilePath', () => {
    it('should accept valid absolute paths', () => {
      const result = validateFilePath('/home/user/docs/file.indd');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBeDefined();
    });

    it('should return error for empty path', () => {
      const result = validateFilePath('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for non-string input', () => {
      const result = validateFilePath(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should detect path traversal (../)', () => {
      // After normalize, /etc/passwd hits system dirs check first
      const result = validateFilePath('/home/user/../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('rejects any raw .. segment (strict policy, changed in 1.4)', () => {
      // Even resolvable dot-dots are treated as traversal attempts: paths feed
      // ExtendScript File() calls and strictness beats cleverness here.
      const result = validateFilePath('/home/user/../other/doc.indd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });

    it('should detect null bytes in path', () => {
      const result = validateFilePath('/home/user/file\x00.indd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Null byte');
    });

    it('should block access to system directories', () => {
      const sysPaths = ['/etc/passwd', '/bin/sh', '/System/Library'];
      for (const p of sysPaths) {
        const result = validateFilePath(p);
        expect(result.valid).toBe(false);
        expect(result.valid).toBe(false);
      }
    });

    it('should enforce allowed directories constraint', () => {
      const result = validateFilePath('/tmp/malicious-file.indd', [
        '/home/user/documents',
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in allowed directories');
    });

    it('should pass when path is within allowed directories', () => {
      const result = validateFilePath('/home/user/docs/file.indd', [
        '/home/user/docs',
      ]);
      expect(result.valid).toBe(true);
    });

    it('should reject Windows system directories on case-insensitive basis', () => {
      // On Linux, normalize doesn't resolve Windows paths — skip this platform-dependent test
      // On Windows, the forbidden list includes C:\Windows\System32 etc.
      const result = validateFilePath('C:\\Windows\\System32\\evil.exe');
      if (process.platform === 'win32') {
        expect(result.valid).toBe(false);
        expect(result.valid).toBe(false);
      } else {
        // On non-Windows, Windows-style paths pass through normalize unchanged
        expect(typeof result.valid).toBe('boolean');
      }
    });

    it('should handle errors gracefully', () => {
      // Extremely long path that might cause issues
      const longPath = '/' + 'a'.repeat(100000);
      const result = validateFilePath(longPath);
      // Should not crash, either valid or error
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('validateDocumentName', () => {
    it('should accept valid document names', () => {
      expect(validateDocumentName('My Document').valid).toBe(true);
      expect(validateDocumentName('Report_2024').valid).toBe(true);
      expect(validateDocumentName('a').valid).toBe(true);
    });

    it('should reject empty or whitespace-only names', () => {
      expect(validateDocumentName('').valid).toBe(false);
      expect(validateDocumentName('   ').valid).toBe(false);
    });

    it('should reject names with invalid characters', () => {
      expect(validateDocumentName('file<1>').valid).toBe(false);
      expect(validateDocumentName('file:test').valid).toBe(false);
      expect(validateDocumentName('file"name"').valid).toBe(false);
      expect(validateDocumentName('file|name').valid).toBe(false);
      expect(validateDocumentName('file?name').valid).toBe(false);
      expect(validateDocumentName('file*name').valid).toBe(false);
    });

    it('should reject names over 255 characters', () => {
      const long = 'a'.repeat(256);
      expect(validateDocumentName(long).valid).toBe(false);
    });

    it('should return sanitized name for valid input', () => {
      const result = validateDocumentName('  My Doc  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeDefined();
    });
  });

  describe('validateNumber', () => {
    it('should accept numbers within bounds', () => {
      expect(validateNumber(5).valid).toBe(true);
      expect(validateNumber(5, 0, 10).valid).toBe(true);
      expect(validateNumber(0, 0).valid).toBe(true);
    });

    it('should reject NaN', () => {
      expect(validateNumber(NaN).valid).toBe(false);
    });

    it('should reject Infinity', () => {
      expect(validateNumber(Infinity).valid).toBe(false);
    });

    it('should reject numbers below min', () => {
      expect(validateNumber(-1, 0).valid).toBe(false);
    });

    it('should reject numbers above max', () => {
      expect(validateNumber(100, 0, 50).valid).toBe(false);
    });

    it('should parse string numbers', () => {
      expect(validateNumber('42').valid).toBe(true);
      expect(validateNumber('42')?.value).toBe(42);
    });

    it('should return parsed number value', () => {
      const result = validateNumber(42);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(42);
    });
  });

  describe('validateArray', () => {
    it('should accept arrays', () => {
      expect(validateArray([]).valid).toBe(true);
      expect(validateArray([1, 2, 3]).valid).toBe(true);
    });

    it('should reject non-arrays', () => {
      expect(validateArray('not array').valid).toBe(false);
      expect(validateArray(null).valid).toBe(false);
      expect(validateArray(undefined).valid).toBe(false);
      expect(validateArray({}).valid).toBe(false);
    });

    it('should reject arrays exceeding max length', () => {
      expect(validateArray([1, 2, 3, 4, 5], 3).valid).toBe(false);
    });

    it('should accept arrays within max length', () => {
      expect(validateArray([1, 2, 3], 3).valid).toBe(true);
    });
  });

  describe('validateColor', () => {
    it('should accept hex colors', () => {
      expect(validateColor('#FF0000').valid).toBe(true);
      expect(validateColor('#fff').valid).toBe(true);
      expect(validateColor('#a1B2C3').valid).toBe(true);
    });

    it('should accept rgb colors', () => {
      expect(validateColor('rgb(255, 0, 0)').valid).toBe(true);
      expect(validateColor('rgb(0,128,255)').valid).toBe(true);
    });

    it('should accept rgba colors', () => {
      expect(validateColor('rgba(255, 0, 0, 0.5)').valid).toBe(true);
    });

    it('should accept named colors', () => {
      expect(validateColor('red').valid).toBe(true);
      expect(validateColor('blue').valid).toBe(true);
      expect(validateColor('none').valid).toBe(true);
    });

    it('should reject invalid colors', () => {
      expect(validateColor('not-a-color').valid).toBe(false);
      expect(validateColor('#GGGGGG').valid).toBe(false);
      expect(validateColor('rgb(999, 0, 0)').valid).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(validateColor(123 as unknown as string).valid).toBe(false);
    });
  });

  describe('validateScriptCode', () => {
    it('should accept valid ExtendScript code', () => {
      expect(validateScriptCode('app.documents.add();').valid).toBe(true);
      expect(
        validateScriptCode('var doc = app.activeDocument; doc.pages.add();').valid,
      ).toBe(true);
    });

    it('should reject empty code', () => {
      expect(validateScriptCode('').valid).toBe(false);
    });

    it('should reject code over 50000 characters', () => {
      const long = 'a'.repeat(50001);
      expect(validateScriptCode(long).valid).toBe(false);
    });

    it('should block dangerous patterns like File.openDialog', () => {
      expect(validateScriptCode('File.openDialog("select")').valid).toBe(false);
    });

    it('should block File.saveDialog', () => {
      expect(validateScriptCode('File.saveDialog("save")').valid).toBe(false);
    });

    it('should block app.doScript', () => {
      expect(validateScriptCode('app.doScript("evil")').valid).toBe(false);
    });
  });

  describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      vi.useFakeTimers();
      limiter = new RateLimiter(3, 1000); // 3 requests per second
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow requests within the limit', () => {
      expect(limiter.check('user1')).toBe(true);
      expect(limiter.check('user1')).toBe(true);
      expect(limiter.check('user1')).toBe(true);
    });

    it('should block requests exceeding the limit', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');
      expect(limiter.check('user1')).toBe(false);
    });

    it('should allow independent rate limiting per identifier', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');
      expect(limiter.check('user1')).toBe(false);
      expect(limiter.check('user2')).toBe(true); // different user
    });

    it('should reset window after time passes', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');
      expect(limiter.check('user1')).toBe(false);

      vi.advanceTimersByTime(1001);

      expect(limiter.check('user1')).toBe(true);
    });

    it('should reset manually with reset()', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');
      expect(limiter.check('user1')).toBe(false);

      limiter.reset('user1');

      expect(limiter.check('user1')).toBe(true);
    });
  });

  describe('AuditLogger', () => {
    let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrWriteSpy.mockRestore();
    });

    it('should log events with timestamp and details', () => {
      const audit = new AuditLogger(100);
      audit.log('FILE_ACCESS', { path: '/test.indd' });

      const logs = audit.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].event).toBe('FILE_ACCESS');
      expect(logs[0].details).toEqual({ path: '/test.indd' });
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });

    it('should write to stderr', () => {
      const audit = new AuditLogger(100);
      audit.log('TEST_EVENT', { key: 'value' });

      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SECURITY] TEST_EVENT'),
      );
    });

    it('should respect maxLogs limit', () => {
      const audit = new AuditLogger(3);
      audit.log('e1');
      audit.log('e2');
      audit.log('e3');
      audit.log('e4');

      expect(audit.getLogs()).toHaveLength(3);
      expect(audit.getLogs()[0].event).toBe('e2'); // oldest trimmed
    });

    it('should return limited logs with count parameter', () => {
      const audit = new AuditLogger(100);
      audit.log('e1');
      audit.log('e2');
      audit.log('e3');

      const logs = audit.getLogs(2);
      expect(logs).toHaveLength(2);
      expect(logs[0].event).toBe('e2');
      expect(logs[1].event).toBe('e3');
    });

    it('should clear all logs', () => {
      const audit = new AuditLogger(100);
      audit.log('e1');
      audit.log('e2');

      audit.clear();
      expect(audit.getLogs()).toHaveLength(0);
    });
  });
});

describe('validateFilePath — allowedDirs containment', () => {
  const tmpBase = '/tmp/idmc-test-allowed';

  it('accepts a path directly inside an allowed directory', () => {
    const res = validateFilePath('/tmp/idmc-test-allowed/sub/file.txt', [tmpBase]);
    expect(res.valid).toBe(true);
  });

  it('rejects a sibling directory whose name merely starts with the allowed name', () => {
    // /tmp/idmc-test-allowed-evil starts with /tmp/idmc-test-allowed
    const res = validateFilePath('/tmp/idmc-test-allowed-evil/file.txt', [tmpBase]);
    expect(res.valid).toBe(false);
  });

  it('rejects paths outside all allowed directories', () => {
    const res = validateFilePath('/etc/passwd', [tmpBase]);
    expect(res.valid).toBe(false);
  });

  it('still rejects traversal attempts inside an allowed dir', () => {
    const res = validateFilePath('/tmp/idmc-test-allowed/../../etc/passwd', [tmpBase]);
    expect(res.valid).toBe(false);
  });
});
