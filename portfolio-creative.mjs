#!/usr/bin/env node
/**
 * Portfolio — Creativo Minimal Monocromatico Scuro
 * Formato quadrato 210×210mm, 6 pagine, griglia precisa
 *
 * GRID SYSTEM:
 *   Page:        210 × 210 mm
 *   Margins:     18 mm tutti i lati
 *   Content box: 18 → 192 (174 × 174 mm)
 *   Colonne:     2 colonne da 81 mm + gutter 12 mm = 174 mm
 *     Col 1:     18 → 99   (larghezza 81)
 *     Col 2:     111 → 192  (larghezza 81)
 *   Unità base:  6 mm (spacing step)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "child_process";
import { setTimeout as sleep } from "timers/promises";

// === GRID CONSTANTS ===
const M = 18;         // margin
const CW = 174;       // content width (210 - 36)
const C1L = 18;       // col 1 left
const C1R = 99;       // col 1 right  (18 + 81)
const C2L = 111;      // col 2 left   (C1R + 12 gutter)
const C2R = 192;      // col 2 right  (margin right)
const FW = 81;        // col width
const G = 12;         // gutter
const U = 6;          // base unit

// Kill existing MCP server
try { execSync("lsof -ti :8120 | xargs kill -9 2>/dev/null", { stdio: "ignore" }); } catch {}
await sleep(3000);

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js", "opencode-indesign.json"],
});
const client = new Client({ name: "portfolio-builder", version: "1.0.0" });
await client.connect(transport);
console.log("✅ Connected to MCP server\n");
await sleep(3000);

async function tool(name, args = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await client.callTool({ name, arguments: args });
      const text = result.content?.[0]?.text || JSON.stringify(result);
      if (result.isError) {
        if (text.includes("timed out") && attempt < 4) { await sleep(4000); continue; }
        throw new Error(text);
      }
      return JSON.parse(text);
    } catch (e) {
      if (e.message?.includes("timed out") && attempt < 4) { await sleep(4000); continue; }
      throw e;
    }
  }
}

async function xs(code) {
  return tool("export_executeScript", { code });
}

// Helper: build color reference
function C(name) { return `d.colors.item("${name}")`; }

// ======== 1. CREATE DOCUMENT ========
console.log("📄 Creating document (210×210mm square)...");
await tool("document_create", {
  width: 210, height: 210, pages: 1,
  margins: { top: M, bottom: M, left: M, right: M }
});
console.log("   ✅ Document created\n");

// ======== 2. COLOR SWATCHES ========
console.log("🎨 Creating swatches...");
await xs(`var d=app.activeDocument;
var sw=[
  {n:"Bg",r:10,g:10,b:10},
  {n:"Surface",r:26,g:26,b:26},
  {n:"Surface2",r:42,g:42,b:42},
  {n:"Text",r:240,g:240,b:240},
  {n:"Text2",r:160,g:160,b:160},
  {n:"Text3",r:90,g:90,b:90}
];
for(var i=0;i<sw.length;i++){try{
  var s=d.colors.add();s.name=sw[i].n;
  s.model=ColorModel.process;s.space=ColorSpace.RGB;
  s.colorValue=[sw[i].r,sw[i].g,sw[i].b];
}catch(e){}}`);
console.log("   ✅ 6 swatches ready\n");

// ======== 3. ADD PAGES ========
console.log("📑 Adding pages...");
for (let i = 1; i <= 5; i++) await tool("page_add", { position: "atEnd" });
console.log("   ✅ 6 pages ready\n");

// ======== 4. PAGE 1 — COVER ========
console.log("🎨 Page 1 — Cover...");
await xs(`var d=app.activeDocument;var p=d.pages[0];
// Background
var bg=p.rectangles.add();bg.geometricBounds=[0,0,210,210];bg.fillColor=${C("Bg")};bg.strokeWeight=0;
// Large circle (semi-transparent)
var c1=p.ovals.add();c1.geometricBounds=[-50,50,180,250];c1.fillColor=${C("Text")};c1.strokeWeight=0;c1.transparencySettings.blendingSettings.opacity=5;
// Smaller circle bottom-left
var c2=p.ovals.add();c2.geometricBounds=[120,-40,250,80];c2.fillColor=${C("Text")};c2.strokeWeight=0;c2.transparencySettings.blendingSettings.opacity=4;
// Accent rectangle aligned to grid
var r1=p.rectangles.add();r1.geometricBounds=[30,111,45,192];r1.fillColor=${C("Surface")};r1.strokeWeight=0;
// Vertical accent line (left of name area)
var vl=p.graphicLines.add();vl.geometricBounds=[${M},${M},${M},${M+120}];vl.strokeColor=${C("Text")};vl.strokeWeight=1;vl.transparencySettings.blendingSettings.opacity=20;
// Name
var t1=p.textFrames.add();t1.geometricBounds=[${M+40},${M+18},${M+108},192];t1.contents="NOME\\rCOGNOME";
t1.texts[0].appliedFont="Arial";t1.texts[0].fontStyle="Bold";t1.texts[0].pointSize=60;
t1.texts[0].fillColor=${C("Text")};t1.texts[0].leading=52;t1.texts[0].tracking=20;
// Subtitle
var t2=p.textFrames.add();t2.geometricBounds=[${M+116},${M+18},${M+140},192];
t2.contents="DESIGNER & ILLUSTRATOR";
t2.texts[0].appliedFont="Arial";t2.texts[0].fontStyle="Regular";t2.texts[0].pointSize=9;
t2.texts[0].fillColor=${C("Text2")};t2.texts[0].tracking=120;
// Portfolio label
var t3=p.textFrames.add();t3.geometricBounds=[${M+116},145,${M+140},192];
t3.contents="PORTFOLIO 2026";
t3.texts[0].appliedFont="Arial";t3.texts[0].fontStyle="Regular";t3.texts[0].pointSize=9;
t3.texts[0].fillColor=${C("Text3")};t3.texts[0].tracking=120;t3.texts[0].justification=Justification.RIGHT_ALIGN;
// Bottom accent bar
var bar=p.rectangles.add();bar.geometricBounds=[192,${M},195,${M+120}];bar.fillColor=${C("Text")};bar.strokeWeight=0;bar.transparencySettings.blendingSettings.opacity=15;
// Page number
var pn=p.textFrames.add();pn.geometricBounds=[195,${M},205,${M+30}];pn.contents="01";pn.texts[0].appliedFont="Arial";
pn.texts[0].pointSize=8;pn.texts[0].fillColor=${C("Text3")};pn.texts[0].tracking=80;
`);
console.log("   ✅ Page 1 done");

// ======== 5. PAGE 2 — ABOUT ========
console.log("🎨 Page 2 — About...");
await xs(`var d=app.activeDocument;var p=d.pages[1];
var bg=p.rectangles.add();bg.geometricBounds=[0,0,210,210];bg.fillColor=${C("Bg")};bg.strokeWeight=0;
// Subtle circle top-right
var cc=p.ovals.add();cc.geometricBounds=[-20,120,80,220];cc.fillColor=${C("Text")};cc.strokeWeight=0;cc.transparencySettings.blendingSettings.opacity=3;
// Section number
var sn=p.textFrames.add();sn.geometricBounds=[${M},${M},${M+24},60];sn.contents="01";sn.texts[0].appliedFont="Arial";
sn.texts[0].fontStyle="Bold";sn.texts[0].pointSize=14;sn.texts[0].fillColor=${C("Text3")};sn.texts[0].tracking=100;
// Heading "ABOUT"
var h=p.textFrames.add();h.geometricBounds=[${M+30},${M},${M+66},192];h.contents="ABOUT";h.texts[0].appliedFont="Arial";
h.texts[0].fontStyle="Bold";h.texts[0].pointSize=32;h.texts[0].fillColor=${C("Text")};h.texts[0].tracking=80;
// Decorative line — exactly 60mm wide
var dl=p.graphicLines.add();dl.geometricBounds=[${M+72},${M},${M+72},${M+60}];dl.strokeColor=${C("Text2")};dl.strokeWeight=1;dl.transparencySettings.blendingSettings.opacity=30;
// Bio text (col 1)
var bio=p.textFrames.add();bio.geometricBounds=[${M+90},${M},180,${C1R}];
bio.contents="Ciao, sono un designer e illustratore con sede a Milano.\\r\\rLavoro da oltre 8 anni nel campo della comunicazione visiva, creando identita di marca, illustrazioni editoriali e progetti di data visualization.\\r\\rIl mio approccio unisce rigore concettuale e liberta espressiva: ogni progetto nasce da una ricerca approfondita e si traduce in un linguaggio visivo pulito, essenziale ma mai banale.";
bio.texts[0].appliedFont="Arial";bio.texts[0].pointSize=10;bio.texts[0].fillColor=${C("Text2")};bio.texts[0].leading=16;
// Keywords in col 2
var kw=p.textFrames.add();kw.geometricBounds=[${M+90},${C2L},180,${C2R}];
kw.contents="BRAND IDENTITY\\rEDITORIAL\\rILLUSTRATION\\rDATA VIZ\\rART DIRECTION";
kw.texts[0].appliedFont="Arial";kw.texts[0].pointSize=9;kw.texts[0].fillColor=${C("Text3")};kw.texts[0].leading=18;kw.texts[0].tracking=80;
// Small accent box
var sq=p.rectangles.add();sq.geometricBounds=[186,${M},190,${M+24}];sq.fillColor=${C("Text2")};sq.strokeWeight=0;sq.transparencySettings.blendingSettings.opacity=15;
// Page number
var pn=p.textFrames.add();pn.geometricBounds=[195,${M},205,${M+30}];pn.contents="02";pn.texts[0].appliedFont="Arial";
pn.texts[0].pointSize=8;pn.texts[0].fillColor=${C("Text3")};pn.texts[0].tracking=80;
`);
console.log("   ✅ Page 2 done");

// ======== 6-8. PAGES 3-5 — PROJECTS ========
for (let pi = 0; pi < 3; pi++) {
  const pageIdx = pi + 2;
  const projNum = pi + 1;
  const sectionNum = pi + 2;
  const pn = String(pageIdx + 1).padStart(2, '0');
  const titles = ["PROGETTO UNO", "PROGETTO DUE", "PROGETTO TRE"];
  const cats = ["BRAND IDENTITY / 2025", "EDITORIAL / 2025", "DATA VIZ / 2024"];
  const descs = [
    "Progetto di identita visiva per un brand emergente nel settore della moda sostenibile. Il concept si basa su un sistema modulare di forme geometriche che si adattano a diversi supporti, dalla carta al digitale.",
    "Direzione artistica e illustrazioni per una rivista indipendente di design. Un linguaggio visivo essenziale ma audace, con illustrazioni vettoriali e una griglia tipografica rigorosa.",
    "Progetto di visualizzazione dati per un report annuale sulla sostenibilita. Trasformare numeri complessi in narrazioni visive chiare e coinvolgenti."
  ];

  // Alternate layout: odd = image left, even = image right
  if (pi % 2 === 0) {
    // IMAGE LEFT, TEXT RIGHT
    await xs(`var d=app.activeDocument;var p=d.pages[${pageIdx}];
    var bg=p.rectangles.add();bg.geometricBounds=[0,0,210,210];bg.fillColor=${C("Bg")};bg.strokeWeight=0;
    // Section number
    var sn=p.textFrames.add();sn.geometricBounds=[${M},${M},${M+24},60];sn.contents="0${sectionNum}";sn.texts[0].appliedFont="Arial";
    sn.texts[0].fontStyle="Bold";sn.texts[0].pointSize=14;sn.texts[0].fillColor=${C("Text3")};sn.texts[0].tracking=100;
    // Image placeholder (col 1)
    var img=p.rectangles.add();img.geometricBounds=[${M+36},${M},${M+36+108},${C1R}];img.fillColor=${C("Surface")};img.strokeWeight=0;
    // Corner accent on placeholder
    var cr=p.rectangles.add();cr.geometricBounds=[${M+36},${M},${M+36+8},${M+8}];cr.fillColor=${C("Text2")};cr.strokeWeight=0;cr.transparencySettings.blendingSettings.opacity=20;
    // Project number (large faded)
    var num=p.textFrames.add();num.geometricBounds=[${M+36},${C2L},${M+72},${C2R}];num.contents="0${projNum}";num.texts[0].appliedFont="Arial";
    num.texts[0].fontStyle="Bold";num.texts[0].pointSize=36;num.texts[0].fillColor=${C("Surface")};
    // Title
    var t=p.textFrames.add();t.geometricBounds=[${M+78},${C2L},${M+102},${C2R}];t.contents="${titles[pi]}";t.texts[0].appliedFont="Arial";
    t.texts[0].fontStyle="Bold";t.texts[0].pointSize=20;t.texts[0].fillColor=${C("Text")};t.texts[0].tracking=60;
    // Line
    var l=p.graphicLines.add();l.geometricBounds=[${M+108},${C2L},${M+108},${C2R-30}];l.strokeColor=${C("Text2")};l.strokeWeight=0.8;l.transparencySettings.blendingSettings.opacity=20;
    // Category
    var ct=p.textFrames.add();ct.geometricBounds=[${M+114},${C2L},${M+132},${C2R}];ct.contents="${cats[pi]}";ct.texts[0].appliedFont="Arial";
    ct.texts[0].pointSize=7;ct.texts[0].fillColor=${C("Text2")};ct.texts[0].tracking=120;
    // Description
    var dsc=p.textFrames.add();dsc.geometricBounds=[${M+138},${C2L},195,${C2R}];dsc.contents="${descs[pi]}";dsc.texts[0].appliedFont="Arial";
    dsc.texts[0].pointSize=8;dsc.texts[0].fillColor=${C("Text2")};dsc.texts[0].leading=13;
    // Page number
    var pn=p.textFrames.add();pn.geometricBounds=[195,${M},205,${M+30}];pn.contents="${pn}";pn.texts[0].appliedFont="Arial";
    pn.texts[0].pointSize=8;pn.texts[0].fillColor=${C("Text3")};pn.texts[0].tracking=80;
    `);
  } else {
    // TEXT LEFT, IMAGE RIGHT
    await xs(`var d=app.activeDocument;var p=d.pages[${pageIdx}];
    var bg=p.rectangles.add();bg.geometricBounds=[0,0,210,210];bg.fillColor=${C("Bg")};bg.strokeWeight=0;
    // Section number
    var sn=p.textFrames.add();sn.geometricBounds=[${M},${M},${M+24},60];sn.contents="0${sectionNum}";sn.texts[0].appliedFont="Arial";
    sn.texts[0].fontStyle="Bold";sn.texts[0].pointSize=14;sn.texts[0].fillColor=${C("Text3")};sn.texts[0].tracking=100;
    // Image placeholder (col 2)
    var img=p.rectangles.add();img.geometricBounds=[${M+36},${C2L},${M+36+108},${C2R}];img.fillColor=${C("Surface")};img.strokeWeight=0;
    // Corner accent
    var cr=p.rectangles.add();cr.geometricBounds=[${M+36},${C2R-8},${M+36+8},${C2R}];cr.fillColor=${C("Text2")};cr.strokeWeight=0;cr.transparencySettings.blendingSettings.opacity=20;
    // Project number (large faded)
    var num=p.textFrames.add();num.geometricBounds=[${M+36},${M},${M+72},${C1R}];num.contents="0${projNum}";num.texts[0].appliedFont="Arial";
    num.texts[0].fontStyle="Bold";num.texts[0].pointSize=36;num.texts[0].fillColor=${C("Surface")};
    // Title
    var t=p.textFrames.add();t.geometricBounds=[${M+78},${M},${M+102},${C1R}];t.contents="${titles[pi]}";t.texts[0].appliedFont="Arial";
    t.texts[0].fontStyle="Bold";t.texts[0].pointSize=20;t.texts[0].fillColor=${C("Text")};t.texts[0].tracking=60;
    // Line
    var l=p.graphicLines.add();l.geometricBounds=[${M+108},${M},${M+108},${C1R-30}];l.strokeColor=${C("Text2")};l.strokeWeight=0.8;l.transparencySettings.blendingSettings.opacity=20;
    // Category
    var ct=p.textFrames.add();ct.geometricBounds=[${M+114},${M},${M+132},${C1R}];ct.contents="${cats[pi]}";ct.texts[0].appliedFont="Arial";
    ct.texts[0].pointSize=7;ct.texts[0].fillColor=${C("Text2")};ct.texts[0].tracking=120;
    // Description
    var dsc=p.textFrames.add();dsc.geometricBounds=[${M+138},${M},195,${C1R}];dsc.contents="${descs[pi]}";dsc.texts[0].appliedFont="Arial";
    dsc.texts[0].pointSize=8;dsc.texts[0].fillColor=${C("Text2")};dsc.texts[0].leading=13;
    // Page number
    var pn=p.textFrames.add();pn.geometricBounds=[195,${M},205,${M+30}];pn.contents="${pn}";pn.texts[0].appliedFont="Arial";
    pn.texts[0].pointSize=8;pn.texts[0].fillColor=${C("Text3")};pn.texts[0].tracking=80;
    `);
  }
}
console.log("   ✅ Pages 3-5 done");

// ======== 9. PAGE 6 — CONTACT ========
console.log("🎨 Page 6 — Contact...");
await xs(`var d=app.activeDocument;var p=d.pages[5];
var bg=p.rectangles.add();bg.geometricBounds=[0,0,210,210];bg.fillColor=${C("Bg")};bg.strokeWeight=0;
// Large subtle circle
var cc=p.ovals.add();cc.geometricBounds=[-20,-20,140,170];cc.fillColor=${C("Text")};cc.strokeWeight=0;cc.transparencySettings.blendingSettings.opacity=3;
// Small circle accent
var sc=p.ovals.add();sc.geometricBounds=[${M},${C2R-18},${M+18},${C2R}];sc.fillColor=${C("Surface")};sc.strokeWeight=0;
// Heading
var h=p.textFrames.add();h.geometricBounds=[${M+48},${M},${M+84},${C2R}];h.contents="CONTATTI";h.texts[0].appliedFont="Arial";
h.texts[0].fontStyle="Bold";h.texts[0].pointSize=32;h.texts[0].fillColor=${C("Text")};h.texts[0].tracking=80;
// Decorative line
var dl=p.graphicLines.add();dl.geometricBounds=[${M+90},${M},${M+90},${M+60}];dl.strokeColor=${C("Text2")};dl.strokeWeight=1;dl.transparencySettings.blendingSettings.opacity=20;
// Contact info (col 1)
var ci=p.textFrames.add();ci.geometricBounds=[${M+108},${M},180,${C1R}];
ci.contents="hello@nomedesigner.com\\r+39 123 456 7890\\r@nomedesigner\\rnomedesigner.com";
ci.texts[0].appliedFont="Arial";ci.texts[0].pointSize=10;ci.texts[0].fillColor=${C("Text2")};ci.texts[0].leading=20;
// Availability (col 2)
var av=p.textFrames.add();av.geometricBounds=[${M+108},${C2L},180,${C2R}];
av.contents="DISPONIBILE PER\\rPROGETTI FREELANCE\\rCOLLABORAZIONI\\rCONSULENZE";
av.texts[0].appliedFont="Arial";av.texts[0].pointSize=9;av.texts[0].fillColor=${C("Text3")};av.texts[0].leading=18;av.texts[0].tracking=60;
// Bottom decorative bar
var br=p.rectangles.add();br.geometricBounds=[192,${M},195,${M+80}];br.fillColor=${C("Text2")};br.strokeWeight=0;br.transparencySettings.blendingSettings.opacity=10;
// Footer
var ft=p.textFrames.add();ft.geometricBounds=[195,${M},205,${C2R}];ft.contents="(c) 2026 NOME COGNOME — ALL RIGHTS RESERVED";
ft.texts[0].appliedFont="Arial";ft.texts[0].pointSize=7;ft.texts[0].fillColor=${C("Text3")};ft.texts[0].tracking=100;
// Page number
var pn=p.textFrames.add();pn.geometricBounds=[195,${M},205,${M+30}];pn.contents="06";pn.texts[0].appliedFont="Arial";
pn.texts[0].pointSize=8;pn.texts[0].fillColor=${C("Text3")};pn.texts[0].tracking=80;
`);
console.log("   ✅ Page 6 done");

// ======== 10. SAVE & EXPORT ========
const home = process.env.HOME;
console.log("\n💾 Saving document...");
await xs('var d=app.activeDocument;var f=File("'+home+'/Desktop/portfolio-creativo-minimal.indd");if(f.exists)f.remove();d.save(f);JSON.stringify({saved:true});');
console.log("   ✅ Saved to Desktop");

console.log("📤 Exporting PDF (all pages)...");
// Use ExtendScript directly for more control over PDF export
await xs(`var d=app.activeDocument;
var f=File("${home}/Desktop/portfolio-creativo-minimal.pdf");
if(f.exists)f.remove();
d.exportFile(ExportFormat.PDF_TYPE, f, false);
JSON.stringify({exported:true});`);
console.log("   ✅ PDF exported to Desktop\n");

console.log("✨ Portfolio creato con successo!");
console.log("   📄 Desktop/portfolio-creativo-minimal.indd");
console.log("   📄 Desktop/portfolio-creativo-minimal.pdf");

await sleep(1000);
process.exit(0);
