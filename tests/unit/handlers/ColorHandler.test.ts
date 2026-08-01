import { describe, it, expect, vi } from 'vitest';
import { ColorHandler } from '../../../src/handlers/ColorHandler.js';

describe('ColorHandler', () => {
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
    it('should have name "color"', () => {
      const handler = new ColorHandler(createMockExecutor() as any);
      expect(handler.name).toBe('color');
    });

    it('should expose 6 tools', () => {
      const handler = new ColorHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(6);
    });

    it('should export all expected tools', () => {
      const handler = new ColorHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('color_swatch_create');
      expect(names).toContain('color_swatch_list');
      expect(names).toContain('color_swatch_delete');
      expect(names).toContain('color_gradient_create');
      expect(names).toContain('color_apply');
      expect(names).toContain('color_ink_list');
    });

    it('should have inputSchema as a plain object (not a ZodSchema)', () => {
      const handler = new ColorHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('color_swatch_create', () => {
    it('should call executor.execute with code to create a CMYK swatch', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify({ name: 'MyRed', model: 'cmyk', colorType: 'process' }) });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_create')!;
      const result = await tool.handler({
        name: 'MyRed',
        model: 'cmyk',
        cyan: 0,
        magenta: 100,
        yellow: 100,
        black: 0,
        colorType: 'process',
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('colors.add');
      expect(code).toContain('MyRed');
      expect(code).toContain('__PROCESS_COLOR_MODEL');
      expect(code).toContain('0, 100, 100, 0');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should call executor.execute with code to create an RGB swatch', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify({ name: 'MyBlue', model: 'rgb', colorType: 'process' }) });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_create')!;
      await tool.handler({
        name: 'MyBlue',
        model: 'rgb',
        red: 0,
        green: 0,
        blue: 255,
        colorType: 'process',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('__PROCESS_COLOR_MODEL');
      expect(code).toContain('0, 0, 255');
    });

    it('should call executor.execute for spot color', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify({ name: 'SpotPink', model: 'cmyk', colorType: 'spot' }) });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_create')!;
      await tool.handler({
        name: 'SpotPink',
        model: 'cmyk',
        cyan: 0,
        magenta: 80,
        yellow: 20,
        black: 0,
        colorType: 'spot',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('SpotColor');
    });

    it('should reject invalid CMYK values', async () => {
      const mock = createMockExecutor();
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_create')!;
      const result = await tool.handler({ name: 'Bad', model: 'cmyk', cyan: 999 }, {});

      expect(result.isError).toBe(true);
    });
  });

  describe('color_swatch_list', () => {
    it('should call executor.execute with code to list swatches and gradients', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify([
        { name: 'Black', model: 1232365164, space: 1232365164, colorValue: [0, 0, 0, 100], spot: false },
      ]) });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_list')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('doc.colors');
      expect(code).toContain('doc.gradients');
      expect(code).toContain('colorValue');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return swatch list from executor', async () => {
      const mock = createMockExecutor();
      const swatches = [
        { name: 'Black', model: 1232365164, space: 1232365164, colorValue: [0, 0, 0, 100], spot: false },
        { name: 'Red', model: 1232365164, space: 1232365164, colorValue: [0, 100, 100, 0], spot: false },
      ];
      mock.execute.mockResolvedValue({ result: swatches });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_list')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Black');
      expect(parsed[1].spot).toBe(false);
    });
  });

  describe('color_swatch_delete', () => {
    it('should call executor.execute with code to remove a swatch', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'deleted' });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_delete')!;
      const result = await tool.handler({ name: 'MyRed' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('colors.item("MyRed")');
      expect(code).toContain('remove()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle swatch not found via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Swatch not found'));
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_swatch_delete')!;
      const result = await tool.handler({ name: 'NonExistent' }, {});

      expect(result.isError).toBe(true);
    });
  });

  describe('color_gradient_create', () => {
    it('should call executor.execute with code to create a gradient', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify({ name: 'MyGrad', type: 'linear', stops: 2 }) });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_gradient_create')!;
      const result = await tool.handler({
        name: 'MyGrad',
        type: 'linear',
        stops: [
          { color: 'Black', position: 0 },
          { color: 'White', position: 100 },
        ],
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('gradients.add');
      expect(code).toContain('LINEAR');
      expect(code).toContain('MyGrad');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should create radial gradient', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify({ name: 'RadGrad', type: 'radial', stops: 3 }) });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_gradient_create')!;
      await tool.handler({
        name: 'RadGrad',
        type: 'radial',
        stops: [
          { color: 'Red', position: 0 },
          { color: 'Blue', position: 50 },
          { color: 'Green', position: 100 },
        ],
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('RADIAL');
    });

    it('should reject gradient with only 1 stop', async () => {
      const mock = createMockExecutor();
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_gradient_create')!;
      const result = await tool.handler({
        name: 'BadGrad',
        type: 'linear',
        stops: [{ color: 'Black', position: 0 }],
      }, {});

      expect(result.isError).toBe(true);
    });
  });

  describe('color_apply', () => {
    it('should call executor.execute with code to apply fill color', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'applied' });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_apply')!;
      const result = await tool.handler({ swatchName: 'MyRed', target: 'fill' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('fillColor');
      expect(code).not.toContain('strokeColor');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should apply stroke color when target=stroke', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'applied' });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_apply')!;
      await tool.handler({ swatchName: 'MyRed', target: 'stroke' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('strokeColor');
      expect(code).not.toContain('fillColor');
    });

    it('should apply both fill and stroke when target=both', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'applied' });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_apply')!;
      await tool.handler({ swatchName: 'MyRed', target: 'both' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('fillColor');
      expect(code).toContain('strokeColor');
    });

    it('should handle no selection via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('No selection'));
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_apply')!;
      const result = await tool.handler({ swatchName: 'Red' }, {});

      expect(result.isError).toBe(true);
    });
  });

  describe('color_ink_list', () => {
    it('should call executor.execute with code to list inks', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify([
        { name: 'Process Cyan', index: 0, inkType: 'process' },
      ]) });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_ink_list')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.activeDocument.inks');
      expect(code).toContain('inkType');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return ink list from executor', async () => {
      const mock = createMockExecutor();
      const inks = [
        { name: 'Process Cyan', index: 0, inkType: 'process' },
        { name: 'Process Magenta', index: 1, inkType: 'process' },
      ];
      mock.execute.mockResolvedValue({ result: inks });
      const handler = new ColorHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'color_ink_list')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Process Cyan');
      expect(parsed[1].inkType).toBe('process');
    });
  });
});
