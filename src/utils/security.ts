/**
 * Security utilities for input validation and sanitization.
 *
 * Inspired by Premiere Pro MCP's security.ts pattern.
 * Protects against path traversal, injection, and abuse via MCP tool calls.
 */

import { normalize, isAbsolute, resolve, relative, sep } from 'path';

/**
 * Sanitizes string input to prevent injection attacks.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  return input
    .replace(/[\x00-\x1F\x7F]/g, '')       // Remove control characters
    .slice(0, 10000);                         // Limit length to prevent DoS
}

/**
 * Forbidden system directories that no file operation should access.
 */
const FORBIDDEN_SYSTEM_DIRS: string[] = [
  '/etc',
  '/System',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/var/root',
  '/private/etc',
  '/dev',
  '/proc',
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
  'C:\\Windows\\System',
  'C:\\Windows\\WinSxS',
];

/**
 * Validates file paths to prevent path traversal attacks.
 * Returns { valid, normalized?, error? }
 */
export function validateFilePath(
  filePath: string,
  allowedDirs?: string[],
): { valid: boolean; normalized?: string; error?: string } {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, error: 'Path must be a non-empty string' };
    }

    // Convert to absolute path
    const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);

    // Normalize to prevent ../ attacks
    const normalizedPath = normalize(absolutePath);

    // Check for path traversal attempts (after normalization)
    if (normalizedPath.includes('..' + sep) || normalizedPath.includes(sep + '..')) {
      return { valid: false, error: 'Path traversal detected' };
    }

    // Check for null bytes
    if (normalizedPath.includes('\0')) {
      return { valid: false, error: 'Null byte in path' };
    }

    // Block access to system directories
    for (const forbidden of FORBIDDEN_SYSTEM_DIRS) {
      if (normalizedPath.toLowerCase().startsWith(normalize(forbidden).toLowerCase())) {
        return { valid: false, error: 'Access to system directories is forbidden' };
      }
    }

    // If allowed directories specified, check if path is within them
    if (allowedDirs && allowedDirs.length > 0) {
      const isAllowed = allowedDirs.some((allowedDir) => {
        const normalizedAllowed = normalize(resolve(allowedDir));
        // Compare via relative(): on win32 a drive-less path (e.g. \home\docs)
        // resolves onto the allowed dir's drive, so a `..`-free relative result
        // proves containment without drive-letter mismatch (C:\... vs \...).
        const rel = relative(normalizedAllowed, normalizedPath);
        return (
          rel === '' ||
          (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
        );
      });
      if (!isAllowed) {
        return { valid: false, error: 'Path not in allowed directories' };
      }
    }

    return { valid: true, normalized: normalizedPath };
  } catch (error) {
    return {
      valid: false,
      error: `Path validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validates a project/document name.
 */
export function validateDocumentName(
  name: string,
): { valid: boolean; sanitized?: string; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Document name must be a non-empty string' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Document name cannot be empty' };
  }
  if (trimmed.length > 255) {
    return { valid: false, error: 'Document name too long (max 255 characters)' };
  }
  // Block invalid filename characters
  const invalidChars = /[<>:"|?*\x00-\x1F]/;
  if (invalidChars.test(trimmed)) {
    return { valid: false, error: 'Document name contains invalid characters' };
  }
  return { valid: true, sanitized: sanitizeInput(trimmed) };
}

/**
 * Validates numeric input with optional bounds.
 */
export function validateNumber(
  value: unknown,
  min?: number,
  max?: number,
): { valid: boolean; value?: number; error?: string } {
  const num = Number(value);
  if (isNaN(num)) return { valid: false, error: 'Value must be a number' };
  if (!isFinite(num)) return { valid: false, error: 'Value must be finite' };
  if (min !== undefined && num < min) return { valid: false, error: `Value must be >= ${min}` };
  if (max !== undefined && num > max) return { valid: false, error: `Value must be <= ${max}` };
  return { valid: true, value: num };
}

/**
 * Validates array input with optional max length.
 */
export function validateArray(
  value: unknown,
  maxLength?: number,
): { valid: boolean; error?: string } {
  if (!Array.isArray(value)) return { valid: false, error: 'Value must be an array' };
  if (maxLength !== undefined && value.length > maxLength) {
    return { valid: false, error: `Array too long (max ${maxLength} items)` };
  }
  return { valid: true };
}

/**
 * Validates a color value (hex, rgb, rgba, or named color).
 */
export function validateColor(color: string): { valid: boolean; error?: string } {
  if (typeof color !== 'string') return { valid: false, error: 'Color must be a string' };

  // Hex colors
  if (/^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color)) {
    return { valid: true };
  }

  // Named colors
  if (/^(red|green|blue|yellow|white|black|gray|grey|orange|purple|pink|cyan|magenta|none)$/i.test(color)) {
    return { valid: true };
  }

  // RGB — validate each value is 0-255
  const rgbMatch = color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if (r <= 255 && g <= 255 && b <= 255) return { valid: true };
    return { valid: false, error: 'RGB values must be between 0 and 255' };
  }

  // RGBA — validate each value is 0-255
  const rgbaMatch = color.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/);
  if (rgbaMatch) {
    const r = Number(rgbaMatch[1]);
    const g = Number(rgbaMatch[2]);
    const b = Number(rgbaMatch[3]);
    if (r <= 255 && g <= 255 && b <= 255) return { valid: true };
    return { valid: false, error: 'RGBA values must be between 0 and 255' };
  }

  return { valid: false, error: 'Invalid color format' };
}

/**
 * Validates an ExtendScript code string — blocks dangerous patterns.
 */
export function validateScriptCode(code: string): { valid: boolean; error?: string } {
  if (typeof code !== 'string' || code.length === 0) {
    return { valid: false, error: 'Script code must be a non-empty string' };
  }
  if (code.length > 50000) {
    return { valid: false, error: 'Script code too long (max 50000 characters)' };
  }
  // Block dangerous ExtendScript patterns
  const dangerousPatterns = [
    /\bFile\.openDialog\b/,
    /\bFile\.saveDialog\b/,
    /\bapp\.doScript\b/,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return { valid: false, error: 'Script contains blocked dialog/open operations' };
    }
  }
  return { valid: true };
}

/**
 * Rate limiter to prevent abuse per-identifier.
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number = 100, windowMs: number = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  check(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const existing = this.requests.get(identifier) || [];
    const recent = existing.filter((t) => t > windowStart);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    this.requests.set(identifier, recent);
    if (Math.random() < 0.01) this.cleanup();
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [id, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter((t) => t > windowStart);
      if (recent.length === 0) this.requests.delete(id);
      else this.requests.set(id, recent);
    }
  }

  reset(identifier: string): void {
    this.requests.delete(identifier);
  }
}

/**
 * Audit logger for security events.
 */
export class AuditLogger {
  private logs: Array<{ timestamp: Date; event: string; details: unknown }> = [];
  private readonly maxLogs: number;

  constructor(maxLogs: number = 1000) {
    this.maxLogs = maxLogs;
  }

  log(event: string, details: unknown = {}): void {
    this.logs.push({ timestamp: new Date(), event, details });
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    // Always write security events to stderr
    process.stderr.write(`[SECURITY] ${event} ${JSON.stringify(details)}\n`);
  }

  getLogs(count?: number): Array<{ timestamp: Date; event: string; details: unknown }> {
    return count ? this.logs.slice(-count) : [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }
}
