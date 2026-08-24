import { describe, it, expect, vi } from 'vitest';
import { DocumentHandler } from '../../../src/handlers/DocumentHandler.js';

describe('DocumentHandler', () => {
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
    it('should have name "document"', () => {
      const handler = new DocumentHandler(createMockExecutor() as any);
      expect(handler.name).toBe('document');
    });

    it('should expose 8 tools', () => {
      const handler = new DocumentHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(8);
    });

    it('should export all expected tools', () => {
      const handler = new DocumentHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('document_create');
      expect(names).toContain('document_open');
      expect(names).toContain('document_save');
      expect(names).toContain('document_close');
      expect(names).toContain('document_getInfo');
      expect(names).toContain('document_listOpen');
    });

    it('should have inputSchema as a plain object (not a ZodSchema)', () => {
      const handler = new DocumentHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('document_create', () => {
    it('should call executor.execute with ExtendScript code containing app.documents.add', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'Untitled-1', pages: 1, pageWidth: 210, pageHeight: 297, orientation: 'portrait' } });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_create')!;
      const result = await tool.handler({ width: 210, height: 297, pages: 1, facingPages: false, orientation: 'portrait', margins: { top: 12, bottom: 12, left: 12, right: 12 } }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.documents.add');
      expect(code).toContain('pageWidth: "210"');
      expect(code).toContain('pageHeight: "297"');
      expect(code).toContain('pagesPerDocument: 1');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should include bleed values when provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'Untitled-1', pages: 1, pageWidth: 210, pageHeight: 297, orientation: 'portrait' } });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_create')!;
      await tool.handler({
        width: 210, height: 297, pages: 1,
        margins: { top: 12, bottom: 12, left: 12, right: 12 },
        bleed: { top: 3, bottom: 3, left: 3, right: 3 },
        facingPages: false, orientation: 'portrait',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('documentBleedTopOffset');
      expect(code).toContain('documentBleedBottomOffset');
      expect(code).toContain('documentBleedInsideOrLeftOffset');
      expect(code).toContain('documentBleedOutsideOrRightOffset');
    });

    it('should set landscape orientation correctly', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'Untitled-1', pages: 1, pageWidth: 297, pageHeight: 210, orientation: 'landscape' } });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_create')!;
      await tool.handler({
        width: 297, height: 210, pages: 1,
        margins: { top: 12, bottom: 12, left: 12, right: 12 },
        facingPages: false, orientation: 'landscape',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('PageOrientation.landscape');
      expect(code).not.toContain('PageOrientation.portrait');
    });

    it('should return document info from executor result', async () => {
      const mock = createMockExecutor();
      const docInfo = { name: 'MyDoc.indd', pages: 5, pageWidth: 210, pageHeight: 297, orientation: 'portrait' };
      mock.execute.mockResolvedValue({ result: docInfo });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_create')!;
      const result = await tool.handler({ width: 210, height: 297, pages: 5, margins: { top: 12, bottom: 12, left: 12, right: 12 }, facingPages: true, orientation: 'portrait' }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.name).toBe('MyDoc.indd');
      expect(parsed.pages).toBe(5);
    });
  });

  describe('document_open', () => {
    it('should call executor with filePath and showWindow', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'doc.indd', pages: 3, pageWidth: 210, pageHeight: 297 } });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_open')!;
      const result = await tool.handler({ filePath: '/path/to/doc.indd', showWindow: true }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.open');
      expect(code).toContain('doc.indd');
      expect(code).toContain('true');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle showWindow=false', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'doc.indd', pages: 3, pageWidth: 210, pageHeight: 297 } });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_open')!;
      await tool.handler({ filePath: '/path/to/doc.indd', showWindow: false }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('false');
    });

    it('should return document info from open result', async () => {
      const mock = createMockExecutor();
      const docInfo = { name: 'opened.indd', pages: 10, pageWidth: 100, pageHeight: 200 };
      mock.execute.mockResolvedValue({ result: docInfo });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_open')!;
      const result = await tool.handler({ filePath: '/path/to/opened.indd', showWindow: true }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.name).toBe('opened.indd');
      expect(parsed.pages).toBe(10);
    });
  });

  describe('document_save', () => {
    it('should call executor with save() when saveOptions=yes and no filePath', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'saved' });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_save')!;
      const result = await tool.handler({ saveOptions: 'yes' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('save()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should call executor with save(filePath) when filePath provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'saved' });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_save')!;
      await tool.handler({ filePath: '/path/to/save.indd', saveOptions: 'yes' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('save(File(');
      expect(code).toContain('save.indd');
    });

    it('should handle saveOptions=no by using close(SaveOptions.no)', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'saved' });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_save')!;
      await tool.handler({ saveOptions: 'no' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('SaveOptions.no');
    });
  });

  describe('document_close', () => {
    it('should call executor with app.activeDocument.close()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'closed' });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_close')!;
      const result = await tool.handler({ saveOptions: 'yes' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('activeDocument.close(SaveOptions.yes)');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle saveOptions=ask', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'closed' });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_close')!;
      await tool.handler({ saveOptions: 'ask' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('SaveOptions.ask');
    });
  });

  describe('document_getInfo', () => {
    it('should call executor with code containing activeDocument properties', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { name: 'doc.indd', pages: 5, pageWidth: 210, pageHeight: 297, margins: { top: 12, bottom: 12, left: 12, right: 12 }, orientation: 'portrait', units: 'millimeters', facingPages: false, filePath: '' },
      });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_getInfo')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.activeDocument');
      expect(code).toContain('pageWidth');
      expect(code).toContain('margins');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return full document info from executor', async () => {
      const mock = createMockExecutor();
      const info = {
        name: 'MyDoc.indd', filePath: '/path/to/doc.indd', pages: 10,
        pageWidth: 210, pageHeight: 297,
        margins: { top: 20, bottom: 20, left: 15, right: 15 },
        orientation: 'portrait', units: 'millimeters', facingPages: true,
      };
      mock.execute.mockResolvedValue({ result: info });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_getInfo')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.name).toBe('MyDoc.indd');
      expect(parsed.pages).toBe(10);
      expect(parsed.margins.top).toBe(20);
      expect(parsed.facingPages).toBe(true);
    });
  });

  describe('document_listOpen', () => {
    it('should call executor with code iterating app.documents', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: [{ name: 'Doc1.indd', pages: 3, filePath: '' }] });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_listOpen')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.documents');
      expect(code).toContain('JSON.stringify');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return list of open documents from executor', async () => {
      const mock = createMockExecutor();
      const docs = [
        { name: 'Doc1.indd', pages: 3, filePath: '/path/1.indd' },
        { name: 'Doc2.indd', pages: 5, filePath: '/path/2.indd' },
      ];
      mock.execute.mockResolvedValue({ result: docs });
      const handler = new DocumentHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'document_listOpen')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Doc1.indd');
      expect(parsed[1].pages).toBe(5);
    });
  });


describe('path hardening', () => {
  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new DocumentHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'document_open')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.png']) {
      const res = await tool.handler({ filePath: bad, ...{} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });
});
});