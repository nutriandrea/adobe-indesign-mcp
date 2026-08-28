import { describe, it, expect, vi } from 'vitest';
import { BookHandler } from '../../../src/handlers/BookHandler.js';

describe('BookHandler', () => {
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
    it('should have name "book"', () => {
      const handler = new BookHandler(createMockExecutor() as any);
      expect(handler.name).toBe('book');
    });

    it('should expose 4 tools', () => {
      const handler = new BookHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(4);
    });

    it('should export all expected tools', () => {
      const handler = new BookHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('book_list');
      expect(names).toContain('book_open');
      expect(names).toContain('book_getDocuments');
      expect(names).toContain('book_synchronize');
    });

    it('should have every tool with name, description, inputSchema, and handler', () => {
      const handler = new BookHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  describe('book_list', () => {
    it('should return list of open books', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { index: 0, name: 'MyBook.indb', fullName: '/path/to/MyBook.indb', documentCount: 3 },
        ],
      });
      const handler = new BookHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'book_list')!;
      const result = await tool.handler({}, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.books');
      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('MyBook.indb');
    });
  });

  describe('book_open', () => {
    it('should call executor with app.open(File(...))', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: { name: 'MyBook.indb', documentCount: 5 },
      });
      const handler = new BookHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'book_open')!;
      const result = await tool.handler({ filePath: '/path/to/book.indb' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.open');
      expect(code).toContain('File(');
      expect(code).toContain('book.indb');
      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.name).toBe('MyBook.indb');
      expect(parsed.documentCount).toBe(5);
    });
  });

  describe('book_getDocuments', () => {
    it('should return documents in a book', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { index: 0, name: 'Chapter1.indd', fullName: '/path/Chapter1.indd', styleSource: true },
          { index: 1, name: 'Chapter2.indd', fullName: '/path/Chapter2.indd', styleSource: false },
        ],
      });
      const handler = new BookHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'book_getDocuments')!;
      const result = await tool.handler({ bookIndex: 0 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('bookContents');
      expect(code).toContain('books[0]');
      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].styleSource).toBe(true);
    });

    it('should handle book not found via error middleware', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Book not found'));
      const handler = new BookHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'book_getDocuments')!;
      const result = await tool.handler({ bookIndex: 99 }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('book_synchronize', () => {
    it('should call executor with book.synchronize()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'synchronized' });
      const handler = new BookHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'book_synchronize')!;
      const result = await tool.handler({ bookIndex: 0 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('synchronize()');
      expect(code).toContain('books[0]');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });


describe('path hardening', () => {
  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new BookHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'book_open')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.png']) {
      const res = await tool.handler({ filePath: bad, ...{} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });
});
});