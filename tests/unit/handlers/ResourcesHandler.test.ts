import { describe, it, expect, vi } from 'vitest';
import { ResourcesHandler } from '../../../src/handlers/ResourcesHandler.js';

describe('ResourcesHandler', () => {
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
    it('should have name "resources"', () => {
      const handler = new ResourcesHandler(createMockExecutor() as any);
      expect(handler.name).toBe('resources');
    });

    it('should expose 6 tools', () => {
      const handler = new ResourcesHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(6);
    });

    it('should export all expected tools', () => {
      const handler = new ResourcesHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('resources_listLinks');
      expect(names).toContain('resources_updateLink');
      expect(names).toContain('resources_updateAllLinks');
      expect(names).toContain('resources_embedLink');
      expect(names).toContain('resources_unembedLink');
      expect(names).toContain('resources_getLinkInfo');
    });

    it('should have every tool with name, description, inputSchema, and handler', () => {
      const handler = new ResourcesHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  describe('resources_listLinks', () => {
    it('should call executor with code iterating document links', async () => {
      const mock = createMockExecutor();
      const links = [
        { index: 0, name: 'img1.jpg', filePath: '/path/img1.jpg', status: 'normal', embedded: false },
        { index: 1, name: 'img2.jpg', filePath: '/path/img2.jpg', status: 'modified', embedded: false },
      ];
      mock.execute.mockResolvedValue({ result: links });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_listLinks')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.activeDocument.links');
      expect(code).toContain('l.name');
      expect(code).toContain('l.filePath');
      expect(code).toContain('l.status');
      expect(code).toContain('l.embedded');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return list of links from executor', async () => {
      const mock = createMockExecutor();
      const links = [
        { index: 0, name: 'img1.jpg', filePath: '/path/img1.jpg', status: 'normal', embedded: false },
        { index: 1, name: 'img2.jpg', filePath: '/path/img2.jpg', status: 'modified', embedded: true },
      ];
      mock.execute.mockResolvedValue({ result: links });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_listLinks')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('img1.jpg');
      expect(parsed[0].status).toBe('normal');
      expect(parsed[1].name).toBe('img2.jpg');
      expect(parsed[1].embedded).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('resources_updateLink', () => {
    it('should call executor with relink code for the given link index', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'img1.jpg', status: 'normal', filePath: '/path/to/image.jpg' } });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_updateLink')!;
      const result = await tool.handler({ linkIndex: 0, newFilePath: '/path/to/image.jpg' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('links[0]');
      expect(code).toContain('relink(File("/path/to/image.jpg"))');
      expect(code).toContain('link.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle invalid link via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Link not found'));
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_updateLink')!;
      const result = await tool.handler({ linkIndex: 99, newFilePath: '/path/to/missing.jpg' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('resources_updateAllLinks', () => {
    it('should call executor with everyItem().relink() code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'all links updated' });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_updateAllLinks')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('everyItem().relink()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('resources_embedLink', () => {
    it('should call executor with embed() code for the given link index', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'img1.jpg', embedded: true } });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_embedLink')!;
      const result = await tool.handler({ linkIndex: 2 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('links[2]');
      expect(code).toContain('embed()');
      expect(code).toContain('link.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return embedded true in response', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'img.jpg', embedded: true } });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_embedLink')!;
      const result = await tool.handler({ linkIndex: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.name).toBe('img.jpg');
      expect(parsed.embedded).toBe(true);
    });
  });

  describe('resources_unembedLink', () => {
    it('should call executor with unembed() code for the given link index', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'img1.jpg', filePath: '/path/to/output.pdf', embedded: false } });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_unembedLink')!;
      const result = await tool.handler({ linkIndex: 1, filePath: '/path/to/output.pdf' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('links[1]');
      expect(code).toContain('unembed(File("/path/to/output.pdf"))');
      expect(code).toContain('link.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return embedded false in response', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'img.jpg', filePath: '/path/to/output.pdf', embedded: false } });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_unembedLink')!;
      const result = await tool.handler({ linkIndex: 1, filePath: '/path/to/output.pdf' }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.name).toBe('img.jpg');
      expect(parsed.filePath).toBe('/path/to/output.pdf');
      expect(parsed.embedded).toBe(false);
    });
  });

  describe('resources_getLinkInfo', () => {
    it('should call executor with code accessing link properties', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { name: 'img.jpg', filePath: '/path/img.jpg', status: 'normal', embedded: false, size: 12345 },
      });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_getLinkInfo')!;
      const result = await tool.handler({ linkIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('links[0]');
      expect(code).toContain('link.isValid');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return full link info from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { name: 'img.jpg', filePath: '/path/img.jpg', status: 'normal', embedded: false, size: 12345 },
      });
      const handler = new ResourcesHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'resources_getLinkInfo')!;
      const result = await tool.handler({ linkIndex: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.name).toBe('img.jpg');
      expect(parsed.filePath).toBe('/path/img.jpg');
      expect(parsed.status).toBe('normal');
      expect(parsed.embedded).toBe(false);
      expect(parsed.size).toBe(12345);
    });
  });


describe('path hardening', () => {
  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new ResourcesHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'resources_unembedLink')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.png']) {
      const res = await tool.handler({ filePath: bad, linkIndex: 0, ...{} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });
});
});