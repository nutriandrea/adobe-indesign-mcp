export function escapeExtendScriptString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

export function escapeJsxString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

export function sanitizeCode(code: string): string {
  const dangerous = [
    /require\(['"]fs['"]\)/g,
    /require\(['"]child_process['"]\)/g,
    /require\(['"]net['"]\)/g,
    /\bprocess\.exit\b/g,
    /\bprocess\.kill\b/g,
    /\bexec\(/g,
    /\bspawn\(/g,
    /\bfork\(/g,
    /\beval\s*\(/g,
    /\bFunction\s*\(/g,
  ];

  let sanitized = code;
  for (const pattern of dangerous) {
    sanitized = sanitized.replace(pattern, '/* blocked */');
  }
  return sanitized;
}

export function truncate(str: string, maxLen: number = 1000): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

export function toUpperCaseFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
