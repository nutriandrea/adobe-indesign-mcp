/**
 * Tool inventory guard.
 *
 * The project has advertised three different tool counts at once (183 in the
 * repo description, 191 in package.json, 194 in the README). This test pins
 * the real number — measured by instantiating every handler exactly the way
 * IndesignMcpServer does — so the counts can never silently drift again.
 *
 * When you add or remove a tool, update EXPECTED_TOOL_COUNT and every place
 * the README/package.json/repo description mention the count.
 */
import { describe, it, expect } from 'vitest';
import type { ToolDefinition } from '../../src/types/index.js';

const EXPECTED_TOOL_COUNT = 194;

function buildExecutorStub() {
  return {
    on: () => {},
    execute: async () => ({ id: 'x', type: 'result' as const, result: '' }),
  };
}

async function loadHandlers(): Promise<{ name: string; tools: ToolDefinition[] }[]> {
  const { DocumentHandler } = await import('../../src/handlers/DocumentHandler.js');
  const { PageHandler } = await import('../../src/handlers/PageHandler.js');
  const { TextHandler } = await import('../../src/handlers/TextHandler.js');
  const { StyleHandler } = await import('../../src/handlers/StyleHandler.js');
  const { ObjectHandler } = await import('../../src/handlers/ObjectHandler.js');
  const { ExportHandler } = await import('../../src/handlers/ExportHandler.js');
  const { MasterHandler } = await import('../../src/handlers/MasterHandler.js');
  const { TableHandler } = await import('../../src/handlers/TableHandler.js');
  const { ResourcesHandler } = await import('../../src/handlers/ResourcesHandler.js');
  const { BookHandler } = await import('../../src/handlers/BookHandler.js');
  const { InteractiveHandler } = await import('../../src/handlers/InteractiveHandler.js');
  const { XmlHandler } = await import('../../src/handlers/XmlHandler.js');
  const { TocHandler } = await import('../../src/handlers/TocHandler.js');
  const { NoteHandler } = await import('../../src/handlers/NoteHandler.js');
  const { IndexHandler } = await import('../../src/handlers/IndexHandler.js');
  const { GrepHandler } = await import('../../src/handlers/GrepHandler.js');
  const { TextAdvancedHandler } = await import('../../src/handlers/TextAdvancedHandler.js');
  const { XrefHandler } = await import('../../src/handlers/XrefHandler.js');
  const { EffectHandler } = await import('../../src/handlers/EffectHandler.js');
  const { TransformHandler } = await import('../../src/handlers/TransformHandler.js');
  const { TableStyleHandler } = await import('../../src/handlers/TableStyleHandler.js');
  const { SectionHandler } = await import('../../src/handlers/SectionHandler.js');
  const { ColorHandler } = await import('../../src/handlers/ColorHandler.js');
  const { FontHandler } = await import('../../src/handlers/FontHandler.js');
  const { ImageHandler } = await import('../../src/handlers/ImageHandler.js');
  const { LayerHandler } = await import('../../src/handlers/LayerHandler.js');
  const { ShapeHandler } = await import('../../src/handlers/ShapeHandler.js');
  const { UndoHandler } = await import('../../src/handlers/UndoHandler.js');
  const { AnchoredObjectHandler } = await import('../../src/handlers/AnchoredObjectHandler.js');
  const { ListHandler } = await import('../../src/handlers/ListHandler.js');
  const { DataMergeHandler } = await import('../../src/handlers/DataMergeHandler.js');
  const { PreviewHandler } = await import('../../src/handlers/PreviewHandler.js');
  const { ChangesHandler } = await import('../../src/handlers/ChangesHandler.js');

  const executor = buildExecutorStub() as never;
  const changeTracker = { on: () => {} } as never;

  const HandlerCtors: [string, new (...args: never[]) => { tools: ToolDefinition[] }][] = [
    ['DocumentHandler', DocumentHandler as never],
    ['PageHandler', PageHandler as never],
    ['TextHandler', TextHandler as never],
    ['StyleHandler', StyleHandler as never],
    ['ObjectHandler', ObjectHandler as never],
    ['ExportHandler', ExportHandler as never],
    ['MasterHandler', MasterHandler as never],
    ['TableHandler', TableHandler as never],
    ['ResourcesHandler', ResourcesHandler as never],
    ['BookHandler', BookHandler as never],
    ['InteractiveHandler', InteractiveHandler as never],
    ['XmlHandler', XmlHandler as never],
    ['TocHandler', TocHandler as never],
    ['NoteHandler', NoteHandler as never],
    ['IndexHandler', IndexHandler as never],
    ['GrepHandler', GrepHandler as never],
    ['TextAdvancedHandler', TextAdvancedHandler as never],
    ['XrefHandler', XrefHandler as never],
    ['EffectHandler', EffectHandler as never],
    ['TransformHandler', TransformHandler as never],
    ['TableStyleHandler', TableStyleHandler as never],
    ['SectionHandler', SectionHandler as never],
    ['ColorHandler', ColorHandler as never],
    ['FontHandler', FontHandler as never],
    ['ImageHandler', ImageHandler as never],
    ['LayerHandler', LayerHandler as never],
    ['ShapeHandler', ShapeHandler as never],
    ['UndoHandler', UndoHandler as never],
    ['AnchoredObjectHandler', AnchoredObjectHandler as never],
    ['ListHandler', ListHandler as never],
    ['DataMergeHandler', DataMergeHandler as never],
    ['PreviewHandler', PreviewHandler as never],
  ];

  const results: { name: string; tools: ToolDefinition[] }[] = HandlerCtors.map(
    ([name, Ctor]) => {
      if (name === 'DocumentHandler') {
        const h = new (Ctor as never)(executor, {}) as { tools: ToolDefinition[] };
        return { name, tools: h.tools };
      }
      const h = new Ctor(executor);
      return { name, tools: h.tools };
    },
  );
  // ChangesHandler is constructed with the ChangeTracker, not the executor.
  const changes = new (ChangesHandler as never)(changeTracker) as { tools: ToolDefinition[] };
  results.push({ name: 'ChangesHandler', tools: changes.tools });
  return results;
}

