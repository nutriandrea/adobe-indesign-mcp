/**
 * Instantiates every handler the way IndesignMcpServer does and returns their
 * tool definitions.
 *
 * Shared by the tool-inventory guard and the error-recovery contract test —
 * both need the real registry rather than a hand-maintained copy of it, and
 * the project has already been bitten once by a hand-maintained mirror of the
 * tool list drifting out of date.
 */
import type { ToolDefinition } from '../../src/types/index.js';

function buildExecutorStub() {
  return {
    on: () => {},
    execute: async () => ({ id: 'x', type: 'result' as const, result: '' }),
  };
}

export interface HandlerTools {
  name: string;
  tools: ToolDefinition[];
}

export async function loadHandlers(): Promise<HandlerTools[]> {
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
  const { TypographyHandler } = await import('../../src/handlers/TypographyHandler.js');
  const { ImageHandler } = await import('../../src/handlers/ImageHandler.js');
  const { LayerHandler } = await import('../../src/handlers/LayerHandler.js');
  const { ShapeHandler } = await import('../../src/handlers/ShapeHandler.js');
  const { UndoHandler } = await import('../../src/handlers/UndoHandler.js');
  const { AnchoredObjectHandler } = await import('../../src/handlers/AnchoredObjectHandler.js');
  const { ListHandler } = await import('../../src/handlers/ListHandler.js');
  const { DataMergeHandler } = await import('../../src/handlers/DataMergeHandler.js');
  const { PreviewHandler } = await import('../../src/handlers/PreviewHandler.js');
  const { ChangesHandler } = await import('../../src/handlers/ChangesHandler.js');
  const { RecipeHandler } = await import('../../src/handlers/RecipeHandler.js');

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
    ['TypographyHandler', TypographyHandler as never],
    ['ImageHandler', ImageHandler as never],
    ['LayerHandler', LayerHandler as never],
    ['ShapeHandler', ShapeHandler as never],
    ['UndoHandler', UndoHandler as never],
    ['AnchoredObjectHandler', AnchoredObjectHandler as never],
    ['ListHandler', ListHandler as never],
    ['DataMergeHandler', DataMergeHandler as never],
    ['PreviewHandler', PreviewHandler as never],
    ['RecipeHandler', RecipeHandler as never],
  ];

  const results: HandlerTools[] = HandlerCtors.map(([name, Ctor]) => {
    if (name === 'DocumentHandler') {
      const h = new (Ctor as never)(executor, {}) as { tools: ToolDefinition[] };
      return { name, tools: h.tools };
    }
    const h = new Ctor(executor);
    return { name, tools: h.tools };
  });
  // ChangesHandler is constructed with the ChangeTracker, not the executor.
  const changes = new (ChangesHandler as never)(changeTracker) as { tools: ToolDefinition[] };
  results.push({ name: 'ChangesHandler', tools: changes.tools });
  return results;
}

/** Every registered tool name, across all handlers. */
export async function loadToolNames(): Promise<string[]> {
  const handlers = await loadHandlers();
  return handlers.flatMap((h) => h.tools.map((t) => t.name));
}
