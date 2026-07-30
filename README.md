<p align="center">
  <img src="https://img.shields.io/github/stars/nutriandrea/adobe-indesign-mcp?style=social" alt="Stars">
  <img src="https://img.shields.io/badge/InDesign-2022%2B-blue" alt="InDesign">
  <img src="https://img.shields.io/badge/MCP-1.0-green" alt="MCP">
  <img src="https://img.shields.io/badge/tools-183-success" alt="Tools">
  <img src="https://img.shields.io/badge/tests-747%2B-yellow" alt="Tests">
  <img src="https://img.shields.io/npm/v/adobe-indesign-mcp" alt="npm">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="License">
</p>

<h1 align="center">Adobe InDesign MCP</h1>
<p align="center"><b>Full InDesign DOM control from any AI agent.</b><br>
183 tools · 31 handlers · TypeScript · MCP-native</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#what-it-can-do">What It Can Do</a> •
  <a href="#tools">All 183 Tools</a> •
  <a href="docs/origin.md">Origin Story</a> •
  <a href="#comparison">vs CEP vs ExtendScript</a>
</p>

---

## Why This Exists

**InDesign automation has been broken for 20 years.**

| Method | Pain |
|--------|------|
| **ExtendScript** | ES3 dialect from 1999. No modules, no promises, no debugger. One syntax error crashes the whole script. |
| **CEP panels** | HTML+JS from 2012. Giant SDK, fragile manifests, DOM access through black-box bridges. |
| **Manual UI** | Click → panel → menu → dialog. Repeat for every document. No scriptability without AppleScript/JXA. |

**MCP changed the game.** Instead of writing scripts in a dead language,
you describe what you want in natural language and an AI agent executes it
through MCP tools. This server bridges that gap — **183 tools covering the
full InDesign DOM**, from document creation to PDF export.

---

## Quick Start

### Install

```bash
npm install -g adobe-indesign-mcp
```

Or from source:

```bash
git clone https://github.com/nutriandrea/adobe-indesign-mcp
cd adobe-indesign-mcp && npm install && npm run build
```

### 1. Start the server

```bash
npx adobe-indesign-mcp opencode-indesign.json
```

### 2. Load the plugin in InDesign

1. Launch **Adobe InDesign**
2. Open **UXP Developer Tool**
3. Load the `plugin/` directory
4. Click **Connect** (WebSocket → `ws://localhost:8120`)

### 3. Connect your AI

```json
{
  "mcpServers": {
    "indesign": {
      "command": "npx",
      "args": ["adobe-indesign-mcp", "opencode-indesign.json"]
    }
  }
}
```

### What you can say

> *"Create an A4 document with 5 pages. Add a red circle on page 3 and 'Hello' in Arial Bold 24pt."*

> *"Find all text in Bold in the document."*

> *"Export this document as PDF with press quality."*

---

## How It Works

```
┌────────────────┐     STDIO      ┌──────────────────┐    WebSocket     ┌──────────────┐
│   AI Agent     │ ◄──────────►   │  MCP Server      │ ◄─────────────► │  InDesign    │
│  (OpenCode,    │                │  (Node.js)        │    port 8120    │  + UXP plugin│
│   Claude, ...) │                │  183 tools        │                 │              │
└────────────────┘                └──────────────────┘                 └──────────────┘
```

Two transports:
- **STDIO** — MCP protocol between AI agent and this server
- **WebSocket** (port 8120) — connects the server to InDesign's UXP plugin

Every tool call is translated to ExtendScript, executed inside InDesign,
and the result is returned as structured JSON. The agent never touches
ExtendScript directly.

### MCP Resources

| Resource | What it provides |
|----------|------------------|
| `mcp://tools/inventory` | Full list of all 183 tools (agent auto-discovery) |
| `mcp://document/active` | Currently active document info |
| `mcp://session/status` | Session state |
| `mcp://bridge/status` | WebSocket connection + queue depth |

---

## What It Can Do

### 🏗️ Document & Pages

| Tools | What |
|-------|------|
| `document_create`, `open`, `save`, `close`, `getInfo` | Full document lifecycle |
| `page_add`, `delete`, `duplicate`, `move`, `listAll` | Page management |
| `master_create`, `apply`, `duplicate`, `delete` | Master spread control |
| `section_create`, `setNumbering` | Page numbering sections |

### ✏️ Text & Typography

| Tools | What |
|-------|------|
| `text_addFrame`, `setContent`, `getContent` | Text frame CRUD |
| `text_getFormatting` | Read font/size/style per range |
| `text_applyCharStyle`, `text_applyFont` | Apply formatting to range |
| `text_search` (GREP) | Find text with pattern |
| `text_searchFormatting` | Find by font/size/style |
| `text_setColumns`, `setInsetSpacing`, `setVerticalJustification` | Frame layout |
| `text_setDropCap`, `setHyphenation`, `setKeepOptions` | Paragraph typography |
| `text_setParagraphRuleAbove/Below` | Paragraph rules |
| `text_setTabs` | Tab stops |