describe('tool inventory guard', () => {
  it('exposes exactly the advertised number of tools', async () => {
    const handlers = await loadHandlers();
    const total = handlers.reduce((sum, h) => sum + h.tools.length, 0);
    expect(
      total,
      `Tool count changed: ${total} != ${EXPECTED_TOOL_COUNT}. ` +
        'Update EXPECTED_TOOL_COUNT and every doc that mentions the count ' +
        '(README, package.json description, repo description).',
    ).toBe(EXPECTED_TOOL_COUNT);
  });

  it('has no duplicate tool names across handlers', async () => {
    const handlers = await loadHandlers();
    const names = handlers.flatMap((h) => h.tools.map((t) => t.name));
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates, `Duplicate tool names: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('gives every tool a non-empty name and description', async () => {
    const handlers = await loadHandlers();
    const offenders: string[] = [];
    for (const { name: handlerName, tools } of handlers) {
      for (const tool of tools) {
        if (!tool.name || tool.name.length === 0) offenders.push(`${handlerName}: missing name`);
        if (!tool.description || tool.description.length === 0) {
          offenders.push(`${handlerName}: tool '${tool.name}' missing description`);
        }
      }
    }
    expect(offenders, `Malformed tool metadata:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * The README handler table is a hand-maintained mirror of the registry, and
   * it drifted for three releases: it listed 31 handlers instead of 33, under-
   * counted Export, and omitted Changes and Preview entirely. Parse the table
   * and compare it to the real registry so that cannot happen again.
   */
  describe('README handler table', () => {
    async function readmeTable(): Promise<Map<string, number>> {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const readme = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../README.md'),
        'utf-8',
      );
      // Scope to the catalog section — the rest of the README has other tables
      // whose first cell is bold too.
      const section = readme.split('### Full Handler Catalog')[1]?.split('\n## ')[0] ?? '';
      const rows = section.split('\n').filter((line) => /^\|\s*\*\*[A-Za-z]+\*\*\s*\|/.test(line));
      const counts = new Map<string, number>();
      for (const row of rows) {
        const [, handler, tools] = row.split('|');
        counts.set(handler.replace(/\*/g, '').trim(), Number(tools.replace(/\*/g, '').trim()));
      }
      return counts;
    }

    it('lists the same handlers as the registry, with the same counts', async () => {
      const [table, handlers] = await Promise.all([readmeTable(), loadHandlers()]);

      const real = new Map(handlers.map((h) => [h.name.replace('Handler', ''), h.tools.length]));

      expect(
        [...real.keys()].filter((name) => !table.has(name)),
        'Handlers missing from the README table',
      ).toEqual([]);

      const mismatched = [...real.entries()].filter(([name, count]) => table.get(name) !== count);
      expect(
        mismatched.map(([name, count]) => `${name}: README says ${table.get(name)}, real is ${count}`),
        'README handler table has stale tool counts',
      ).toEqual([]);
    });

    it('sums to the advertised tool count', async () => {
      const table = await readmeTable();
      const total = [...table.values()].reduce((sum, count) => sum + count, 0);
      expect(
        total,
        `README table sums to ${total}, not ${EXPECTED_TOOL_COUNT}`,
      ).toBe(EXPECTED_TOOL_COUNT);
    });
  });
});
