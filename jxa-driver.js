/**
 * JXA driver — run inside osascript (-l JavaScript) by bridge-proxy.mjs.
 *
 * Reads the ExtendScript from a temp file (no shell quoting anywhere) and
 * executes it in InDesign via app.doScript. Reports InDesign-side failures
 * as { __bridge_error: "..." } JSON on stdout, which the proxy forwards as
 * a canonical type:'error' response.
 */
ObjC.import('Foundation');

function readFile(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  return ObjC.unwrap(s);
}

function run(argv) {
  var scriptPath = argv[0];
  var appName = argv[1] || 'Adobe InDesign 2026';
  var code;
  try {
    code = readFile(scriptPath);
  } catch (e) {
    return JSON.stringify({ __bridge_error: 'cannot read script file: ' + String(e) });
  }
  if (!code) return JSON.stringify({ __bridge_error: 'empty script file' });

  var app = Application(appName);
  try {
    var r = app.doScript(code, { language: 'javascript' });
    if (r === null || r === undefined) return '';
    // Wrapped tool scripts return strings (JSON.stringify output), but be
    // defensive: String(object) would produce '[object Object]'.
    if (typeof r === 'object') return JSON.stringify(r);
    return String(r);
  } catch (e) {
    return JSON.stringify({ __bridge_error: String((e && e.message) || e) });
  }
}
