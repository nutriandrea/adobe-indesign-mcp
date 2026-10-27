---
name: export-batch
description: Esportazione multipla simultanea — PDF + JPG + PNG in un colpo, con profili diversi per ogni formato
triggers:
  - "esporta multiplo"
  - "batch export"
  - "esporta tutto"
  - "export all"
  - "pdf + jpg"
  - "multipli formati"
  - "esporta pdf e png"
  - "esporta pdf e jpg"
  - "esportazione multipla"
---

# Skill: Export Batch — Esportazione Multipla

## Scopo

Esportare lo stesso documento InDesign in **più formati contemporaneamente** (PDF stampa, JPG preview, PNG web) in una singola operazione batch, ciascuno con le proprie impostazioni ottimali.

## Workflow

```
PREPARA documenti → DEFINISCI profili export → ESEGUI batch → VERIFICA output
```

## Step 1: Prepara il documento

Prima dell'export batch, assicurati che:
1. **Tutti i link siano aggiornati**: usa `resources_updateLink` su link mancanti
2. **Nessun overflow**: usa `layout-readability` skill
3. **Bleed impostato**: se per stampa, verifica `document_getInfo` abbia bleed
4. **Salva il documento**: `doc.save()`

```extendscript
// Pre-flight check
var doc = app.activeDocument;
var problems = doc.preflightCheck();
if (problems.length > 0) {
    // Mostra avvisi all'utente
}
doc.save();
```

## Step 2: Esegui export multiplo via ExtendScript

### Esempio completo: PDF + JPG + PNG

```extendscript
var doc = app.activeDocument;
var outputDir = "/output/" + doc.name.replace(/\.[^\.]+$/, "");

// Crea cartella output se non esiste
var folder = Folder(outputDir);
if (!folder.exists) folder.create();

// --- 1. PDF per stampa (300 DPI, CMYK, bleed) ---
var pdfPrefs = doc.pdfExportPreferences;
pdfPrefs.pageRange = PageRange.ALL_PAGES;
pdfPrefs.viewPDF = false;
doc.exportFile(
    ExportFormat.PDF_TYPE,
    File(outputDir + "/stampa.pdf"),
    false
);

// --- 2. JPG preview (150 DPI, RGB) ---
var jpgPrefs = doc.jpegExportPreferences;
jpgPrefs.pageRange = PageRange.ALL_PAGES;
jpgPrefs.jpegQuality = JPEGOptionsQuality.MAXIMUM;
jpgPrefs.resolution = 150;
jpgPrefs.exportingSpread = false;
doc.exportFile(
    ExportFormat.JPG,
    File(outputDir + "/preview.jpg"),
    false
);

// --- 3. PNG per web (72 DPI, RGB, trasparenza) ---
// InDesign non ha ExportFormat.PNG nativo,
// ma puoi usare JPG o esportare via script
doc.exportFile(
    ExportFormat.JPG,
    File(outputDir + "/web.jpg"),
    false
);
```

**Nota**: InDesign non supporta ExportFormat.PNG direttamente in ES3. Per PNG usare il bridge-proxy (JXA) o esportare come JPG.

## Step 3: Definisci profili export

### Profilo Stampa (Offset/Digitale)

| Impostazione | Valore |
|---|---|
| Formato | PDF |
| Risoluzione | 300 DPI |
| Colore | CMYK |
| Compressione | ZIP |
| Bleed | 3mm |
| Marchi di stampa | Tagli, crocini |
| PDF Standard | PDF/X-1a o PDF/X-4 |

### Profilo Web/Social

| Impostazione | Valore |
|---|---|
| Formato | JPG o PNG |
| Risoluzione | 72 DPI |
| Colore | RGB |
| Qualità | 85% |
| Dimensioni max | 1920px lato lungo |

### Profilo Presentazione

| Impostazione | Valore |
|---|---|
| Formato | PDF |
| Risoluzione | 150 DPI |
| Colore | RGB |
| Qualità | Alta |
| Interattivo? | No |

### Profilo Bozza/Review

