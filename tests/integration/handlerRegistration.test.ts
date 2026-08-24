import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ScriptExecutor } from '../../src/bridge/ScriptExecutor.js';

// Import all handlers
import { DocumentHandler } from '../../src/handlers/DocumentHandler.js';
import { PageHandler } from '../../src/handlers/PageHandler.js';
import { TextHandler } from '../../src/handlers/TextHandler.js';
import { StyleHandler } from '../../src/handlers/StyleHandler.js';
import { ObjectHandler } from '../../src/handlers/ObjectHandler.js';
import { ExportHandler } from '../../src/handlers/ExportHandler.js';
import { MasterHandler } from '../../src/handlers/MasterHandler.js';
import { TableHandler } from '../../src/handlers/TableHandler.js';
import { ResourcesHandler } from '../../src/handlers/ResourcesHandler.js';
import { BookHandler } from '../../src/handlers/BookHandler.js';
import { InteractiveHandler } from '../../src/handlers/InteractiveHandler.js';
import { XmlHandler } from '../../src/handlers/XmlHandler.js';
import { AnchoredObjectHandler } from '../../src/handlers/AnchoredObjectHandler.js';
import { ListHandler } from '../../src/handlers/ListHandler.js';
import { DataMergeHandler } from '../../src/handlers/DataMergeHandler.js';
import { TextAdvancedHandler } from '../../src/handlers/TextAdvancedHandler.js';
import { ColorHandler } from '../../src/handlers/ColorHandler.js';
import { EffectHandler } from '../../src/handlers/EffectHandler.js';
import { FontHandler } from '../../src/handlers/FontHandler.js';
import { GrepHandler } from '../../src/handlers/GrepHandler.js';
import { ImageHandler } from '../../src/handlers/ImageHandler.js';
import { IndexHandler } from '../../src/handlers/IndexHandler.js';
import { LayerHandler } from '../../src/handlers/LayerHandler.js';
import { NoteHandler } from '../../src/handlers/NoteHandler.js';
import { SectionHandler } from '../../src/handlers/SectionHandler.js';
import { ShapeHandler } from '../../src/handlers/ShapeHandler.js';
import { TableStyleHandler } from '../../src/handlers/TableStyleHandler.js';
import { TocHandler } from '../../src/handlers/TocHandler.js';
import { TransformHandler } from '../../src/handlers/TransformHandler.js';
import { UndoHandler } from '../../src/handlers/UndoHandler.js';
import { XrefHandler } from '../../src/handlers/XrefHandler.js';
import { PreviewHandler } from '../../src/handlers/PreviewHandler.js';

interface HandlerPair {
  name: string;
  instance: { name: string; tools: { name: string; description: string; inputSchema: Record<string, unknown>; handler: Function }[]; register: (server: McpServer) => void };
}

