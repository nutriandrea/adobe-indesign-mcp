---
name: style-extractor
description: Estrae lo stile completo da file .indd in una cartella (font, colori, stili paragrafo/carattere, master, margini) e lo replica per impaginare un nuovo libro con lo stesso stile
triggers:
  - "estrai stile"
  - "copia stile"
  - "clona impaginazione"
  - "stesso stile"
  - "replica layout"
  - "impagina come"
  - "libro stile"
  - "riproduci stile"
  - "copia formato"
  - "stile da file esistenti"
  - "riusa stile"
  - "omologa"
  - "prendi stile da"
  - "analizza cartella indd"
  - "scan indd"
---

# Skill: Style Extractor — Estrai e Replica Stile da File .indd

## Scopo

Prendere una **cartella con file .indd esistenti**, analizzarli, estrarre TUTTI i parametri di stile (margini, colonne, font, colori, stili paragrafo/carattere, master spread, oggetti), salvare un **profilo stile** e usarlo per **impaginare un nuovo libro** con lo stesso identico aspetto.

## Workflow Completo

```
CARTELLA .indd → FASE 1: ANALIZZA → PROFILO STILE (JSON) → FASE 2: CREA DOCUMENTO → FASE 3: REPLICA STILI → FASE 4: IMPAGINA → VERIFICA
```

---

## FASE 1 — Estrazione Stile da Cartella .indd

### Step 1.1: Elenca file .indd nella cartella

Usa `script_run` per scansionare la cartella:

```extendscript
var cartella = Folder("/path/ai/tuoi/indd");
var files = cartella.getFiles("*.indd");
var nomi = [];
for (var i = 0; i < files.length; i++) {
    nomi.push(files[i].name);
}
JSON.stringify(nomi);
```

In output ottieni: `["copertina.indd", "capitolo1.indd", "capitolo2.indd", "interno.indd"]`

### Step 1.2: Per ogni file, apri ed estrai lo stile

Tool disponibili per l'estrazione:

| Cosa estrarre | Tool MCP | Output |
|---|---|---|
| Pagina, margini, dimensioni | `document_getInfo` | Page size, margins, orientation |
| Swatches (colori, gradienti) | `export_getSwatches` | Nome, tipo, valori CMYK/RGB |
| Font usati | `export_getFonts` | Nome, famiglia, stile |
| Stili paragrafo | `style_listParagraph` | Nome, basedOn |
| Stili carattere | `style_listCharacter` | Nome, basedOn |
| Stili oggetto | `style_listObject` | Nome, basedOn |
| Master spread | `export_getMasterSpreads` | Nome, pagine |
| Layers | `layer_list` | Nome, visibilità, blocco |

> **Attenzione**: I tool `style_list*` danno solo i nomi. Per estrarre le **proprietà complete** (font, size, colore, leading, tracking, spazio prima/dopo, rientri) devi usare uno `script_run` dedicato.

### Step 1.3: Script di estrazione completa stili (singolo blocco)

Esegui questo script su OGNI file .indd aperto:

