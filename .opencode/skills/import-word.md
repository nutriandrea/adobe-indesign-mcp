---
name: import-word
description: Importa file .docx in InDesign, mappa automaticamente gli stili Word in stili InDesign, preserva gerarchia titoli/corpo
triggers:
  - "importa word"
  - "docx"
  - "importa documento"
  - "word in indesign"
  - "mappa stili"
  - "import .docx"
  - "word"
---

# Skill: Import Word → InDesign con mappatura stili

## Scopo

Importare un file `.docx` in InDesign preservando la struttura (titoli, sottotitoli, corpo) e mappando automaticamente gli stili Word in stili InDesign già presenti o crearli se non esistono.

## Workflow

```
APRI/CREA documento → PLACE .docx → LEGGI stili importati → MAPPA stili Word → stili InDesign → PULISCI
```

## Step 1: Place del file .docx

Non esiste un tool dedicato all'import di un `.docx`: usa `script_run` per fare il place:

```extendscript
app.activeDocument.place(File("/path/al/file.docx"));
// Il .docx viene importato mantenendo gli stili Word
// come paragraph style "Heading 1", "Heading 2", "Normal", ecc.
```

Se vuoi importare su una pagina specifica:

```extendscript
var pagina = app.activeDocument.pages[0];
pagina.place(File("/path/al/file.docx"));
```

## Step 2: Leggi gli stili importanti

Dopo il place, usa `text_getStories` per vedere il contenuto importato. Poi usa `style_listParagraph` per vedere gli stili disponibili.

Gli stili Word arrivano con nomi tipo:
| Stile Word | Nome in InDesign |
|---|---|
| Titolo 1 | `Heading 1` o `"Heading 1"` |
| Titolo 2 | `Heading 2` |
| Titolo 3 | `Heading 3` |
| Corpo | `Normal` o `Paragraph Style 1` |
| Elenco | `List Paragraph` |

## Step 3: Mappa stili

Per ogni stile Word importato, crea (se non esiste) o applica lo stile InDesign corrispondente:

```extendscript
function mappaStile(nomeWord, nomeInDesign, proprieta) {
    var doc = app.activeDocument;
    var stile = doc.paragraphStyles.item(nomeInDesign);
    if (!stile.isValid) {
        stile = doc.paragraphStyles.add({name: nomeInDesign});
    }
    // Applica proprietà
    if (proprieta.fontFamily) stile.appliedFont = proprieta.fontFamily;
    if (proprieta.fontStyle) stile.fontStyle = proprieta.fontStyle;
    if (proprieta.size) stile.pointSize = proprieta.size;
    if (proprieta.color) stile.fillColor = doc.colors.item(proprieta.color);
    if (proprieta.alignment) stile.justification = proprieta.alignment;
    if (proprieta.leading) stile.leading = proprieta.leading;
    if (proprieta.spaceBefore) stile.spaceBefore = proprieta.spaceBefore;
    if (proprieta.spaceAfter) stile.spaceAfter = proprieta.spaceAfter;
    
    // Applica a tutti i paragrafi con quello stile
    doc.stories.everyItem().paragraphs.everyItem().appliedParagraphStyle = stile;
}
```

### Mappatura consigliata (default pulito)

| Stile Word | Stile InDesign | Font | Size | Colore |
|---|---|---|---|---|
| `Heading 1` | `Titolo 1` | Bold, famiglia cliente | 28pt | Primario |
| `Heading 2` | `Titolo 2` | Bold/SemiBold | 18pt | Primario |
| `Heading 3` | `Titolo 3` | SemiBold | 14pt | Secondario |
| `Normal` | `Corpo` | Regular | 10pt | Testo |
| `List Paragraph` | `Elenco` | Regular | 10pt | Testo |

## Step 4: Se lo stile InDesign non esiste, CREALO

Usa `style_createParagraph` per creare lo stile prima di applicarlo:

```extendscript
var doc = app.activeDocument;
var nuovoStile = doc.paragraphStyles.add({name: "Titolo 1"});
nuovoStile.appliedFont = "Arial";
nuovoStile.fontStyle = "Bold";
nuovoStile.pointSize = 28;
nuovoStile.fillColor = doc.colors.item("Blu Primario");
nuovoStile.justification = Justification.LEFT_ALIGN;
nuovoStile.spaceAfter = 12;
```

## Step 5: Pulisci il documento

Dopo la mappatura:

1. **Rimuovi stili inutilizzati**: `doc.paragraphStyles.item("Normal").remove()` (se non serve)
2. **Aggiorna il sommario** se presente
3. **Verifica overflow** con `layout-readability` skill
4. **Verifica visiva** con `export-verify` skill

## Comportamento con immagini nel .docx

Le immagini nel .docx vengono importate come `Rectangle` con `imageType` > 0. Per ottimizzarle:

```extendscript
// Ridimensiona tutte le immagini importate al 100%
for (var i = 0; i < doc.rectangles.length; i++) {
    var r = doc.rectangles[i];
    if (r.imageType !== undefined && r.imageType > 0) {
        r.fit(FitOptions.FILL_PROPORTIONALLY);
    }
}
```

## Casi noti

| Problema | Causa | Soluzione |
|---|---|---|
| Testo non visibile | Colore testo = bianco su sfondo bianco | Applica colore `doc.colors.item("Black")` |
| Stili Word non riconosciuti | Versione InDesign vecchia | Usa `app.paragraphStyles[0]` invece di item() |
| Tabelle importate male | InDesign non supporta tabelle Word complesse | Ricrea tabella con tool `table_create` |
| Immagini mancanti | I link del .docx si rompono | Reinserisci immagini con `image_place` |
| Caratteri speciali persi | Encoding del .docx | Converti in .doc prima dell'import |