describe('Handler Registration', () => {
  const handlerPairs: HandlerPair[] = [
    { name: 'DocumentHandler', instance: new DocumentHandler(new ScriptExecutor(5000)) },
    { name: 'PageHandler', instance: new PageHandler(new ScriptExecutor(5000)) },
    { name: 'TextHandler', instance: new TextHandler(new ScriptExecutor(5000)) },
    { name: 'StyleHandler', instance: new StyleHandler(new ScriptExecutor(5000)) },
    { name: 'ObjectHandler', instance: new ObjectHandler(new ScriptExecutor(5000)) },
    { name: 'ExportHandler', instance: new ExportHandler(new ScriptExecutor(5000)) },
    { name: 'MasterHandler', instance: new MasterHandler(new ScriptExecutor(5000)) },
    { name: 'TableHandler', instance: new TableHandler(new ScriptExecutor(5000)) },
    { name: 'ResourcesHandler', instance: new ResourcesHandler(new ScriptExecutor(5000)) },
    { name: 'BookHandler', instance: new BookHandler(new ScriptExecutor(5000)) },
    { name: 'InteractiveHandler', instance: new InteractiveHandler(new ScriptExecutor(5000)) },
    { name: 'XmlHandler', instance: new XmlHandler(new ScriptExecutor(5000)) },
    { name: 'AnchoredObjectHandler', instance: new AnchoredObjectHandler(new ScriptExecutor(5000)) },
    { name: 'ListHandler', instance: new ListHandler(new ScriptExecutor(5000)) },
    { name: 'DataMergeHandler', instance: new DataMergeHandler(new ScriptExecutor(5000)) },
    { name: 'TextAdvancedHandler', instance: new TextAdvancedHandler(new ScriptExecutor(5000)) },
    { name: 'ColorHandler', instance: new ColorHandler(new ScriptExecutor(5000)) },
    { name: 'EffectHandler', instance: new EffectHandler(new ScriptExecutor(5000)) },
    { name: 'FontHandler', instance: new FontHandler(new ScriptExecutor(5000)) },
    { name: 'GrepHandler', instance: new GrepHandler(new ScriptExecutor(5000)) },
    { name: 'ImageHandler', instance: new ImageHandler(new ScriptExecutor(5000)) },
    { name: 'IndexHandler', instance: new IndexHandler(new ScriptExecutor(5000)) },
    { name: 'LayerHandler', instance: new LayerHandler(new ScriptExecutor(5000)) },
    { name: 'NoteHandler', instance: new NoteHandler(new ScriptExecutor(5000)) },
    { name: 'SectionHandler', instance: new SectionHandler(new ScriptExecutor(5000)) },
    { name: 'ShapeHandler', instance: new ShapeHandler(new ScriptExecutor(5000)) },
    { name: 'TableStyleHandler', instance: new TableStyleHandler(new ScriptExecutor(5000)) },
    { name: 'TocHandler', instance: new TocHandler(new ScriptExecutor(5000)) },
    { name: 'TransformHandler', instance: new TransformHandler(new ScriptExecutor(5000)) },
    { name: 'UndoHandler', instance: new UndoHandler(new ScriptExecutor(5000)) },
    { name: 'XrefHandler', instance: new XrefHandler(new ScriptExecutor(5000)) },
    { name: 'PreviewHandler', instance: new PreviewHandler(new ScriptExecutor(5000)) },
  ];

  for (const { name, instance } of handlerPairs) {
    describe(name, () => {
      it('should have a non-empty name', () => {
        expect(instance.name).toBeDefined();
        expect(typeof instance.name).toBe('string');
        expect(instance.name.length).toBeGreaterThan(0);
      });

      it('should expose tools array', () => {
        const tools = instance.tools;
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
      });

      it('should have valid tool definitions', () => {
        const tools = instance.tools;
        for (const tool of tools) {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(tool).toHaveProperty('inputSchema');
          expect(tool).toHaveProperty('handler');
          expect(typeof tool.name).toBe('string');
          expect(tool.name.length).toBeGreaterThan(0);
          expect(typeof tool.description).toBe('string');
          expect(tool.description.length).toBeGreaterThan(0);
          expect(typeof tool.handler).toBe('function');
          expect(tool.inputSchema).toBeDefined();
          expect(typeof tool.inputSchema).toBe('object');
        }
      });

      it('should register all tools on an McpServer without error', () => {
        const server = new McpServer({ name: 'test', version: '1.0.0' });
        expect(() => instance.register(server)).not.toThrow();
      });
    });
  }

  it('should have unique tool names across all handlers', () => {
    const allNames: string[] = [];
    for (const { instance } of handlerPairs) {
      for (const tool of instance.tools) {
        allNames.push(tool.name);
      }
    }
    const duplicates = allNames.filter((name, i) => allNames.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });

  it('should produce exactly 192 tools across all 32 handlers', () => {
    let total = 0;
    for (const { instance } of handlerPairs) {
      total += instance.tools.length;
    }
    expect(total).toBe(192);
  });

  it('should have tool names prefixed with handler category', () => {
    for (const { name, instance } of handlerPairs) {
      const category = instance.name;
      for (const tool of instance.tools) {
        // ObjectHandler uses sub-category prefixes (image_, shape_, group_)
        if (name === 'ObjectHandler') {
          const validPrefixes = ['image_', 'shape_', 'group_'];
          expect(validPrefixes.some(p => tool.name.startsWith(p))).toBe(true);
        } else if (name === 'TextAdvancedHandler') {
          // TextAdvancedHandler uses text_ prefix (extends TextHandler namespace)
          expect(tool.name.startsWith('text_')).toBe(true);
        } else if (name === 'ExportHandler' && tool.name === 'script_run') {
          // script_run is a general-purpose debug tool, not scoped to export_
          expect(tool.name).toBe('script_run');
        } else if (name === 'TableStyleHandler') {
          // Table/cell styles share one handler with two namespaces
          const validPrefixes = ['tableStyle_', 'cellStyle_'];
          expect(validPrefixes.some(p => tool.name.startsWith(p))).toBe(true);
        } else if (name === 'UndoHandler') {
          // Bare undo/redo commands plus namespaced group/history tools
          const bareNames = ['undo', 'redo'];
          expect(bareNames.includes(tool.name) || tool.name.startsWith('undo_')).toBe(true);
        } else {
          expect(tool.name.startsWith(category + '_')).toBe(true);
        }
      }
    }
  });
});