```extendscript
var doc = app.activeDocument;
var result = {};

// ---- DOC PREFERENCES ----
result.document = {
    pageWidth: doc.documentPreferences.pageWidth,
    pageHeight: doc.documentPreferences.pageHeight,
    facingPages: doc.documentPreferences.facingPages,
    pageOrientation: doc.documentPreferences.pageOrientation,
    columns: doc.documentPreferences.columnsCount,
    columnGutter: doc.documentPreferences.columnGutter,
    bleedTop: doc.documentPreferences.documentBleedTopOffset,
    bleedBottom: doc.documentPreferences.documentBleedBottomOffset,
    bleedInside: doc.documentPreferences.documentBleedInsideOffset,
    bleedOutside: doc.documentPreferences.documentBleedOutsideOffset
};

// ---- MARGINS ----
result.margins = {
    top: doc.marginPreferences.top,
    bottom: doc.marginPreferences.bottom,
    left: doc.marginPreferences.left,
    right: doc.marginPreferences.right
};

// ---- SWATCHES (colori) ----
var swatches = [];
for (var i = 0; i < doc.swatches.length; i++) {
    var s = doc.swatches[i];
    if (!s.name.match(/^\[/)) { // skip [Registration], [None], [Paper], [Black]
        swatches.push({
            name: s.name,
            model: s.model.toString(), // ColorModel.PROCESS, SPOT, MIXEDINK, REGISTRATION
            space: typeof s.space !== 'undefined' ? s.space.toString() : '',
            colorValue: [
                typeof s.colorValue !== 'undefined' ? s.colorValue[0] : 0,
                typeof s.colorValue !== 'undefined' ? s.colorValue[1] : 0,
                typeof s.colorValue !== 'undefined' ? s.colorValue[2] : 0,
                typeof s.colorValue !== 'undefined' ? s.colorValue[3] : 0
            ]
        });
    }
}
result.swatches = swatches;

// ---- PARAGRAPH STYLES (con proprietà) ----
var paraStyles = [];
for (var i = 0; i < doc.paragraphStyles.length; i++) {
    var ps = doc.paragraphStyles[i];
    if (!ps.name.match(/^\[/)) {
        paraStyles.push({
            name: ps.name,
            basedOn: ps.basedOn ? ps.basedOn.name : null,
            appliedFont: ps.appliedFont ? ps.appliedFont.name : null,
            fontStyle: ps.fontStyle,
            pointSize: ps.pointSize,
            leading: ps.leading,
            tracking: ps.tracking,
            justification: ps.justification.toString(),
            firstLineIndent: ps.firstLineIndent,
            leftIndent: ps.leftIndent,
            rightIndent: ps.rightIndent,
            spaceBefore: ps.spaceBefore,
            spaceAfter: ps.spaceAfter,
            fillColor: ps.fillColor ? ps.fillColor.name : null,
            strokeColor: ps.strokeColor ? ps.strokeColor.name : null,
            strokeWeight: ps.strokeWeight,
            dropCapCharacters: ps.dropCapCharacters,
            dropCapLines: ps.dropCapLines,
            hyphenation: ps.hyphenation,
            keuk: ps.keuk,
            singleWordJustification: ps.singleWordJustification.toString()
        });
    }
}
result.paragraphStyles = paraStyles;

// ---- CHARACTER STYLES (con proprietà) ----
var charStyles = [];
for (var i = 0; i < doc.characterStyles.length; i++) {
    var cs = doc.characterStyles[i];
    if (!cs.name.match(/^\[/)) {
        charStyles.push({
            name: cs.name,
            basedOn: cs.basedOn ? cs.basedOn.name : null,
            appliedFont: cs.appliedFont ? cs.appliedFont.name : null,
            fontStyle: cs.fontStyle,
            pointSize: cs.pointSize,
            leading: cs.leading,
            tracking: cs.tracking,
            fillColor: cs.fillColor ? cs.fillColor.name : null,
            strokeColor: cs.strokeColor ? cs.strokeColor.name : null,
            strokeWeight: cs.strokeWeight,
            strikethrough: cs.strikethrough,
            underline: cs.underline,
            capitalization: cs.capitalization.toString()
        });
    }
}
result.characterStyles = charStyles;

// ---- OBJECT STYLES ----
var objStyles = [];
for (var i = 0; i < doc.objectStyles.length; i++) {
    var os = doc.objectStyles[i];
    if (!os.name.match(/^\[/)) {
        objStyles.push({
            name: os.name,
            basedOn: os.basedOn ? os.basedOn.name : null
        });
    }
}
result.objectStyles = objStyles;

// ---- MASTER SPREADS ----
var masters = [];
for (var i = 0; i < doc.masterSpreads.length; i++) {
    var m = doc.masterSpreads[i];
    masters.push({
        name: m.name,
        pageCount: m.pages.length
    });
}
result.masterSpreads = masters;

// ---- LAYERS ----
var layers = [];
for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    layers.push({
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        printable: l.printable
    });
}
result.layers = layers;

JSON.stringify(result, null, 2);
```

### Step 1.4: Applica su PIÙ file .indd (ripeti il ciclo)

Puoi eseguire UNO script che apre TUTTI i file della cartella ed estrae lo stile da ciascuno, accumulando i risultati:

```extendscript
var cartella = Folder("/path/cartella/indd");
var files = cartella.getFiles("*.indd");
var report = {};

for (var f = 0; f < files.length; f++) {
    var doc = app.open(files[f], false); // false = non mostrare
    report[doc.name] = estraiStile(doc);
    doc.close(SaveOptions.NO);
}

function estraiStile(doc) {
    var r = {};
    // ... copia qui lo script dello Step 1.3 ...
    // sostituisci "result" con "r"
    return r;
}

JSON.stringify(report, null, 2);
```

### Step 1.5: Salva il profilo stile

Una volta ottenuto il JSON completo, salvalo in `_style-profiles/` dentro il progetto:

Cartella: `_style-profiles/NomeProfilo.json`

