# Windows Setup

On Windows you have two options:

## Option A — UXP plugin (default, same as macOS)
Follow the main README: load `plugin/` in UXP Developer Tool and connect.
The WebSocket bridge works identically on Windows.

## Option B — COM bridge (no plugin needed)
Drives InDesign via COM automation (`cscript` + `DoScript`) — no UXP Developer
Tool required. Requires InDesign to be **running** on the same machine.

1. Enable it before starting the server:
   ```powershell
   $env:COM_BRIDGE_ENABLED = 'true'
   node dist\index.js
   ```
2. Optional overrides: `COM_BRIDGE_CSCRIPT_PATH`, `COM_BRIDGE_VBS_PATH`
   (defaults: `cscript`, bundled `assets/windows/run_jsx_persistent.vbs`).
3. Start InDesign first — the bridge attaches to the running instance
   (`GetObject`), or launches one via `CreateObject` if none is open.

Notes:
- User interaction prompts are suppressed automatically (`userInteractionLevel
  = NEVER_INTERACT`) so modal dialogs can never hang a tool call.
- Requests execute one at a time (FIFO) through a single persistent script
  host — startup cost is paid once, not per tool call.
- Text is UTF-8 end to end. The script host reads the generated `.jsx` as
  UTF-8 and escapes every character above U+007F in its output as `\uXXXX`,
  because `cscript` reads and writes in the system ANSI code page. The escape
  is valid inside the JSON every tool returns and is decoded on error lines;
  only a raw `script_run` script that returns a bare non-JSON string will show
  the escapes literally.

## Verification status — stated plainly

The macOS path is exercised end to end against a running InDesign by
`npm run smoke:macos` and `npm run smoke:recipes`. **The COM path has no such
suite.** This repo has no Windows host, so everything COM-specific is covered by
unit tests that assert the platform branch and pin the contract of the shipped
`.vbs` — which is not the same as a live `cscript` + InDesign run. It has been
run live once outside this repo, by a contributor on Windows 11 with InDesign
2026 (2026-10-23): tool calls return, non-ASCII text (Turkish) round-trips into
the document and back intact, and a PDF exported through the bridge shows the
right glyphs. That run is also what found the encoding bug below. Treat Option
B as *shipped, exercised once elsewhere, not covered by a smoke suite*:

- The macOS-only invariants still hold for it (`ComScriptExecutor` shares
  `wrapExtendScript` and the same sanitizer), the bridge refuses to start on a
  non-Windows host, and it stays off unless you set `COM_BRIDGE_ENABLED=true`.
- The operational notes above (a hung script wedges the bridge with no way out;
  `fontFamily`, `italic`, `weight` throw under COM; InDesign must be visibly
  running) come from [@graydini](https://github.com/graydini)'s branch. They are
  recorded because they are real observations from someone who ran it, not
  because they were reproduced here.
- Until the UTF-8 fix, the script host read the `.jsx` with
  `FileSystemObject.OpenTextFile`, which decodes in the system ANSI code page,
  while `ComScriptExecutor` writes it as UTF-8. Every non-ASCII character
  reached InDesign as mojibake (`Yayınları` became `YayÄ±nlarÄ±` in the
  document and in the exported PDF), and because `cscript`'s ANSI stdout
  reversed the damage on the way back, the tool result looked correct. The
  same probe script reports a string length of 24 through the old script and
  16 — the true length — through the fixed one.

If you run Option B on a real Windows host, the thing still worth reporting is
whether a wedged script can be recovered without restarting InDesign.

## Reproduce the UTF-8 check for issue #48

Run these steps in PowerShell from this checkout. You need Node.js 18+, Git,
and a licensed Adobe InDesign installation. Open InDesign first and dismiss any
startup dialogs. The probe creates one unsaved document and leaves it open for
visual inspection; it does not edit or close existing documents.

1. Install and build, then run the bridge regression tests:

   ```powershell
   npm ci
   npm run build
   npx vitest run tests/unit/ComScriptExecutor.test.ts tests/unit/comBridgeScript.test.ts
   ```

2. Exercise the actual shipped VBScript reader and InDesign COM connection.
   Paste the entire block below into PowerShell. It writes the same UTF-8 bytes
   as the executor, then sends the file path to the persistent bridge. Checking
   numeric character codes inside InDesign avoids the false positive where ANSI
   corruption on stdout reverses the corruption on input.

   ```powershell
   $probe = [System.IO.Path]::GetTempFileName()
   $jsx = @'
   (function () {
       var doc = app.documents.add();
       var frame = doc.pages[0].textFrames.add();
       frame.geometricBounds = [20, 20, 100, 180];
       frame.contents = "Grüße aus Köln, 9,99 €";
       var text = frame.contents;
       var codes = [];
       for (var i = 0; i < text.length; i++) codes.push(text.charCodeAt(i));
       return '{"length":' + text.length + ',"codes":[' + codes.join(',') + ']}';
   }());
   '@
   try {
       [System.IO.File]::WriteAllText($probe, $jsx, [System.Text.UTF8Encoding]::new($false))
       $output = $probe | & cscript.exe //nologo .\assets\windows\run_jsx_persistent.vbs
       if ($LASTEXITCODE -ne 0) { throw "cscript failed: $output" }
       $result = $output | ConvertFrom-Json
       $expected = '71,114,252,223,101,32,97,117,115,32,75,246,108,110,44,32,57,44,57,57,32,8364'
       if ($result.length -ne 22 -or ($result.codes -join ',') -ne $expected) {
           throw "Unicode mismatch: $output"
       }
       Write-Host 'PASS: InDesign received the exact Unicode character codes.'
   } finally {
       Remove-Item -LiteralPath $probe
   }
   ```

3. Inspect the new document in InDesign. The frame must show
   **Grüße aus Köln, 9,99 €**, without `GrÃ¼ÃŸe` or `â‚¬`. Export a PDF through
   InDesign and inspect it too; use a font containing the required glyphs.
   Close only the probe document without saving when finished.

4. To verify the MCP route as well, configure your MCP client to launch
   `node` with the absolute path to `dist/index.js` and environment
   `COM_BRIDGE_ENABLED=true`. Restart the client/server after updating the
   checkout so it cannot reuse an older persistent bridge. Ask it to create a
   new document and use `text_addFrame` with the same text, then `text_setContent`
   with that text again. Inspect the document and exported PDF, rather than
   relying only on `text_getTextFrames` output.

These live Windows steps are manual and have not been executed in the Linux
development environment. Report the commit, Windows and InDesign versions,
probe output, and visual/PDF result when recording a live run.

Credits: COM approach pioneered by [@graydini](https://github.com/graydini)
in PR #1; this implementation keeps the macOS default path untouched by being
strictly opt-in.
