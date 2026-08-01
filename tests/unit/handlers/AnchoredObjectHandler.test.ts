import { describe, it, expect, vi } from 'vitest';
import { AnchoredObjectHandler } from '../../../src/handlers/AnchoredObjectHandler.js';

describe('AnchoredObjectHandler', () => {
  function createMockExecutor() {
    return {
      execute: vi.fn().mockResolvedValue({ result: 'ok' }),
      on: vi.fn(),
      handleResponse: vi.fn(),
      cancelAll: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ connected: true, queueDepth: 0 }),
    };
  }

  describe('handler structure', () => {
    it('should have name "anchoredObject"', () => {
      const handler = new AnchoredObjectHandler(createMockExecutor() as any);
      expect(handler.name).toBe('anchoredObject');
    });

    it('should expose 5 tools', () => {
      const handler = new AnchoredObjectHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(5);
    });

    it('should export all expected tools', () => {
      const handler = new AnchoredObjectHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('anchoredObject_create');
      expect(names).toContain('anchoredObject_setPosition');
      expect(names).toContain('anchoredObject_release');
      expect(names).toContain('anchoredObject_getSettings');
      expect(names).toContain('anchoredObject_setProperties');
    });

    it('should have every tool with name, description, inputSchema, and handler', () => {
      const handler = new AnchoredObjectHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  describe('anchoredObject_create', () => {
    it('should call executor with create anchored object ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: {
          anchoredObject: 'created',
          contentType: 'rectangle',
          storyIndex: 0,
          insertionIndex: 1,
          anchoredPosition: 'custom',
          anchorPoint: 'topLeft',
        },
      });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_create')!;
      const result = await tool.handler({
        storyIndex: 0,
        insertionIndex: 1,
        contentType: 'rectangle',
        width: 40,
        height: 20,
        anchoredPosition: 'custom',
        anchorPoint: 'topLeft',
        xOffset: 5,
        yOffset: 10,
        spaceAbove: 3,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('stories[0].insertionPoints[1]');
      expect(code).toContain('ip.rectangles.add');
      expect(code).toContain('geometricBounds: [0, 0, 20, 40]');
      // InDesign 2026: move(InsertionPoint) is no longer supported — the item
      // is added to the insertion point's own collection instead.
      expect(code).not.toContain('move(ip)');
      expect(code).toContain('anchoredObjectSettings');
      expect(code).toContain('AnchorPosition.ANCHORED');
      expect(code).toContain("__ANCHOR_POINT('TOP_LEFT')");
      expect(code).toContain('anchorXoffset = 5');
      expect(code).toContain('anchorYoffset = 10');
      expect(code).toContain('anchorSpaceAbove = 3');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should create text frame anchored object', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: {
          anchoredObject: 'created',
          contentType: 'textFrame',
          storyIndex: 0,
          insertionIndex: 0,
        },
      });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_create')!;
      const result = await tool.handler({
        storyIndex: 0,
        insertionIndex: 0,
        contentType: 'textFrame',
        width: 50,
        height: 30,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('textFrames.add');
      expect(code).toContain('geometricBounds: [0, 0, 30, 50]');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should create oval anchored object', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: {
          anchoredObject: 'created',
          contentType: 'oval',
          storyIndex: 0,
          insertionIndex: 0,
        },
      });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_create')!;
      const result = await tool.handler({
        storyIndex: 0,
        insertionIndex: 0,
        contentType: 'oval',
        width: 30,
        height: 30,
        anchoredPosition: 'inline',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('ovals.add');
      expect(code).toContain('AnchorPosition.INLINE_POSITION');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return create result with anchored object properties', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: {
          anchoredObject: 'created',
          contentType: 'rectangle',
          storyIndex: 0,
          insertionIndex: 1,
        },
      });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_create')!;
      const result = await tool.handler({
        storyIndex: 0,
        insertionIndex: 1,
        contentType: 'rectangle',
        width: 40,
        height: 20,
      }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ anchoredObject: 'created', contentType: 'rectangle' });
    });
  });

  describe('anchoredObject_setPosition', () => {
    it('should call executor with set position ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'positionSet', pageIndex: 0, itemIndex: 1 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_setPosition')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
        anchoredPosition: 'aboveLine',
        anchorPoint: 'bottomRight',
        xOffset: 10,
        yOffset: 20,
        spaceAbove: 5,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0].allPageItems[1]');
      expect(code).toContain('anchoredObjectSettings');
      expect(code).toContain('AnchorPosition.ABOVE_LINE');
      expect(code).toContain("__ANCHOR_POINT('BOTTOM_RIGHT')");
      expect(code).toContain('anchorXoffset = 10');
      expect(code).toContain('anchorYoffset = 20');
      expect(code).toContain('anchorSpaceAbove = 5');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle partial position updates', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'positionSet', pageIndex: 0, itemIndex: 1 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_setPosition')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
        xOffset: 15,
        yOffset: 25,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('anchorXoffset = 15');
      expect(code).toContain('anchorYoffset = 25');
      expect(code).not.toContain('AnchorPosition');
      expect(code).not.toContain('AnchorPoint');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return setPosition result', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'positionSet', pageIndex: 0, itemIndex: 1 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_setPosition')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
        anchoredPosition: 'custom',
      }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ anchoredObject: 'positionSet' });
    });
  });

  describe('anchoredObject_release', () => {
    it('should call executor with release ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'released', pageIndex: 0, itemIndex: 2 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_release')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 2,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0].allPageItems[2]');
      expect(code).toContain('anchoredObjectSettings');
      expect(code).toContain('AnchorPosition.INLINE_POSITION');
      expect(code).toContain('LocationOptions.AT_END');
      expect(code).toContain('item.move');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return release result', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'released', pageIndex: 0, itemIndex: 2 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_release')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 2,
      }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ anchoredObject: 'released' });
    });
  });

  describe('anchoredObject_getSettings', () => {
    it('should call executor with get settings ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredPosition: 'AnchorPosition.ANCHORED', anchorPoint: 'AnchorPoint.TOP_LEFT' } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_getSettings')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0].allPageItems[1]');
      expect(code).toContain('anchoredObjectSettings');
      expect(code).toContain('aos.anchoredPosition.toString()');
      expect(code).toContain('aos.anchorPoint.toString()');
      expect(code).toContain('aos.anchorXoffset');
      expect(code).toContain('aos.anchorYoffset');
      expect(code).toContain('aos.anchorSpaceAbove');
      expect(code).toContain('aos.horizontalReferencePoint');
      expect(code).toContain('aos.verticalReferencePoint');
      expect(code).toContain('aos.pinPosition');
      expect(code).toContain('aos.spineRelative');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return getSettings result', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: {
          anchoredPosition: 'AnchorPosition.ANCHORED',
          anchorPoint: 'AnchorPoint.TOP_LEFT',
          anchorXoffset: 5,
          anchorYoffset: 10,
          anchorSpaceAbove: 3,
        },
      });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_getSettings')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
      }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ anchoredPosition: 'AnchorPosition.ANCHORED' });
    });
  });

  describe('anchoredObject_setProperties', () => {
    it('should call executor with set properties ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'propertiesSet', pageIndex: 0, itemIndex: 1, propertiesUpdated: 2 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_setProperties')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
        properties: {
          anchorXoffset: 15,
          anchorYoffset: 25,
        },
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0].allPageItems[1]');
      expect(code).toContain('anchoredObjectSettings');
      expect(code).toContain('aos.anchorXoffset = 15;');
      expect(code).toContain('aos.anchorYoffset = 25;');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should escape string property values', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'propertiesSet', pageIndex: 0, itemIndex: 1, propertiesUpdated: 1 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_setProperties')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
        properties: {
          pinPosition: 'true',
        },
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('aos.pinPosition = "true";');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return setProperties result', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { anchoredObject: 'propertiesSet', pageIndex: 0, itemIndex: 1, propertiesUpdated: 1 } });
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_setProperties')!;
      const result = await tool.handler({
        pageIndex: 0,
        itemIndex: 1,
        properties: { anchorSpaceAbove: 8 },
      }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ anchoredObject: 'propertiesSet' });
    });
  });

  describe('error handling', () => {
    it('should return isError when executor rejects', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Failed to create anchored object'));
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_create')!;
      const result = await tool.handler({ storyIndex: 0, insertionIndex: 0, contentType: 'rectangle', width: 40, height: 20 }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return isError when setPosition executor rejects', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Failed to set position'));
      const handler = new AnchoredObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'anchoredObject_setPosition')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 0 }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });
});