```json
{
  "profileName": "Rivista Design 2025",
  "sourceFiles": ["copertina.indd", "interno.indd"],
  "extractedAt": "2025-06-04",
  "document": { ... },
  "margins": { ... },
  "swatches": [ ... ],
  "paragraphStyles": [ ... ],
  "characterStyles": [ ... ],
  "masterSpreads": [ ... ],
  "layers": [ ... ]
}
```

---

## FASE 2 — Crea un Nuovo Documento con lo Stile Estratto

### Step 2.1: Crea documento con le stesse dimensioni

Tool: `document_create`

Usa i parametri estratti dal profilo:

```json
{
  "width": "210mm",
  "height": "297mm",
  "pages": 10,
  "facingPages": true,
  "orientation": "portrait",
  "margins": {
    "top": 20,
    "bottom": 20,
    "left": 18,
    "right": 18
  },
  "columns": 1,
  "columnGutter": 5,
  "bleed": 3
}
```

### Step 2.2: Configura bleed e colonne

Se il profilo ha bleed o colonne, applica via script_run:

```extendscript
var doc = app.activeDocument;
doc.documentPreferences.documentBleedUniformSize = 3;
doc.documentPreferences.columnsCount = 2;
doc.documentPreferences.columnGutter = "5mm";
```

---

## FASE 3 — Replica Tutti gli Stili

### Step 3.1: Crea swatches (colori)

Tool: `color_swatch_create` per un colore alla volta, oppure `script_run` per crearli tutti in un passaggio:

```extendscript
var doc = app.activeDocument;
var swatches = [PROFILO_SWATCHES]; // dal profilo JSON

for (var i = 0; i < swatches.length; i++) {
    var s = swatches[i];
    try {
        doc.colors.add({
            name: s.name,
            model: ColorModel.PROCESS,
            colorValue: s.colorValue
        });
    } catch(e) {
        // swatch già esistente
    }
}
```

### Step 3.2: Crea layers

```extendscript
var doc = app.activeDocument;
var layers = [PROFILO_LAYERS];

// Rimuovi layer di default
if (doc.layers.length > 0) doc.layers[0].remove();

for (var i = 0; i < layers.length; i++) {
    var l = doc.layers.add({ name: layers[i].name });
    l.visible = layers[i].visible;
    l.locked = layers[i].locked;
}
```

### Step 3.3: Crea stili paragrafo

Tool: `style_createParagraph`

Per OGNI stile nel profilo, crealo con le proprietà:

```extendscript
var doc = app.activeDocument;
var stili = [PROFILO_PARAGRAPH_STYLES];

for (var s = 0; s < stili.length; s++) {
    var profilo = stili[s];
    var existing = doc.paragraphStyles.item(profilo.name);
    if (!existing.isValid) {
        var nuovo = doc.paragraphStyles.add({ name: profilo.name });

        // Applica proprietà
        if (profilo.appliedFont) nuovo.appliedFont = profilo.appliedFont;
        if (profilo.fontStyle) nuovo.fontStyle = profilo.fontStyle;
        if (profilo.pointSize) nuovo.pointSize = profilo.pointSize;
        if (profilo.leading) nuovo.leading = profilo.leading;
        if (profilo.tracking) nuovo.tracking = profilo.tracking;
        if (profilo.justification !== null && profilo.justification !== '') {
            nuovo.justification = eval(profilo.justification);
        }
        if (profilo.firstLineIndent) nuovo.firstLineIndent = profilo.firstLineIndent;
        if (profilo.leftIndent) nuovo.leftIndent = profilo.leftIndent;
        if (profilo.rightIndent) nuovo.rightIndent = profilo.rightIndent;
        if (profilo.spaceBefore) nuovo.spaceBefore = profilo.spaceBefore;
        if (profilo.spaceAfter) nuovo.spaceAfter = profilo.spaceAfter;
        if (profilo.fillColor) {
            try { nuovo.fillColor = doc.colors.item(profilo.fillColor); } catch(e) {}
        }
        if (profilo.hyphenation !== undefined) nuovo.hyphenation = profilo.hyphenation;
        if (profilo.dropCapCharacters > 0) nuovo.dropCapCharacters = profilo.dropCapCharacters;
        if (profilo.dropCapLines > 0) nuovo.dropCapLines = profilo.dropCapLines;

        // basedOn (se lo stile base è già stato creato)
        if (profilo.basedOn) {
            var base = doc.paragraphStyles.item(profilo.basedOn);
            if (base.isValid) nuovo.basedOn = base;
        }
    }
}
```

