---
name: template-manager
description: Salva, carica, gestisci template di pagine InDesign — componenti riutilizzabili tra progetti
triggers:
  - "template"
  - "salva template"
  - "carica template"
  - "riutilizza"
  - "componente"
  - "modello"
  - "library"
  - "libreria"
  - "pattern page"
  - "salva come"
  - "template manager"
---

# Skill: Template Manager — Pagine Template Riutilizzabili

## Scopo

Creare, salvare e riutilizzare template di pagine InDesign (copertina, interne, footer, layout standard) per accelerare la creazione di nuovi documenti mantenendo coerenza visiva.

## Workflow

```
CREA template → SALVA template → CARICA in nuovo documento → PERSONALIZA → VERIFICA
```

## Metodo 1: File .indd come template

Il metodo più semplice: salva pagine come file `.indd` separati nella cartella `_templates/`.

### Creazione template

1. Crea un documento con la pagina/e di esempio
2. Usa `export_document` o `document_create` per salvare:

Tool: `export_document` → salva come `.indd`

```extendscript
var doc = app.activeDocument;
var templateFile = File("/templates/copertina.indd");
doc.save(templateFile);
```

## Metodo 2: Template come oggetti (file .indd a pagina singola)

Salva ogni componente come file separato:

```
_templates/
├── copertina-stile-A.indd
├── copertina-stile-B.indd
├── pagina-interna-base.indd
├── pagina-interna-immagine-grande.indd
├── footer-semplice.indd
├── footer-completo.indd
├── sommario.indd
└── contatti.indd
```

### Carica template in un documento aperto

```extendscript
// Apri il template
var templateDoc = app.open(File("/templates/copertina-stile-A.indd"));

// Copia la prima pagina
templateDoc.pages[0].duplicate(LocationOptions.AFTER, app.activeDocument.pages.last());

// Chiudi il template senza salvare
templateDoc.close(SaveOptions.NO);
```

### Pattern: carica template come nuova prima pagina

```extendscript
var doc = app.activeDocument;
var template = app.open(File("/templates/copertina.indd"));

// Inserisci all'inizio
template.pages[0].duplicate(LocationOptions.BEFORE, doc.pages[0]);
template.close(SaveOptions.NO);

// Rimuovi la vecchia prima pagina (vuota)
doc.pages[1].remove();
```

## Metodo 3: Usa file INDT (InDesign Template)

Il formato `.indt` è il template nativo di InDesign.

### Creare un .indt
```extendscript
var doc = app.activeDocument;
doc.save(File("/templates/mio-template.indt"));
```

### Aprire un template per creare un nuovo documento
Tool: `document_open` su file `.indt` — InDesign apre automaticamente una copia.

```extendscript
// Apre una copia (non l'originale)
var nuovoDoc = app.open(File("/templates/mio-template.indt"));
```

Poi puoi modificare e salvare come nuovo `.indd`.

## Metodo 4: Librerie CC (per team)

Le librerie Creative Cloud permettono di condividere template tra designer:

```extendscript
// Aggiungi pagina alla libreria CC
var library = app.libraries.item("Libreria Team");
if (!library.isValid) {
    library = app.libraries.add(File("/team-library.indl"));
}
```

**Nota**: Questo metodo funziona solo con Creative Cloud sottoscritto.

## Struttura consigliata cartella template

```
progetto/
├── _templates/
│   ├── cover/
│   │   ├── cover-modern.indd
│   │   ├── cover-classic.indd
│   │   └── cover-eco.indd
│   ├── internals/
│   │   ├── text-only.indd
│   │   ├── text-image.indd
│   │   └── full-image.indd
│   ├── components/
│   │   ├── header.indd
│   │   ├── footer.indd
│   │   ├── sidebar.indd
│   │   └── table-of-contents.indd
│   └── exports/
│       ├── press-export-config.json
│       └── web-export-config.json
```

## Creare nuovi documenti da template

### Passaggio 1: Carica template
```extendscript
var doc = app.documents.add();
```

### Passaggio 2: Applica template pagine
```extendscript
var template = app.open(File("/_templates/copertina-stile-A.indd"));
template.pages[0].duplicate(LocationOptions.BEFORE, doc.pages[0]);
template.close(SaveOptions.NO);
doc.pages[1].remove();  // rimuovi pagina vuota
```

### Passaggio 3: Applica footer a tutte le pagine
```extendscript
var footerTemplate = app.open(File("/_templates/footer-semplice.indd"));
var footerPage = footerTemplate.pages[0];

for (var p = 0; p < doc.pages.length; p++) {
    // Copia elementi del footer sulla pagina
    for (var i = 0; i < footerPage.allPageItems.length; i++) {
        footerPage.allPageItems[i].duplicate(doc.pages[p]);
    }
}
footerTemplate.close(SaveOptions.NO);
```

## Verifica template

Usa la skill `layout-readability` dopo il caricamento:
1. Overflow testo (specialmente placeholders)
2. Margini e bleed (devono corrispondere al template)
3. Allineamento elementi
4. Colori e font presenti (non mancanti)

## Casi noti

| Problema | Soluzione |
|---|---|
| Template ha font non installati | Usa `app.fonts` per verificare la presenza prima del template |
| Link immagini template rotti | Aggiorna path con `resources_updateLink` dopo il caricamento |
| Colori template non presenti | Crea colore mancante con `color_swatch_create` |
| Master spread non copiati | Usa `doc.masterSpreads[0].duplicate()` per copiare i master dal template |
| Pagina template troppo larga | Ridimensiona elementi dopo il place |
| Placeholder testo NON sostituito | Cerca "Lorem" o "Titolo" e chiedi all'utente di personalizzare |
