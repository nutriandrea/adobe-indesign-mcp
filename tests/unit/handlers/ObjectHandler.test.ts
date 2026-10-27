import { describe, it, expect, vi } from 'vitest';
import { ObjectHandler } from '../../../src/handlers/ObjectHandler.js';

describe('ObjectHandler', () => {
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
    it('should have name "object"', () => {
      const handler = new ObjectHandler(createMockExecutor() as any);
      expect(handler.name).toBe('object');
    });

    it('should expose 6 tools', () => {
      const handler = new ObjectHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(6);
    });

    it('should export all expected tools', () => {
      const handler = new ObjectHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('image_list');
      expect(names).toContain('image_getLinks');
      expect(names).toContain('shape_create');
      expect(names).toContain('shape_list');
      expect(names).toContain('group_list');
      expect(names).toContain('group_ungroup');
    });

    it('should have inputSchema as a plain object', () => {
      const handler = new ObjectHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('image_list', () => {
    it('should call executor with code listing allGraphics on page', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { index: 0, filePath: '/img.jpg', linkStatus: 'normal', bounds: [0, 0, 100, 100] },
        ],
      });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_list')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('allGraphics');
      expect(code).toContain('img.itemLink');
      expect(code).not.toContain('imageLink');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return image list from executor', async () => {
      const mock = createMockExecutor();
      const images = [
        { index: 0, filePath: '/a.jpg', linkStatus: 'normal', bounds: [0, 0, 100, 100] },
        { index: 1, filePath: 'embedded', linkStatus: 'embedded', bounds: [0, 0, 50, 50] },
      ];
      mock.execute.mockResolvedValue({ result: images });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_list')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].filePath).toBe('/a.jpg');
      expect(parsed[1].linkStatus).toBe('embedded');
    });
  });

  describe('image_getLinks', () => {
    it('should call executor with code reading document links', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ filePath: '/img.jpg', status: 'normal', embedded: false }],
      });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_getLinks')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('__resolveDocument().links');
      expect(code).toContain('filePath');
      expect(code).toContain('status');
      expect(code).toContain('embedded');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('shape_create', () => {
    it('should call executor with correct shape type', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'rectangle', bounds: [10, 20, 60, 120] } });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_create')!;
      const result = await tool.handler({
        pageIndex: 0,
        type: 'rectangle',
        bounds: { top: 10, left: 20, bottom: 60, right: 120 },
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rectangles.add()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should create ellipse type', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'ellipse', bounds: [0, 0, 50, 100] } });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_create')!;
      await tool.handler({
        pageIndex: 0, type: 'ellipse',
        bounds: { top: 0, left: 0, bottom: 50, right: 100 },
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('ovals.add()');
    });

    it('should include optional fillColor and strokeColor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'rectangle', bounds: [0, 0, 50, 100] } });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_create')!;
      await tool.handler({
        pageIndex: 0, type: 'rectangle',
        bounds: { top: 0, left: 0, bottom: 50, right: 100 },
        fillColor: 'Red', strokeColor: 'Black', strokeWeight: 2,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('fillColor');
      expect(code).toContain('strokeColor');
      expect(code).toContain('strokeWeight = 2');
    });
  });

  describe('shape_list', () => {
    it('should call executor with code filtering page items', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ index: 0, type: 'rectangle', bounds: [0, 0, 100, 100], strokeWeight: 0 }],
      });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_list')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('allPageItems');
      expect(code).toContain('constructor.name');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return shape list from executor', async () => {
      const mock = createMockExecutor();
      const shapes = [{ index: 0, type: 'rectangle', bounds: [0, 0, 100, 100], strokeWeight: 1 }];
      mock.execute.mockResolvedValue({ result: shapes });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_list')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('rectangle');
    });
  });

  describe('group_list', () => {
    it('should call executor with code listing groups on page', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ index: 0, name: 'Group1', bounds: [0, 0, 200, 200] }],
      });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'group_list')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('groups.length');
      expect(code).toContain('geometricBounds');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('group_ungroup', () => {
    it('should call executor with ungroup() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'ungrouped' });
      const handler = new ObjectHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'group_ungroup')!;
      const result = await tool.handler({ pageIndex: 0, groupIndex: 1 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('groups[1].ungroup()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });
});
