---
name: export-verify
description: Processo obbligatorio di esportazione → analisi pixel → correzione dopo ogni modifica InDesign
triggers:
  - "esporta"
  - "verifica"
  - "esportazione"
  - "pixel"
  - "analisi"
  - "controllo qualità"
  - "riesporta"
  - "riesporto"
---

# Skill: Export & Verify — Processo Obbligatorio

## Regola Fondamentale

Dopo **OGNI modifica significativa** a una pagina InDesign, l'agente DEVE eseguire il ciclo:

```
MODIFICA → ESPORTA (JPG/PDF) → ANALISI (pixel) → VERIFICA → CORREGGI → RIPETI
```

Nessuna modifica è completa senza una verifica visiva automatica.

## Step 1: Esporta

Usa AppleScript/JXA per esportare la pagina modificata:

```javascript
// JXA: esporta pagina specifica come JPG a 150dpi
var app = Application("Adobe InDesign 2026");
app.doScript(
  'app.jpegExportPreferences.pageString = "' + pageNumber + '";' +
  'app.jpegExportPreferences.exportResolution = 150;' +
  'app.activeDocument.exportFile(' +
  '  ExportFormat.JPG,' +
  '  File("/tmp/verify-" + ' + pageNumber + ' + ".jpg"),' +
  '  false' +
  ');',
  { language: "javascript" }
);
```

> **Nota**: Esporta sempre in `/tmp/` per evitare permessi macOS TCC. Poi copia su Desktop solo per delivery finale.

## Step 2: Analisi Pixel (Python PIL)

```python
from PIL import Image

def verify_page(jpg_path, known_elements, page_mm=(210, 297)):
    """
    known_elements: lista di dict con {name, x_mm, y_mm, expected_rgb, tolerance}
    Ritorna: {pass: bool, results: [{name, expected, actual, pass, diff}]}
    """
    img = Image.open(jpg_path)
    w, h = img.size
    def mm_to_px(mm, axis_size_px, axis_size_mm):
        return int(mm * axis_size_px / axis_size_mm)

    results = []
    for el in known_elements:
        px = mm_to_px(el["x_mm"], w, page_mm[0])
        py = mm_to_px(el["y_mm"], h, page_mm[1])
        actual = img.getpixel((px, py))
        expected = el["expected_rgb"]
        diff = sum(abs(actual[i] - expected[i]) for i in range(3))
        passed = diff <= (el.get("tolerance", 30) * 3)
        results.append({
            "name": el["name"],
            "expected": expected,
            "actual": actual,
            "pass": passed,
            "diff": diff
        })

    return results
```

### Cosa campionare (MINIMO):

| Elemento | Punti da campionare |
|----------|-------------------|
| **Sfondo** | 3 punti (angolo sup-sx, centro, angolo inf-dx) |
| **Ogni forma colorata** | 1 punto al centro della forma |
| **Ogni testo** | 3 punti nella bounding box del testo |
| **Linee** | 1 punto a metà linea |
| **Aree critiche** (sovrapposizioni) | Punto esatto di sovrapposizione |

## Step 3: Verifica Strutturale (JXA)

Dopo la verifica pixel, controlla la struttura del documento:

```javascript
// JXA: verifica conteggio elementi per pagina
app.doScript(
  'var d = app.activeDocument;' +
  'var p = d.pages[' + pageIndex + '];' +
  '"Rects:" + p.rectangles.length + ' +
  '" Ovals:" + p.ovals.length + ' +
  '" Texts:" + p.textFrames.length + ' +
  '" Lines:" + p.graphicLines.length;',
  { language: "javascript" }
);
```

Verifica che il numero di elementi corrisponda a quanto atteso.

## Step 4: Extrai Testo da PDF

Se il JPG non basta, esporta PDF della pagina e usa `pdftotext`:

```bash
pdftotext /tmp/verify-pageN.pdf - 2>&1
```

Questo rivela se il testo è presente anche se non visibile a bassa risoluzione.

## Step 5: Criteri di Accettazione

| Condizione | Esito |
|-----------|-------|
| Tutti i pixel campionati corrispondono (±30 per canale) | [OK] PASS |
| Colori corretti ma testo non campionato correttamente | [OK] PASS (se pdftotext conferma presenza testo) |
| 1-2 elementi con colore leggermente fuori tolleranza (±40) | [Warning] WARN (documenta, procedi) |
| Testo invisibile O sovrapposizioni illeggibili | [Issue] FAIL (CORREGGI IMMEDIATAMENTE) |
| Elementi mancanti o fuori posizione (>10px) | [Issue] FAIL (CORREGGI) |

## Step 6: Ciclo di Correzione

Se FAIL:
1. **Identifica la causa esatta** (non tentare fix casuali)
2. **Fai UNA modifica mirata**
3. Ricomincia da Step 1 (esporta)
4. Se dopo 3 tentativi persiste FAIL → **RIPRISTINA** all'ultima versione funzionante

Se WARN:
1. Correggi i warning più gravi (se fattibile in 1-2 modifiche)
2. Altrimenti documenta e procedi

## Completamento

Solo quando il report finale è **PASS** con al massimo WARN minori, il task può considerarsi completato.

Consegna all'utente:
1. File INDD salvato su Desktop
2. PDF finale su Desktop  
3. JPG di anteprima su Desktop
4. Report di verifica conciso ("Tutti i check passati" / "2 warning: ...")

## Casi noti

| Problema | Causa probabile | Fix |
|----------|----------------|-----|
| Testo bianco invece che nero nel JPG | fillColor non applicato correttamente | Usa `texts[0].fillColor` o `characters.everyItem().fillColor` |
| Forma colore sbagliato | Swatch non trovato (nome errato) | Verifica nome esatto, usa `doc.colors.item("Nome")` |
| Elementi non presenti sulla pagina | Indice pagina errato | `d.pages[INDEX]` dove INDEX = numero_pagina - 1 |
| JPG non si genera | ExportFormat o percorso file errato | Usa `ExportFormat.JPG` non `ExportFormat.jpgType` |
| Testo non si vede in JPG ma c'è nel PDF | Risoluzione troppo bassa per font piccolo | Aumenta a 300dpi per verifica, o usa pdftotext per conferma |