| Impostazione | Valore |
|---|---|
| Formato | JPG |
| Risoluzione | 72 DPI |
| Qualità | 60% |
| Watermark | Opzionale |

## Step 4: Esporta pagine singole come JPG separate

```extendscript
var doc = app.activeDocument;
var outputDir = "/output/pagine/";
var folder = Folder(outputDir);
if (!folder.exists) folder.create();

for (var p = 0; p < doc.pages.length; p++) {
    doc.jpegExportPreferences.pageRange = String(p + 1);
    doc.exportFile(
        ExportFormat.JPG,
        File(outputDir + "/pagina_" + String(p + 1) + ".jpg"),
        false
    );
}
```

## Step 5: Esporta tramite Bridge-Proxy (per PNG e formati extra)

Se hai bisogno di PNG o formati non supportati da ExtendScript, usa il bridge-proxy:

Tool: `script_run` con comando JXA tramite `bridge-proxy.mjs`

```javascript
// bridge-proxy.mjs via osascript/JXA
// Esporta come PNG usando le API InDesign via AppleScript
var app = Application('Adobe InDesign 2025');
var doc = app.activeDocument;
doc.export({
    to: Path('/output/file.png'),
    using: 'PNG',
    versionComments: '',
    forceSave: false
});
```

## Step 6: Verifica output

Dopo l'export batch, usa la skill `export-verify` su CIASCUN formato:

1. **PDF**: apri in Acrobat e verifica:
   - Font sono incorporati?
   - Pagine sono tutte presenti?
   - I segni di stampa sono corretti?
   - Il file si apre senza errori?

2. **JPG/PNG**: verifica pixel a campione:
   - Risoluzione corretta
   - Colori realistici
   - Nessun artefatto di compressione

3. **Dimensione file**:
   - PDF stampa: OK fino a 50MB per 16 pagine
   - JPG preview: < 2MB per pagina
   - PNG web: < 500KB per pagina

## Organizzazione output consigliata

```
output/
└── NomeDocumento/
    ├── stampa/
    │   └── NomeDocumento.pdf
    ├── web/
    │   ├── pagina_1.jpg
    │   ├── pagina_2.jpg
    │   └── ...
    ├── preview/
    │   ├── low-res.jpg
    │   └── social-card.jpg
    └── report-export.txt
```

## Script completo batch

```extendscript
function exportBatch(documento, outputBase) {
    var doc = app.activeDocument;
    var name = documento.replace(/\.[^\.]+$/, "");
    var outDir = Folder(outputBase + "/" + name);
    if (!outDir.exists) outDir.create();
    
    // PDF stampa
    doc.exportFile(ExportFormat.PDF_TYPE, File(outDir + "/" + name + ".pdf"));
    
    // JPG preview (tutte le pagine)
    var jpgDir = Folder(outDir + "/jpg");
    if (!jpgDir.exists) jpgDir.create();
    for (var p = 0; p < doc.pages.length; p++) {
        doc.jpegExportPreferences.pageRange = String(p + 1);
        doc.exportFile(
            ExportFormat.JPG,
            File(jpgDir + "/" + name + "_pag" + (p + 1) + ".jpg")
        );
    }
    
    // Report
    var report = File(outDir + "/export-report.txt");
    report.open("w");
    report.writeln("Export completato: " + new Date());
    report.writeln("Pagine: " + doc.pages.length);
    report.close();
    
    return outDir;
}

exportBatch(app.activeDocument.name, "~/Desktop/output");
```

## Casi noti

| Problema | Soluzione |
|---|---|
| Export fallisce su pagina con errore | Isola la pagina problematica e riesporta senza |
| PDF troppo grande | Abbassa risoluzione immagini a 150 DPI o usa compressione JPEG |
| Nome file con caratteri speciali | Sostituisci spazi/acento con underscore |
| Bleed non applicato in PDF | `doc.documentPreferences.documentBleedUniformSize = 3` |
| JPG nero/trasparente | Verifica colore sfondo pagina sia bianco |
| Memory error su documento grande | Esporta una pagina alla volta |
