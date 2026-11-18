---
name: layout-readability
description: Validazione automatica del layout, posizionamento e leggibilità dei contenuti InDesign
triggers:
  - "leggibilità"
  - "sovrapposizione"
  - "layout"
  - "allineamento"
  - "contrasto"
  - "verifica layout"
  - "controllo"
---

# Skill: Controllo Layout e Leggibilità

## Scopo

Validare automaticamente che il layout di una pagina InDesign sia leggibile, bilanciato e privo di errori di impaginazione. Questa skill va Eseguita **dopo ogni modifica significativa** e **prima di considerare un task completato**.

## Checklist di Validazione

Per OGNI pagina modificata, verifica ciascun punto:

### 1. Sovrapposizioni illeggibili [Issue]

```
[Issue] Testo su sfondo colorato senza contrasto sufficiente
   → Esempio: testo nero su rosso scuro, testo bianco su giallo chiaro
[OK] Testo con contrasto ≥ 3:1 (ideale ≥ 4.5:1)
```

**Come verificare (via pixel analysis):**
```python
# Campiona 3 pixel nell'area testo + 3 pixel nell'area sfondo
# Calcola il rapporto di contrasto relativo
# Se < 3:1 → SEGNALA
```

### 2. Andate a capo innaturali [Issue]

```
[Issue] "PORTFO-\nLIO" invece di "PORTFOLIO" su una riga
[Issue] "ANDREA\nCACIOPPO" se lo spazio permette di stare in una riga
[Issue] Una singola parola che va a capo da sola (orfana)
```

**Regole:**
- Titoli e nomi propri NON devono andare a capo
- Se lo spazio orizzontale è sufficiente, mantieni su una riga
- Se il testo va a capo, verifica che ogni spezzone sia bilanciato
- Eccezione: se l'andata a capo fa PARTE dello stile (es. Futurismo), documentalo

### 3. Contrasto colore [Issue]

Calcola per ogni testo:
- **Testo normale**: rapporto ≥ 4.5:1
- **Testo grande** (≥ 18pt o ≥ 14pt bold): rapporto ≥ 3:1

```python
def relative_luminance(r, g, b):
    rs, gs, bs = r/255, g/255, b/255
    rl = rs/12.92 if rs <= 0.03928 else ((rs+0.055)/1.055)**2.4
    gl = gs/12.92 if gs <= 0.03928 else ((gs+0.055)/1.055)**2.4
    bl = bs/12.92 if bs <= 0.03928 else ((bs+0.055)/1.055)**2.4
    return 0.2126*rl + 0.7152*gl + 0.0722*bl

def contrast_ratio(l1, l2):
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
```

### 4. Gerarchia Visiva [Issue]

```
[Issue] Titolo più piccolo del sottotitolo
[Issue] Elementi di pari importanza con dimensioni molto diverse
[Issue] Testo corpo più grande del titolo
[Issue] Mancanza di gerarchia (tutto uguale)
```

**Verifica:**
- Ordina per dimensione: Titolo > Sottotitolo > Corpo
- Verifica che la differenza di dimensione sia percettibile (≥ 4pt di gap)
- Il peso (Bold vs Regular) deve essere coerente col ruolo

### 5. Margini e Spaziature [Issue]

```
[Issue] Testo attaccato al bordo della pagina
[Issue] Elementi a distanza irregolare tra loro
[Issue] Margini inconsistenti tra sinistra e destra (se stile simmetrico)
```

**Verifica:**
- Nessun elemento a meno di 3mm dal bordo pagina (escluso bleed)
- Elementi raggruppati visivamente devono avere spaziatura ≤ 3mm
- Elementi separati devono avere spaziatura ≥ 5mm

### 6. Elementi fuori pagina [Issue]

```
[Issue] Forme, linee o testo che si estendono oltre il bordo pagina senza bleed
[Issue] Testo troncato dal bordo della pagina
```

**Verifica:**
- geometricBounds: nessun right > pageWidth O left < 0 O bottom > pageHeight
- Eccezione: se è previsto bleed documentato

## Procedura di Verifica (da eseguire dopo ogni modifica)

```python
def verifica_pagina(jpg_path, page_mm_size=(210, 297)):
    """
    1. Apri JPG
    2. Per ogni text frame noto, campiona 3+ pixel
    3. Calcola contrasto rispetto allo sfondo
    4. Verifica posizione (nessun overflow)
    5. Verifica andate a capo nel PDF
    6. Segnala tutti i problemi trovati
    7. Se problemi gravi (≥2), RIPRISTINA e RIPROGETTA
    """
```

## Risultato della Validazione

Al termine, produci un **report strutturato**:

```json
{
  "pagina": 4,
  "stile": "bauhaus",
  "esito": "PASS" | "WARN" | "FAIL",
  "checklist": {
    "sovrapposizioni": {"esito": "PASS", "note": ""},
    "andate_a_capo": {"esito": "PASS", "note": "PORTFOLIO su una riga"},
    "contrasto": {"esito": "WARN", "note": "Testo bianco su giallo: ratio 1.4:1"},
    "gerarchia": {"esito": "PASS", "note": "28pt titolo > 14pt sottotitolo"},
    "margini": {"esito": "PASS", "note": ""},
    "overflow": {"esito": "PASS", "note": ""}
  },
  "problemi": [
    {"gravita": "warn", "descrizione": "Testo bianco su giallo poco leggibile", "posizione": "pagina 4, x=50mm y=80mm"}
  ]
}
```

## Soglie di Accettazione

| Esito | Condizione | Azione |
|-------|-----------|--------|
| **PASS** | Tutti i check PASS o WARN | Procedi |
| **WARN** | ≥3 WARN o 1 FAIL minore | Correggi, poi ripeti verifica |
| **FAIL** | ≥2 FAIL o errori di leggibilità gravi | RIPRISTINA all'ultima versione funzionante, RIPROGETTA |
