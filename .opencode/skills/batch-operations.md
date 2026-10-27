---
name: batch-operations
description: Operazioni bulk su multiple pagine di un documento InDesign — stessa modifica su N pagine
triggers:
  - "batch"
  - "bulk"
  - "tutte le pagine"
  - "ogni pagina"
  - "multipla"
  - "group operation"
  - "operazione di gruppo"
  - "massivo"
  - "stessa modifica"
---

# Skill: Batch Operations — Operazioni Bulk su Pagine

## Scopo

Applicare la **stessa modifica** a più pagine (o a tutte le pagine) di un documento InDesign in una singola operazione, evitando di ripetere N volte la stessa tool call.

## Pattern Generale

```
SELEZIONA pagine (range/tutte) → DEFINISCI operazione → APPLICA a ogni pagina → VERIFICA
```

## Metodo 1: Via ExtendScript (batch lato InDesign)

Usa `script_run` per fare un ciclo su tutte le pagine in un unico script:

```extendscript
var doc = app.activeDocument;
var totalPages = doc.pages.length;

// Definisci range
var startPage = 0;  // 0-based
var endPage = totalPages - 1;

for (var p = startPage; p <= endPage; p++) {
    var page = doc.pages[p];
    
    // --- OPERAZIONE DA APPLICARE ---
    // Esempio: aggiungi un elemento a ogni pagina
    // Esempio: modifica margini
    // Esempio: applica master spread
    // ---
}
```

### Esempi pronti

**Applicare master spread a un range di pagine:**

```extendscript
var doc = app.activeDocument;
var master = doc.masterSpreads.item("Master A");
if (master.isValid) {
    for (var p = 0; p < doc.pages.length; p++) {
        doc.pages[p].appliedMaster = master;
    }
}
```

**Aggiungere lo stesso testo a tutte le pagine:**

```extendscript
var doc = app.activeDocument;
for (var p = 0; p < doc.pages.length; p++) {
    var tf = doc.pages[p].textFrames.add();
    tf.geometricBounds = ["10mm", "10mm", "20mm", "80mm"];
    tf.contents = "Testo ripetuto su ogni pagina";
    tf.fillColor = doc.colors.item("Black");
}
```

**Esportare tutte le pagine come JPG separate:**

```extendscript
var doc = app.activeDocument;
for (var p = 0; p < doc.pages.length; p++) {
    doc.jpegExportPreferences.pageString = String(p + 1);
    doc.exportFile(
        ExportFormat.JPG,
        File("/tmp/pagina_" + (p + 1) + ".jpg"),
        false
    );
}
```

## Metodo 2: Via MCP tool ripetuto (fallback)

Se l'operazione non è facilmente esprimibile in ExtendScript, usa una sequenza di tool call:

```
1. page_listAll → ottieni lista pagine con indici
2. Per ogni pagina INDEX: chiama il tool con pageIndex = INDEX
```

## Operazioni Bulk Supportate

| Operazione | Tool | Parametro bulk |
|---|---|---|
| Applicare master | `page_applyMaster` + ciclo script | Range di indici |
| Aggiungere elemento | `object_*` + ciclo script | Per ogni pagina |
| Esportare | `export_document` + ciclo script | Per ogni pagina |
| Verificare | `document_getInfo` | Singola |
| Eliminare pagine | `page_delete` | Range |

## Pattern: Salta pagine specifiche

```extendscript
var skipPages = [0, 5]; // prima pagina e pagina 6 saltate
for (var p = 0; p < doc.pages.length; p++) {
    if (skipPages.indexOf(p) > -1) continue;
    // applica operazione
}
```

## Pattern: Solo pagine dispari/pari

```extendscript
// Solo pagine dispari (0-based: 0, 2, 4...)
for (var p = 0; p < doc.pages.length; p += 2) { ... }

// Solo pagine pari (0-based: 1, 3, 5...)
for (var p = 1; p < doc.pages.length; p += 2) { ... }
```

## Verifica Post-Batch

Dopo un'operazione bulk, usa `layout-readability` skill su un campione:
- Prima pagina
- Ultima pagina
- Una pagina centrale

Se il campione è OK, l'intero batch è considerato valido.

## Casi noti

| Problema | Soluzione |
|---|---|
| Una pagina fallisce, le altre no | Usa try/catch nello script e logga l'errore |
| Operazione troppo lenta su 100+ pagine | Suddividi in blocchi da 20 pagine |
| Master spread diverso per diverse pagine | Raggruppa pagine con stesso master prima del batch |
| Pagine fronte/retro | Ricorda che pari e sinistra/destra possono avere master diversi |
