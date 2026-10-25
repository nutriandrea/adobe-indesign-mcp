import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * The VBScript that ComScriptExecutor spawns on Windows. CI has no Windows
 * host, so these tests pin the encoding contract in the shipped bytes: the
 * .jsx must be read as UTF-8 (the executor writes it as UTF-8) and nothing
 * above U+007F may reach cscript's ANSI stdout unescaped. Both were broken
 * once and only showed up as mojibake inside InDesign.
 */
const VBS_PATH = fileURLToPath(
  new URL('../../assets/windows/run_jsx_persistent.vbs', import.meta.url),
);
const bytes = readFileSync(VBS_PATH);
const source = bytes.toString('latin1');

describe('assets/windows/run_jsx_persistent.vbs', () => {
  it('reads the .jsx as UTF-8 through ADODB.Stream, not FileSystemObject', () => {
    // FileSystemObject.OpenTextFile decodes the file with the system ANSI code
    // page, so "Yayınları" written as UTF-8 reached InDesign as "YayÄ±nlarÄ±".
    expect(source).toContain('CreateObject("ADODB.Stream")');
    expect(source).toMatch(/\.Charset = "utf-8"/i);
    // The header comment may name the old API; the call must be gone.
    expect(source).not.toMatch(/OpenTextFile\(/);
  });

  it('escapes non-ASCII characters on every stdout line', () => {
    // cscript writes stdout in the ANSI code page, so the result and both
    // error branches must go through the escaper before WriteLine.
    expect(source).toContain('WriteLine EscapeNonAscii(CStr(result))');
    expect(source).toContain('WriteLine "ERROR: " & EscapeNonAscii(Err.Description)');
    expect(source).toContain('"\\u" & Right("0000" & Hex(c), 4)');
    // No raw result may be written any more.
    expect(source).not.toMatch(/WriteLine result\b/);
    expect(source).not.toContain('WriteLine "ERROR: " & Err.Description');
  });

  it('is pure ASCII, because cscript reads the .vbs itself as ANSI', () => {
    // An em dash in a string literal would be echoed as three garbage bytes.
    const offending = [...bytes].findIndex((b) => b > 0x7f);
    expect(offending, `byte ${offending} is above 0x7F`).toBe(-1);
  });

  it('keeps the stdin/stdout protocol ComScriptExecutor depends on', () => {
    expect(source).toContain('WScript.StdIn.ReadLine()');
    expect(source).toContain('inDesign.DoScript(jsxText, JAVASCRIPT_LANG)');
    expect(source).toContain('WriteLine "ERROR: Script file not found: " & line');
  });
});
