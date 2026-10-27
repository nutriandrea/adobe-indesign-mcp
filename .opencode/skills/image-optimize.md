---
name: image-optimize
description: Place, ridimensionamento, ottimizzazione e gestione immagini in InDesign
triggers:
  - "immagine"
  - "image"
  - "foto"
  - "place"
  - "ridimensiona"
  - "ottimizza"
  - "png"
  - "jpg"
  - "resize image"
  - "image place"
  - "relink"
---

# Skill: Image Optimize — Gestione Immagini

## Scopo

Inserire, ridimensionare, ottimizzare e gestire immagini in un documento InDesign, garantendo qualità di stampa e dimensioni file contenute.

## Workflow

```
PLACE immagine → POSIZIONA → RIDIMENSIONA → OTTIMIZZA (DPI/risoluzione) → VERIFICA
```

## Step 1: Place immagine

Usa `image_place` per inserire un'immagine:

Tool: `image_place`
Argomenti: `{ pageIndex, filePath, left, top, width, height }`

```extendscript
// Place su pagina corrente
app.activeDocument.pages[0].place(File("/path/immagine.jpg"));

// Place con posizione
var frame = app.activeDocument.pages[0].rectangles.add();
frame.geometricBounds = ["20mm", "20px", "100mm", "150mm"];
frame.place(File("/path/immagine.jpg"));
```

**Formati supportati**: JPG, PNG, TIFF, PSD, AI, PDF, EPS

## Step 2: Ridimensiona

Tool: `shape_create` con dimensioni specifiche, oppure `script_run`:

```extendscript
// Fit proporzionale
frame.fit(FitOptions.FILL_PROPORTIONALLY);

// Fit contenuto al frame
frame.fit(FitOptions.FRAME_TO_CONTENT);

// Fit centro
frame.fit(FitOptions.CENTER_CONTENT);

// Ridimensionamento personalizzato
frame.geometricBounds = ["10mm", "10mm", "100mm", "150mm"];
```

### Regole di composizione

| Tipo immagine | Comportamento |
|---|---|
| Fotografia | `FILL_PROPORTIONALLY` (riempi il frame) |
| Logo/Icona | `FRAME_TO_CONTENT` + centro |
| Grafica vettoriale | Scala proporzionale, nessun crop |
| Sfondo | Estendi a tutta pagina + bleed 3mm |

## Step 3: Ottimizza per output

### Per stampa (offset/digitale)
- **Risoluzione**: 300 DPI
- **Formato**: TIFF o JPG qualità 10+
- **Colore**: CMYK
- **Profondità colore**: 8-bit

### Per web/social
- **Risoluzione**: 72 DPI
- **Formato**: JPG qualità 80% o PNG (con trasparenza)
- **Colore**: RGB
- **Dimensione max file**: 500KB

### Per presentazione (PDF)
- **Risoluzione**: 150 DPI
- **Formato**: JPG qualità 85%
- **Colore**: RGB o CMYK (dipende dal dispositivo finale)

### Verifica DPI correnti di un'immagine

```extendscript
var frame = app.activeDocument.rectangles[0];
if (frame.imageType > 0) {
    var dpiX = frame.horizontalResolution;
    var dpiY = frame.verticalResolution;
    // Se < 300 per stampa → SEGNALA
}
```

## Step 4: Ottimizzazione collegamenti

Usa `image_getLinks` per vedere lo stato dei link:

```extendscript
for (var i = 0; i < app.activeDocument.links.length; i++) {
    var link = app.activeDocument.links[i];
    // link.status: LinkStatus.NORMAL, LINK_OUT_OF_DATE, LINK_MISSING
    if (link.status !== LinkStatus.NORMAL) {
        // link.relink(File(nuovoPercorso));
    }
}
```

### Best practice link
- **Preferisci link** (non embedding): mantiene il documento leggero
- **Embedding**: solo per condivisione/archiviazione (usa `resources_embedLink`)
- **Immagini collegate**: tieni in cartella `_images/` vicino al documento

## Step 5: Esporta con immagini ottimizzate

Usa `export_document` con le giuste impostazioni:

**Per PDF di stampa:**
```extendscript
app.activeDocument.exportFile(
    ExportFormat.PDF_TYPE,
    File("/output/stampa.pdf"),
    false,
    { exportResolution: 300 }
);
```

**Per JPG preview:**
```extendscript
app.activeDocument.exportFile(
    ExportFormat.JPG,
    File("/output/preview.jpg"),
    false
);
```

## Verifica qualità

Usa la skill `export-verify` per controllare:
1. Esporta JPG a 150 DPI
2. Campiona pixel nelle aree immagine
3. Verifica che non ci siano artefatti visibili
4. Verifica che i colori siano corretti

## Casi noti

| Problema | Causa | Soluzione |
|---|---|---|
| Immagine sgranata in output | DPI troppo basso (< 200) | Sostituisci con versione ad alta risoluzione |
| Colori diversi da attesi | RGB vs CMYK mismatch | Converti profilo colore prima del place |
| Immagine non visibile | Layer bloccato o nascosto | `layer.visible = true` |
| Place fallisce | Percorso file errato o permessi | Verifica percorso, usa `File()` con path assoluto |
| Memory error con molte immagini | Documento troppo pesante | Link immagini invece di embed |
| Frame rosso (link mancante) | File spostato/cancellato | `resources_updateLink` con nuovo percorso |