### Step 3.4: Crea stili carattere

Tool: `style_createCharacter`

Stessa logica dello Step 3.3 ma con `characterStyles` e `style_createCharacter`.

### Step 3.5: Crea master spread

```extendscript
var doc = app.activeDocument;
var masters = [PROFILO_MASTERS];

for (var m = 0; m < masters.length; m++) {
    var nome = masters[m].name;
    var pagine = masters[m].pageCount || 1;

    var master = doc.masterSpreads.add();
    master.name = nome;
    // Per più pagine, aggiungi pagine al master
}
```

---

## FASE 4 — Impagina il Libro

### Step 4.1: Applica master alle pagine

Tool: `page_applyMaster`

```json
{
  "pageIndex": 0,
  "masterName": "Master A"
}
```

Per tutte le pagine in batch:

```extendscript
var doc = app.activeDocument;
for (var p = 0; p < doc.pages.length; p++) {
    doc.pages[p].appliedMaster = doc.masterSpreads.item("Master A");
}
```

### Step 4.2: Crea struttura capitoli

Per capitoli/libri strutturati, usa `page_add` e assegna stili sezione:

```extendscript
// Aggiungi pagine per capitolo
var doc = app.activeDocument;
var capitoli = [
    { nome: "Capitolo 1", pagine: 12 },
    { nome: "Capitolo 2", pagine: 8 }
];
for (var c = 0; c < capitoli.length; c++) {
    for (var p = 0; p < capitoli[c].pagine - 1; p++) {
        doc.pages.add(LocationOptions.AFTER, doc.pages.last());
    }
    // Prima pagina del capitolo = master diverso
    doc.pages[doc.pages.length - capitoli[c].pagine].appliedMaster = doc.masterSpreads.item("Capitolo");
}
```

### Step 4.3: Applica stili a contenuti importati

Se importi testo (Word/markdown), applica stili usando lo stesso mapping:

```extendscript
// Dopo aver importato un docx
for (var i = 0; i < doc.stories.length; i++) {
    var story = doc.stories[i];
    for (var p = 0; p < story.paragraphs.length; p++) {
        var para = story.paragraphs[p];
        var nomeStile = para.appliedParagraphStyle.name;
        // Mappa stile Word -> stile InDesign
        var mappa = { "Heading 1": "Titolo Capitolo", "Normal": "Corpo Testo" };
        if (mappa[nomeStile]) {
            para.appliedParagraphStyle = doc.paragraphStyles.item(mappa[nomeStile]);
        }
    }
}
```

Tool MCP alternativo: `text_applyParagraphStyle`

---

## Integrazione con Altre Skills

| Questa skill usa | Per |
|---|---|
| `layout-readability` | Verificare layout dopo l'impaginazione |
| `export-verify` | Verificare pixel dopo export |
| `template-manager` | Salvare il profilo stile come template .indt |
| `aesthetic-preference` | Raccogliere input utente SE non ci sono file .indd |
| `batch-operations` | Operazioni bulk sulle pagine del libro |
| `import-word` | Importare e mappare testo nel libro |
| `export-batch` | Esportare in tutti i formati alla fine |

## Struttura cartella consigliata

```
progetto-libro/
├── _indd-originali/           ← file .indd da cui estrarre lo stile
├── _style-profiles/           ← profili stile JSON
│   └── mio-stile.json
├── _templates/                ← template .indt generati
├── output/                    ← export batch finale
├── capitolo-01.docx           ← contenuti da impaginare
├── capitolo-02.docx
└── libro-finale.indd          ← documento generato
```

## Casi noti

| Problema | Causa | Soluzione |
|---|---|---|
| Stile "basedOn" non trovato | Ordine creazione errato | Crea stili base PRIMA di quelli derivati; ordina profilo per basedOn |
| Colori non corrispondono | Swatch mancante o spazio colore diverso | Crea swatches PRIMA degli stili |
| Font non installato | Il sistema non ha quel font | Usa `app.fonts` per verificare; sostituisci con fallback simile |
| Margini diversi | `facingPages` attivo cambia left/right in inside/outside | Imposta `doc.marginPreferences` con inside/outside |
| Master spread non replica elementi | Il master spread di origine ha elementi non copiati | I master spread vanno creati manualmente o copiati via `.duplicate()` |
| Documento .indd corrotto | File danneggiato | Salta il file con try/catch e logga l'errore |
| Stili non si applicano ai contenuti | Nome stile non corrisponde | Usa mappa esplicita invece del nome esatto |
