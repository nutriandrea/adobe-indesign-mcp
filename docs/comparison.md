# InDesign Automation: MCP vs Traditional Methods

## Comparison

| | **InDesign MCP** | ExtendScript | CEP Panel | Manual |
|---|------------|-------------|-----------|--------|
| **Language** | Natural language (via AI) | ECMAScript 3 (1999) | HTML + JS + Node | Mouse + keyboard |
| **Setup** | 5 min (npm install) | Immediate (`.jsx` file) | Days (SDK + manifest) | Instant |
| **Tool count** | 183+ | Unlimited (you write them) | Unlimited (you build them) | — |
| **Debugging** | Structured JSON errors | `$.writeln()` to ESTK console | Chrome DevTools | None |
| **Modern JS** | TypeScript | ES3 (no `let`, `Promise`, `async`) | Yes | N/A |
| **AI-ready** | Yes (MCP protocol) | No | No | No |
| **Reusability** | Save prompts | Save `.jsx` files | Save panel | Muscle memory |
| **Learning curve** | Low | High (ES3 + InDesign DOM) | Very high (SDK + manifest + DOM) | None |
| **Cross-platform** | macOS (Windows planned) | Yes (ESTK) | Yes | Yes |

## When to Use What

| If you want to... | Use... |
|-------------------|--------|
| Describe in English what you want | **InDesign MCP** |
| Write a reusable script for an exact task | ExtendScript |
| Build a custom UI panel for designers | CEP |
| Do it once, quickly | Manual |

## The InDesign DOM Problem

Every approach (except manual) hits the same wall: the InDesign DOM.

InDesign's object model was designed for UI automation, not scripting.
Key pain points:

- **Collections are 0-indexed but inconsistent** — `paragraphs[0]` works,
  but `textFrames[0].parentStory.characters[0]` might crash depending on
  the context
- **Properties are nested deeply** — Getting a character's font requires
  `paragraphs[i].characters[j].appliedFont.name`
- **No bulk operations** — Changing 100 text frames requires 100 separate
  calls, each one a round-trip through ExtendScript
- **Memory leaks** — Long-running scripts accumulate references and crash
  InDesign after ~500 operations

The MCP server handles all of this internally. The agent just calls
`text_applyFont(storyIndex, paragraphIndex, startChar, endChar, ...)`.
