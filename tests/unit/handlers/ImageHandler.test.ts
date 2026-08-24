import { describe, it, expect, vi } from 'vitest';
import { ImageHandler } from '../../../src/handlers/ImageHandler.js';

describe('ImageHandler', () => {
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
    it('should have name "image"', () => {
      const handler = new ImageHandler(createMockExecutor() as any);
      expect(handler.name).toBe('image');
    });

    it('should expose 5 tools', () => {
      const handler = new ImageHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(5);
    });

    it('should export all expected tools', () => {
      const handler = new ImageHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('image_place');
      expect(names).toContain('image_adjust');
      expect(names).toContain('image_fit');
      expect(names).toContain('image_relink');
      expect(names).toContain('image_info');
    });

    it('should have inputSchema as a plain object', () => {
      const handler = new ImageHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('image_place', () => {
    it('should call executor with place() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, bounds: [10, 20, 60, 120], linkStatus: 'normal' } });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_place')!;
      const result = await tool.handler({ pageIndex: 0, filePath: '/path/to/image.jpg', x: 20, y: 10 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('page.place(File(');
      expect(code).toContain('image.jpg');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should include scale code when width and height provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, bounds: [10, 20, 110, 120], linkStatus: 'normal' } });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_place')!;
      await tool.handler({ pageIndex: 0, filePath: '/img.jpg', x: 20, y: 10, width: 100, height: 100 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('geometricBounds');
      expect(code).toContain('[10, 20, 110, 120]');
    });

    it('should return placed image info from executor', async () => {
      const mock = createMockExecutor();
      const info = { index: 3, bounds: [0, 0, 200, 300], linkStatus: 'normal' };
      mock.execute.mockResolvedValue({ result: info });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_place')!;
      const result = await tool.handler({ pageIndex: 0, filePath: '/img.jpg', x: 0, y: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.index).toBe(3);
      expect(parsed.linkStatus).toBe('normal');
    });
  });

  describe('image_adjust', () => {
    it('should call executor with brightness and contrast', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'adjusted' });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_adjust')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 0, brightness: 20, contrast: -10 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('brightness = 20');
      expect(code).toContain('contrast = -10');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should only include provided properties', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'adjusted' });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_adjust')!;
      await tool.handler({ pageIndex: 0, itemIndex: 0, brightness: 50 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('brightness = 50');
      expect(code).not.toContain('contrast');
    });

    it('should handle image not found via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Image not found'));
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_adjust')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 99, brightness: 10 }, {});

      expect(result.isError).toBe(true);
    });
  });

  describe('image_fit', () => {
    it('should call executor with appropriate FitOptions', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { fitting: 'fill', bounds: [0, 0, 100, 100] } });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_fit')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 0, fitting: 'fill' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('FitOptions.FillProportionally');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should map all fitting types correctly', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { fitting: 'center', bounds: [0, 0, 100, 100] } });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_fit')!;
      await tool.handler({ pageIndex: 0, itemIndex: 0, fitting: 'center' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('FitOptions.CenterContent');
    });
  });

  describe('image_relink', () => {
    it('should call executor with relink() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'relinked' });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_relink')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 0, filePath: '/new/path.jpg' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('imageLink.relink');
      expect(code).toContain('new/path.jpg');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle image or link not found via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Image or link not found'));
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_relink')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 99, filePath: '/img.jpg' }, {});

      expect(result.isError).toBe(true);
    });
  });

  describe('image_info', () => {
    it('should call executor with code reading image metadata', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { index: 0, filePath: '/path/img.jpg', linkStatus: 'normal', bounds: [0, 0, 100, 100], effectivePpi: 72, actualPpi: 300 },
      });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_info')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('imageLink');
      expect(code).toContain('geometricBounds');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return image info from executor', async () => {
      const mock = createMockExecutor();
      const info = { index: 1, filePath: '/img.png', linkStatus: 'normal', bounds: [0, 0, 200, 200], effectivePpi: 150, actualPpi: 300 };
      mock.execute.mockResolvedValue({ result: info });
      const handler = new ImageHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'image_info')!;
      const result = await tool.handler({ pageIndex: 0, itemIndex: 1 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.filePath).toBe('/img.png');
      expect(parsed.linkStatus).toBe('normal');
    });
  });


describe('path hardening', () => {
  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new ImageHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'image_place')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.png']) {
      const res = await tool.handler({ filePath: bad, ...{"pageIndex": 0} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });
});
});