### 🎨 Shapes & Color

| Tools | What |
|-------|------|
| `shape_rectangle`, `ellipse`, `line`, `polygon` | Create geometric shapes |
| `shape_modify`, `delete` | Edit shapes |
| `color_swatch_create`, `delete`, `list` | CMYK/RGB/Spot/LAB swatches |
| `color_gradient_create`, `apply` | Linear/radial gradients |

### 🖼️ Images & Resources

| Tools | What |
|-------|------|
| `image_place`, `info`, `fit`, `adjust`, `relink` | Image placement and editing |
| `resources_listLinks`, `updateLink`, `embedLink` | Link management |

### 📊 Tables

| Tools | What |
|-------|------|
| `table_create`, `setCell`, `getInfo` | Table CRUD |
| `table_addRow/Column`, `deleteRow/Column` | Structure editing |
| `table_mergeCells`, `splitCell` | Cell merging |
| `table_setCellAlignment`, `setCellFill`, `setCellStroke` | Cell styling |
| `table_setHeaderFooter`, `setRowColumnSize` | Layout |

### 📦 Import & Export

| Tools | What |
|-------|------|
| `export_document` | PDF, EPUB, HTML, JPG, PNG, package |
| `grep_find`, `grep_replace` | GREP find/replace |
| `dataMerge_selectDataSource`, `mergeRecords` | Data merge |

### 🧠 Effects & Transform

| Tools | What |
|-------|------|
| `effect_applyDropShadow`, `applyFeather`, `applyTransparency` | Visual effects |
| `transform_rotate`, `scale`, `flip`, `align`, `distribute` | Object transform |

### 🛡️ Safety & Debug

| Tools | What |
|-------|------|
| `undo_beginGroup`, `undo_endGroup` | Group operations into one undo step |
| `script_run(code, debug=true)` | Raw ExtendScript with full stack traces |
| BOM filtering | Control chars filtered by default in text reads |
| Custom timeout | Timeout + maxResults on large document reads |

---

## AI Skills Included

This repo ships **10 OpenCode skills** that auto-load when you talk about
the relevant topic:

| Skill | Trigger keywords |
|-------|-----------------|
| **Aesthetic Preference** | font, palette, style, margins |
| **Layout Readability** | overlap, contrast, hierarchy, overflow |
| **Export & Verify** | export, jpg, png, verify |
| **Import Word** | word, docx |
| **Batch Operations** | batch, bulk, all pages |
| **Image Optimize** | image, dpi, cmyk, rgb |
| **Table Format** | table, column, row, border |
| **Template Manager** | template, save, load |
| **Export Batch** | export all formats |
| **Style Extractor** | extract style, profile, replicate |

---

## Comparison

| | **This MCP** | ExtendScript | CEP Panel | Manual |
|---|------------|-------------|-----------|--------|
| **Language** | Natural language | ES3 (1999) | HTML+JS | Mouse + keyboard |
| **Tools** | 183 | Unlimited* | Limited | — |
| **Debugging** | Structured errors | `$.writeln()` | Console | None |
| **Setup time** | 5 min | Hours | Days | Instant |
| **Reusable** | Yes (prompts) | Yes (scripts) | Yes (panels) | No |
| **Learning curve** | Low | High | Very high | None |
| **Modern JS** | Yes (TypeScript) | No (ES3) | Yes | N/A |

*\* Technically unlimited but you have to write them in ExtendScript*

---

## Projects & Users

This server is used in production for:

- **Book layout automation** — multi-chapter document assembly with style syncing
- **Portfolio generation** — programmatic document creation from JSON data
- **Magazine production** — batch text + image placement across 100+ pages
- **Template factories** — Generate branded document templates from a JSON config

---

## Test Suite

```bash
npm test        # 747+ tests (vitest)
npm run lint    # ESLint
npm run build   # TypeScript strict mode
```

---

## Requirements

- **Adobe InDesign** 2022 or later (2024/2025/2026 recommended)
- **macOS** (Windows support via CEP planned)
- **Node.js** 18+

---

## Contributing

PRs welcome. The handler pattern is simple:

1. Create `src/handlers/YourHandler.ts`
2. Implement tools with Zod schemas
3. Register in `IndesignMcpServer.ts`
4. Add tests

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Origin

Read the full story in [docs/origin.md](docs/origin.md) — how this project
evolved from a UXP proof-of-concept to 183 tools, what the hardest bugs
were, and why MCP is the future of InDesign automation.

---

<p align="center">
  <b>Adobe InDesign MCP</b><br>
  <a href="https://github.com/nutriandrea/adobe-indesign-mcp">github.com/nutriandrea/adobe-indesign-mcp</a><br>
  <sub>MIT — Free to use, modify, and extend</sub>
</p>
