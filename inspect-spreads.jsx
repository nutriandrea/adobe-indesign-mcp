var doc = app.documents[0];
var out = [];
out.push('DOC pages: ' + doc.pages.length);
out.push('DOC spreads: ' + doc.spreads.length);
for (var s = 0; s < Math.min(doc.spreads.length, 10); s++) {
  var sp = doc.spreads[s];
  var pgNames = [];
  var pgBounds = [];
  for (var p = 0; p < sp.pages.length; p++) {
    pgNames.push(sp.pages[p].name);
    var b = sp.pages[p].bounds;
    pgBounds.push(b[0].toFixed(1) + ',' + b[1].toFixed(1) + ',' + b[2].toFixed(1) + ',' + b[3].toFixed(1));
  }
  out.push('Spread ' + s + ' [' + sp.pages.length + 'p]: ' + pgNames.join(',') + ' | bounds: ' + pgBounds.join(' ; '));
}
out.join('\n');