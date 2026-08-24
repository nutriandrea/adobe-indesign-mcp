import { describe, it, expect, vi } from 'vitest';
import { ShapeHandler } from '../../../src/handlers/ShapeHandler.js';

describe('ShapeHandler', () => {
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
    it('should have name "shape"', () => {
      const handler = new ShapeHandler(createMockExecutor() as any);
      expect(handler.name).toBe('shape');
    });

    it('should expose 6 tools', () => {
      const handler = new ShapeHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(6);
    });

    it('should export all expected tools', () => {
      const handler = new ShapeHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('shape_rectangle_create');
      expect(names).toContain('shape_ellipse_create');
      expect(names).toContain('shape_polygon_create');
      expect(names).toContain('shape_line_create');
      expect(names).toContain('shape_modify');
      expect(names).toContain('shape_delete');
    });

    it('should have inputSchema as a plain object', () => {
      const handler = new ShapeHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('shape_rectangle_create', () => {
    it('should call executor with rectangles.add() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'rectangle', bounds: [10, 20, 60, 120] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_rectangle_create')!;
      const result = await tool.handler({ pageIndex: 0, x: 20, y: 10, width: 100, height: 50 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('rectangles.add()');
      expect(code).toContain('geometricBounds = [10, 20, 60, 120]');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should include optional fillColor and cornerRadius when provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'rectangle', bounds: [0, 0, 50, 100] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_rectangle_create')!;
      await tool.handler({ pageIndex: 0, x: 0, y: 0, width: 100, height: 50, fillColor: 'Red', cornerRadius: 5, strokeWeight: 2 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('fillColor');
      expect(code).toContain('cornerRadius = 5');
      expect(code).toContain('strokeWeight = 2');
    });

    it('should return created shape info from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 2, type: 'rectangle', bounds: [0, 0, 200, 100] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_rectangle_create')!;
      const result = await tool.handler({ pageIndex: 1, x: 0, y: 0, width: 100, height: 200 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.index).toBe(2);
      expect(parsed.type).toBe('rectangle');
    });
  });

  describe('shape_ellipse_create', () => {
    it('should call executor with ovals.add() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'ellipse', bounds: [10, 20, 60, 120] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_ellipse_create')!;
      const result = await tool.handler({ pageIndex: 0, x: 20, y: 10, width: 100, height: 50 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('ovals.add()');
      expect(code).toContain('geometricBounds = [10, 20, 60, 120]');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should include optional strokeColor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 1, type: 'ellipse', bounds: [0, 0, 50, 50] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_ellipse_create')!;
      await tool.handler({ pageIndex: 0, x: 0, y: 0, width: 50, height: 50, strokeColor: 'Black', strokeWeight: 1 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('strokeColor');
      expect(code).toContain('strokeWeight = 1');
    });
  });

  describe('shape_polygon_create', () => {
    it('should set app.polygonPreferences BEFORE polygons.add() (2026 DOM: instances have no numberOfSides)', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'polygon', sides: 8, bounds: [0, 0, 50, 50] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_polygon_create')!;
      const result = await tool.handler({ pageIndex: 0, x: 0, y: 0, width: 50, height: 50, numberOfSides: 8 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      // InDesign 2026 moved side count to application-level preferences;
      // setting it on the polygon instance throws "not a function"
      expect(code).toContain('app.polygonPreferences.numberOfSides = 8;');
      expect(code).toContain('polygons.add()');
      expect(code.indexOf('app.polygonPreferences.numberOfSides')).toBeLessThan(code.indexOf('polygons.add()'));
      expect(code).not.toContain('shape.numberOfSides');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should default to 6 sides', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'polygon', sides: 6, bounds: [0, 0, 50, 50] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_polygon_create')!;
      await tool.handler({ pageIndex: 0, x: 0, y: 0, width: 50, height: 50 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.polygonPreferences.numberOfSides = 6;');
    });
  });

  describe('shape_line_create', () => {
    it('should call executor with graphicLines.add()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, type: 'line', bounds: [10, 20, 100, 200] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_line_create')!;
      const result = await tool.handler({ pageIndex: 0, x1: 20, y1: 10, x2: 200, y2: 100, strokeWeight: 2 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('graphicLines.add()');
      expect(code).toContain('[10, 20, 100, 200]');
      expect(code).toContain('strokeWeight = 2');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('shape_modify', () => {
    it('should call executor with code to modify shape properties', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, bounds: [5, 5, 25, 55] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_modify')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 0, x: 5, y: 5, width: 20, height: 20, fillColor: 'Blue' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('allPageItems');
      expect(code).toContain('geometricBounds = [5, 5, 25, 25]');
      expect(code).toContain('fillColor');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should only set bounds when all of x,y,width,height provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, bounds: [0, 0, 100, 100] } });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_modify')!;
      await tool.handler({ pageIndex: 0, itemIndex: 0, strokeWeight: 3 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).not.toContain('geometricBounds = [');
      expect(code).toContain('strokeWeight = 3');
    });
  });

  describe('shape_delete', () => {
    it('should call executor with remove() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'deleted' });
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_delete')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 1 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('allPageItems');
      expect(code).toContain('remove()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle shape not found via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Shape not found'));
      const handler = new ShapeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'shape_delete')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 99 }, {});

      expect(result.isError).toBe(true);
    });
  });
});
