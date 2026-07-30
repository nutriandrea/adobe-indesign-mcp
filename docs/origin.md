# Origin Story: How This Was Built

## The Problem

InDesign automation was stuck in 1999.

Adobe's scripting language, ExtendScript, is based on ECMAScript 3 —
the JavaScript standard from **1999**. No `let`, no `const`, no `Promise`,
no `async/await`, no `Map`, no `Set`. Just `var`, callbacks, and pain.

If you wanted to automate InDesign, you had three options:

1. **Write ExtendScript** in a dead language with zero debugger support
2. **Build a CEP panel** with a 200MB SDK and fragile manifest system
3. **Use AppleScript/JXA** — macOS only, slow, limited DOM access

None of these work with AI agents. None of them are modern. None of them
are *pleasant*.

## The Breakthrough: MCP + UXP

Two things changed in 2025–2026:

1. **Model Context Protocol (MCP)** — Anthropic's open standard for
   connecting AI agents to tools. Any MCP client can use any MCP server.

2. **Adobe UXP (Unified Extensibility Platform)** — Adobe's modern
   plugin system with WebSocket support. UXP plugins can run ExtendScript
   inside InDesign and return results as JSON.

The idea was obvious: build an MCP server that talks to InDesign via UXP.
AI agents would call MCP tools, the server translates them to ExtendScript,
and the results come back as structured data. **The agent never touches
ExtendScript.**

## The Evolution

### v0.1 — Proof of Concept (May 2026)

12 handlers, 81 tools. Could create documents, place text, draw shapes.
Barely stable — the WebSocket bridge disconnected randomly.

### v0.5 — The Rewrite (June 2026)

Realized the handler architecture was too rigid. Rewrote the entire server
with:
- Zod schemas for every tool parameter
- Consistent error handling (structured JSON errors, not ExtendScript stack dumps)
- Session tracking (know which document is active)
- Health checks (auto-reconnect WebSocket)

### v1.0 — Production Ready (June 2026)

28 handlers, 177 tools. Added:
- Full table support (create, style, merge, split)
- Color management (CMYK, RGB, Spot, gradients)
- Image placement and relinking
- Master spread management
- Data merge
- MCP resources (auto-discovery)
- 10 AI skills for OpenCode

### v1.1.0 — Text Intelligence (July 2026)

The hardest feature: **reading text formatting back from InDesign**.

ExtendScript's DOM doesn't expose text formatting as a flat structure.
You have to walk `paragraphs`, then `characters`, then `appliedFont`,
`pointSize`, `fontStyle` — for every text range. A single paragraph with
3 style changes requires 12+ DOM calls.

The solution: `text_getFormatting` returns all formatting ranges in one
call, using paragraph-relative indices. This alone required 4 iterations
to get right — the ExtendScript object model is inconsistent about whether
`paragraphs[0].characters[0]` gives you the same object as
`stories[0].paragraphs[0].characters[0]`.

### v1.2.0 — Current

183 tools, 31 handlers. See README.

## The Hardest Bugs

### 1. The BOM Ghost

InDesign prepends `\ufeff` (BOM) to every text frame's content.
`text_getContent` would return `"\ufeffHello"` and agents would trip on it.
Fix: filter BOM + `\u0004` (InDesign internal control char) by default.

### 2. The Indices Lie

InDesign's `characters` collection is 0-indexed in some contexts and
1-indexed in others. `paragraphs[0].characters[0]` is the first character
of the first paragraph. But `textFrames[0].parentStory.characters[0]` is
the first character of the **entire story**, which might span 20 frames.

The solution: always work with paragraph-relative indices internally,
convert to story-absolute only at the ExtendScript boundary.

### 3. Undo Without Transactions

ExtendScript has no "begin undo group" API. The `undo_beginGroup` tool
works by wrapping operations in a custom transaction buffer — not trivial
when each tool call is a separate ExtendScript execution.

## What's Next

- **Windows support** via CEP bridge (ExtendScript Toolkit)
- **Asset management** — integrate with Adobe Fonts, Stock, Lightroom
- **Batch processing** — run operations across multiple documents
- **Template engine** — document generation from JSON/YAML specs
- **More handlers** — XML, hyperlinks, cross-references, indexes
