import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const pluginPath = fileURLToPath(new URL('../../plugin/index.js', import.meta.url));

const EXTRACT_SCRIPT = `
  const fs = require('fs');
  const src = fs.readFileSync(${JSON.stringify(pluginPath)}, 'utf8');
  const startMarker = 'const DOC_SIGNATURE_SCRIPT =';
  const endMarker = "'})()';";
  const start = src.indexOf(startMarker);
  if (start === -1) { console.error('DOC_SIGNATURE_SCRIPT declaration not found'); process.exit(2); }
  const exprStart = src.indexOf('=', start) + 1;
  const end = src.indexOf(endMarker, start);
  if (end === -1) { console.error('DOC_SIGNATURE_SCRIPT end not found'); process.exit(2); }
  process.stdout.write(eval(src.slice(exprStart, end + endMarker.length)));
`;

describe('plugin bundle', () => {
  it('is valid JavaScript (parses cleanly)', () => {
    expect(() =>
      execFileSync(process.execPath, ['--check', pluginPath], { stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('builds an ES3-safe signature script (no JSON object, no backslash literals)', () => {
    const script = execFileSync(process.execPath, ['-e', EXTRACT_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();

    expect(script.length).toBeGreaterThan(50);
    expect(script).toContain('app.documents.length');
    expect(script).not.toContain('JSON.stringify');
    expect(script).not.toMatch(/\\\\/);
  });
});

