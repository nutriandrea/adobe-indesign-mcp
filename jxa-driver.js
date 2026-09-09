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
    return String(r);
  } catch (e) {
    return JSON.stringify({ __bridge_error: String((e && e.message) || e) });
  }
}
