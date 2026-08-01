/**
 * Shared ExtendScript helpers injected into every script executed in InDesign.
 *
 * Inspired by Premiere Pro MCP's EXTENDSCRIPT_HELPERS pattern.
 * Eliminates DOM traversal boilerplate across all 22 handlers.
 *
 * Every helper is prefixed with `__` to avoid collisions with InDesign's DOM.
 * These are injected via ScriptExecutor before every script execution.
 */
export const EXTENDSCRIPT_HELPERS = `
// ── InDesign version compatibility (read-only safe) ──
// InDesign 2026 renames ColorModel.PROCESS_RGB / PROCESS_CMYK to ColorModel.PROCESS.
// Enum objects are READ-ONLY in 2026, so we never assign to them; we compute a
// plain-number constant by READING whichever property exists.
var __PROCESS_COLOR_MODEL = 1886548851;
try {
  if (typeof ColorModel !== 'undefined') {
    if (ColorModel.PROCESS !== undefined) __PROCESS_COLOR_MODEL = ColorModel.PROCESS;
    else if (ColorModel.PROCESS_RGB !== undefined) __PROCESS_COLOR_MODEL = ColorModel.PROCESS_RGB;
  }
} catch (e) {}

// InDesign 2026 renames AnchorPoint.TOP_LEFT → AnchorPoint.TOP_LEFT_ANCHOR etc.
// Enum objects are READ-ONLY in 2026, so never assign; resolve by READING.
var __ANCHOR_POINT = function (name) {
  var ap = (typeof AnchorPoint !== 'undefined') ? AnchorPoint : {};
  if (ap[name + '_ANCHOR'] !== undefined) return ap[name + '_ANCHOR'];
  if (ap[name] !== undefined) return ap[name];
  var fallback = { TOP_LEFT: 1095660652, TOP_CENTER: 1095660643, TOP_RIGHT: 1095660658, LEFT_CENTER: 1095658595, CENTER: 1095656308, RIGHT_CENTER: 1095660131, BOTTOM_LEFT: 1095656044, BOTTOM_CENTER: 1095656035, BOTTOM_RIGHT: 1095656050 };
  return fallback[name] !== undefined ? fallback[name] : 1095660652;
};

// ── String escaping for safe ExtendScript literal embedding ──
function __escapeJsx(str) {
  return String(str).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r').replace(/\\t/g, '\\\\t');
}

// ── DOM Navigation: Document ──
function __findDocument(nameOrIndex) {
  var docs = app.documents;
  if (!docs || docs.length === 0) return null;
  if (typeof nameOrIndex === 'undefined' || nameOrIndex === null) return app.activeDocument;
  if (typeof nameOrIndex === 'number') return docs[nameOrIndex] || null;
  for (var i = 0; i < docs.length; i++) {
    if (docs[i].name === nameOrIndex) return docs[i];
  }
  return null;
}

function __getActiveDocument() {
  if (!app.documents || app.documents.length === 0) return null;
  return app.activeDocument;
}

// ── DOM Navigation: Pages ──
function __findPage(doc, pageNameOrIndex) {
  if (!doc || !doc.pages) return null;
  if (typeof pageNameOrIndex === 'number') return doc.pages[pageNameOrIndex] || null;
  for (var i = 0; i < doc.pages.length; i++) {
    if (doc.pages[i].name === pageNameOrIndex) return doc.pages[i];
  }
  return null;
}

function __getAllPages(doc) {
  if (!doc || !doc.pages) return [];
  var result = [];
  for (var i = 0; i < doc.pages.length; i++) {
    result.push(doc.pages[i]);
  }
  return result;
}

// ── DOM Navigation: Items ──
function __findPageItem(docOrPage, itemIndexOrName) {
  // Use pageItems for a page (direct children), allPageItems for a document (across all pages)
  var items = docOrPage.hasOwnProperty('pages') ? docOrPage.allPageItems : docOrPage.pageItems;
  if (!items) return null;
  if (typeof itemIndexOrName === 'number') return items[itemIndexOrName] || null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].name === itemIndexOrName) return items[i];
  }
  return null;
}

// ── Recursive item walker ──
function __walkItems(parent, callback) {
  if (!parent) return;
  var items = parent.pageItems;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    callback(items[i], i);
    if (items[i].pageItems && items[i].pageItems.length > 0) {
      __walkItems(items[i], callback);
    }
  }
}

// ── Collect items by type ──
function __collectItems(parent, typeName) {
  var result = [];
  if (!parent) return result;
  __walkItems(parent, function (item) {
    if (!typeName || item.constructor.name === typeName) {
      result.push(item);
    }
  });
  return result;
}

function __collectTextFrames(parent) {
  if (!parent) return [];
  var result = [];
  var frames = parent.textFrames;
  if (frames) {
    for (var i = 0; i < frames.length; i++) { result.push(frames[i]); }
  }
  return result;
}

function __collectShapes(parent) {
  if (!parent) return [];
  var result = [];
  var rects = parent.rectangles; if (rects) { for (var i = 0; i < rects.length; i++) result.push({ item: rects[i], type: 'rectangle' }); }
  var ellipses = parent.ellipses; if (ellipses) { for (var i = 0; i < ellipses.length; i++) result.push({ item: ellipses[i], type: 'ellipse' }); }
  var polygons = parent.polygons; if (polygons) { for (var i = 0; i < polygons.length; i++) result.push({ item: polygons[i], type: 'polygon' }); }
  var lines = parent.graphicLines; if (lines) { for (var i = 0; i < lines.length; i++) result.push({ item: lines[i], type: 'graphicLine' }); }
  return result;
}

function __collectImages(parent) {
  if (!parent) return [];
  var result = [];
  var images = parent.images;
  if (images) {
    for (var i = 0; i < images.length; i++) { result.push(images[i]); }
  }
  return result;
}

// ── Layer helpers ──
function __findLayer(doc, nameOrIndex) {
  if (!doc || !doc.layers) return null;
  if (typeof nameOrIndex === 'number') return doc.layers[nameOrIndex] || null;
  for (var i = 0; i < doc.layers.length; i++) {
    if (doc.layers[i].name === nameOrIndex) return doc.layers[i];
  }
  return null;
}

// ── Measurement conversion ──
function __mmToPoints(mm) { return mm * 2.834645669291338; }

function __pointsToMm(pt) { return pt / 2.834645669291338; }

function __inchesToPoints(inches) { return inches * 72; }

function __pointsToInches(pt) { return pt / 72; }

function __picasToPoints(picas) { return picas * 12; }

// ── Document info extractor (returns JSON-safe object) ──
function __getDocumentInfo(doc) {
  if (!doc) return null;
  var fp = '';
  try { fp = doc.fullName ? doc.fullName.toString() : ''; } catch (e) {}
  var bleedTop = 0, bleedBottom = 0, bleedLeft = 0, bleedRight = 0;
  try {
    bleedTop = doc.documentPreferences.documentBleedTopOffset;
    bleedBottom = doc.documentPreferences.documentBleedBottomOffset;
    bleedLeft = doc.documentPreferences.documentBleedInsideOrLeftOffset;
    bleedRight = doc.documentPreferences.documentBleedOutsideOrRightOffset;
  } catch (e) {}
  return {
    name: doc.name,
    filePath: fp,
    pages: doc.pages ? doc.pages.length : 0,
    pageWidth: doc.documentPreferences.pageWidth,
    pageHeight: doc.documentPreferences.pageHeight,
    orientation: doc.documentPreferences.pageOrientation,
    facingPages: doc.documentPreferences.facingPages,
    margins: {
      top: doc.marginPreferences.top,
      bottom: doc.marginPreferences.bottom,
      left: doc.marginPreferences.left,
      right: doc.marginPreferences.right
    },
    bleed: { top: bleedTop, bottom: bleedBottom, left: bleedLeft, right: bleedRight },
    units: doc.viewPreferences ? doc.viewPreferences.horizontalMeasurementUnits : '',
    zeroPoint: doc.zeroPoint ? [doc.zeroPoint[0], doc.zeroPoint[1]] : [0, 0]
  };
}

// ── Page info extractor ──
function __getPageInfo(page) {
  if (!page) return null;
  var masterName = '';
  try { masterName = page.appliedMaster ? page.appliedMaster.name : ''; } catch (e) {}
  return {
    index: page.index,
    name: page.name,
    bounds: {
      top: page.bounds[0],
      left: page.bounds[1],
      bottom: page.bounds[2],
      right: page.bounds[3]
    },
    side: page.side,
    masterSpread: masterName,
    label: page.label || ''
  };
}

// ── Item bounds extractor ──
function __getBounds(item) {
  if (!item || !item.geometricBounds) return null;
  return {
    top: item.geometricBounds[0],
    left: item.geometricBounds[1],
    bottom: item.geometricBounds[2],
    right: item.geometricBounds[3]
  };
}

// ── Item info extractor (generic) ──
function __getItemInfo(item) {
  if (!item) return null;
  var fillColor = '', strokeColor = '';
  try { fillColor = item.fillColor ? item.fillColor.name : ''; } catch (e) {}
  try { strokeColor = item.strokeColor ? item.strokeColor.name : ''; } catch (e) {}
  return {
    index: item.index,
    name: item.name || '',
    id: item.id,
    itemType: item.constructor ? item.constructor.name : '',
    bounds: __getBounds(item),
    fillColor: fillColor,
    strokeColor: strokeColor,
    strokeWeight: item.strokeWeight || 0,
    locked: item.locked || false,
    visible: item.visible !== false,
    layer: item.itemLayer ? item.itemLayer.name : ''
  };
}

// ── Script result wrapper ──
function __ok(data) { return JSON.stringify({ ok: true, data: data }); }

function __fail(msg) { return JSON.stringify({ ok: false, error: String(msg) }); }

function __try(fn) {
  try {
    return fn();
  } catch (e) {
    return __fail(e.toString());
  }
}
`;

/**
 * Returns the helpers block. Use this instead of JSON_POLYFILL directly.
 * ScriptExecutor will inject this before every script execution.
 */
export function getExtendScriptHelpers(): string {
  return EXTENDSCRIPT_HELPERS;
}
