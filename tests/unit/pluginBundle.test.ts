import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const pluginPath = fileURLToPath(new URL('../../plugin/index.js', import.meta.url));
const pluginHtmlPath = fileURLToPath(new URL('../../plugin/index.html', import.meta.url));
const pluginSource = readFileSync(pluginPath, 'utf8');
const pluginHtml = readFileSync(pluginHtmlPath, 'utf8');

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

  it('auto-connects on panel load, with no hardcoded URL in onDOMReady', () => {
    // onDOMReady() must call connect() with the shared resolver.
    const onDOMReady = pluginSource.slice(
      pluginSource.indexOf('function onDOMReady()'),
      pluginSource.indexOf('// UXP panels fire DOMContentLoaded'),
    );
    expect(onDOMReady).toContain('connect(currentServerUrl())');
    expect(onDOMReady).not.toMatch(/ws:\/\//);
  });

  it('keeps the default server URL identical in code, HTML and the JXA proxy', () => {
    const declared = pluginSource.match(/DEFAULT_SERVER_URL = '(ws:\/\/[^']+)'/)?.[1];
    expect(declared, 'plugin/index.js must declare DEFAULT_SERVER_URL').toBeTruthy();

    // The panel input defaults to the same URL, so auto-connect needs no input.
    expect(pluginHtml).toContain(`value="${declared}"`);

    // ...and the standalone proxy defaults to it too.
    const proxySource = readFileSync(
      fileURLToPath(new URL('../../bridge-proxy.mjs', import.meta.url)),
      'utf8',
    );
    expect(proxySource).toContain(`'${declared.replace('localhost', '127.0.0.1')}'`);
  });

  it('answers requests with the canonical result/error frame types', () => {
    expect(pluginSource).toContain("type: 'result'");
    expect(pluginSource).toContain("type: 'error'");
    // Legacy alias names must not be reintroduced as response types.
    expect(pluginSource).not.toMatch(/type: '(success|response)'/);
  });
});

