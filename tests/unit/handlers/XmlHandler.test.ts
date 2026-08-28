import { describe, it, expect, vi } from 'vitest';
import { XmlHandler } from '../../../src/handlers/XmlHandler.js';

describe('XmlHandler', () => {
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
    it('should have name "xml"', () => {
      const handler = new XmlHandler(createMockExecutor() as any);
      expect(handler.name).toBe('xml');
    });

    it('should expose 6 tools', () => {
      const handler = new XmlHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(6);
    });

    it('should export all expected tools', () => {
      const handler = new XmlHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('xml_listTags');
      expect(names).toContain('xml_addTag');
      expect(names).toContain('xml_deleteTag');
      expect(names).toContain('xml_tagPageItem');
      expect(names).toContain('xml_export');
      expect(names).toContain('xml_import');
    });

    it('should have every tool with name, description, inputSchema, and handler', () => {
      const handler = new XmlHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  describe('xml_listTags', () => {
    it('should return list of XML tags', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { name: 'root', label: 'Root', tagColor: 'Blue' },
          { name: 'paragraph', label: '', tagColor: 'Red' },
        ],
      });
      const handler = new XmlHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'xml_listTags')!;
      const result = await tool.handler({}, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('xmlTags');
      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('root');
    });
  });

  describe('xml_addTag', () => {
    it('should call executor with xmlTags.add', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { name: 'newTag' },
      });
      const handler = new XmlHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'xml_addTag')!;
      const result = await tool.handler({ name: 'newTag' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('xmlTags.add');
      expect(code).toContain('newTag');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('xml_deleteTag', () => {
    it('should call executor with remove() on XML tag', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'deleted' });
      const handler = new XmlHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'xml_deleteTag')!;
      const result = await tool.handler({ name: 'oldTag' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('remove()');
      expect(code).toContain('oldTag');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should handle tag not found via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error("XML tag 'missing' not found"));
      const handler = new XmlHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'xml_deleteTag')!;
      const result = await tool.handler({ name: 'missing' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('xml_tagPageItem', () => {
    it('should call executor with markup() on page item', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { tagged: true, tag: 'myTag' },
      });
      const handler = new XmlHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'xml_tagPageItem')!;
      const result = await tool.handler({ tagName: 'myTag', pageIndex: 0, itemIndex: 1 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('markup(tag)');
      expect(code).toContain('pages[0]');
      expect(code).toContain('pageItems[1]');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('xml_export', () => {
    it('should call executor with exportFile XML', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'exported' });
      const handler = new XmlHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'xml_export')!;
      const result = await tool.handler({ filePath: '/tmp/output.xml' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('exportFile');
      expect(code).toContain('xmlType');
      expect(code).toContain('output.xml');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('xml_import', () => {
    it('should call executor with importXML', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'imported' });
      const handler = new XmlHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'xml_import')!;
      const result = await tool.handler({ filePath: '/tmp/input.xml' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('importXML');
      expect(code).toContain('input.xml');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });


describe('path hardening', () => {
  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new XmlHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'xml_export')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.png']) {
      const res = await tool.handler({ filePath: bad, ...{} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });

  it('xml_importXml rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new XmlHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'xml_import')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.xml']) {
      const res = await tool.handler({ filePath: bad, ...{} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });
});
});