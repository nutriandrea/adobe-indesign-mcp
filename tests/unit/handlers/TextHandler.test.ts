import { describe, it, expect, vi } from 'vitest';
import { TextHandler } from '../../../src/handlers/TextHandler.js';

describe('TextHandler', () => {
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
    it('should have name "text"', () => {
      const handler = new TextHandler(createMockExecutor() as any);
      expect(handler.name).toBe('text');
    });

    it('should expose 7 tools', () => {
      const handler = new TextHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(7);
    });
  

    it('should export all expected tools', () => {
      const handler = new TextHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('text_addFrame');
      expect(names).toContain('text_setContent');
      expect(names).toContain('text_getContent');
      expect(names).toContain('text_getStories');
      expect(names).toContain('text_applyParagraphStyle');
      expect(names).toContain('text_findReplace');
      expect(names).toContain('text_getTextFrames');
    });

    it('should have inputSchema as a plain object', () => {
      const handler = new TextHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('text_addFrame', () => {
    it('should call executor with code adding a text frame', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, bounds: [10, 20, 100, 200] } });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_addFrame')!;
      const result = await tool.handler({
        pageIndex: 0,
        bounds: { top: 10, left: 20, bottom: 100, right: 200 },
        content: 'Hello World',
      }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('textFrames.add()');
      expect(code).toContain('geometricBounds');
      expect(code).toContain('10, 20, 100, 200');
      expect(code).toContain('Hello World');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should escape special characters in content', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, bounds: [0, 0, 50, 100] } });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_addFrame')!;
      await tool.handler({
        pageIndex: 0,
        bounds: { top: 0, left: 0, bottom: 50, right: 100 },
        content: 'Line1\nLine2 with "quotes" and \\backslash',
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      // newlines are normalized to the ExtendScript paragraph break before escaping
      expect(code).toContain('\\' + 'r');
      expect(code).not.toContain('\\' + 'n');
      expect(code).toContain('\\"');
      expect(code).toContain('\\\\');
    });

    it('should default content to empty string', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 0, bounds: [0, 0, 50, 100] } });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_addFrame')!;
      await tool.handler({
        pageIndex: 0,
        bounds: { top: 0, left: 0, bottom: 50, right: 100 },
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('""');
    });

    it('should return frame info from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { index: 2, bounds: [10, 10, 200, 300] } });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_addFrame')!;
      const result = await tool.handler({
        pageIndex: 1,
        bounds: { top: 10, left: 10, bottom: 200, right: 300 },
        content: 'Test',
      }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.index).toBe(2);
    });
  });

  describe('text_setContent', () => {
    it('should call executor with content assignment code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'set' });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_setContent')!;
      const result = await tool.handler({ pageIndex: 0, frameIndex: 1, content: 'New Content' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0].textFrames[1].contents');
      expect(code).toContain('New Content');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should escape content string', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'set' });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_setContent')!;
      await tool.handler({ pageIndex: 0, frameIndex: 0, content: 'He said "hello"\nNew line' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('\\"');
      // newline in content is normalized to the ExtendScript paragraph break 
      expect(code).toContain('\\' + 'r');
      expect(code).not.toContain('\\' + 'n');
    });
  });

  describe('text_getContent', () => {
    it('should call executor with textFrames contents accessor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'Sample text content' });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_getContent')!;
      const result = await tool.handler({ pageIndex: 0, frameIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0].textFrames[0].contents');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return content from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'Hello from InDesign' });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_getContent')!;
      const result = await tool.handler({ pageIndex: 1, frameIndex: 2 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toBe('Hello from InDesign');
    });
  });

  describe('text_getStories', () => {
    it('should call executor with code iterating stories', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { index: 0, length: 500, textFrames: 2, contents: 'Once upon a time...' },
        ],
      });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_getStories')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('app.activeDocument.stories');
      expect(code).toContain('stories[i].contents.replace(/[\\ufeff\\u0004]/g, \'\').substring(0, 200)');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return stories list from executor', async () => {
      const mock = createMockExecutor();
      const stories = [
        { index: 0, length: 1000, textFrames: 1, contents: 'Story 1 content...' },
        { index: 1, length: 2000, textFrames: 3, contents: 'Story 2 content...' },
      ];
      mock.execute.mockResolvedValue({ result: stories });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_getStories')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].length).toBe(1000);
      expect(parsed[1].textFrames).toBe(3);
    });
  });

  describe('text_applyParagraphStyle', () => {
    it('should apply paragraph style by name', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'applied' });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_applyParagraphStyle')!;
      const result = await tool.handler({ pageIndex: 0, frameIndex: 0, styleName: 'Heading 1' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('paragraphStyles.item("Heading 1")');
      expect(code).toContain('paragraphs.everyItem()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should apply to specific paragraph when paragraphIndex provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'applied' });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_applyParagraphStyle')!;
      await tool.handler({ pageIndex: 0, frameIndex: 0, styleName: 'Body', paragraphIndex: 2 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('paragraphs[2].appliedParagraphStyle');
      expect(code).not.toContain('everyItem()');
    });

    it('should escape style name with special characters', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'applied' });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_applyParagraphStyle')!;
      await tool.handler({ pageIndex: 0, frameIndex: 0, styleName: 'Body Text [Basic]' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('"Body Text [Basic]"');
    });
  });

  describe('text_findReplace', () => {
    it('should call executor with find/replace code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { occurrencesChanged: 3 } });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_findReplace')!;
      const result = await tool.handler({ findWhat: 'foo', replaceWith: 'bar', scope: 'document' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('findTextPreferences.findWhat = "foo"');
      expect(code).toContain('changeTextPreferences.changeTo = "bar"');
      expect(code).toContain('changeText()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should reset find/change preferences after replacement', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { occurrencesChanged: 0 } });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_findReplace')!;
      await tool.handler({ findWhat: 'test', replaceWith: 'done', scope: 'document' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      // Should reset to NothingEnum.nothing after
      const nothingCount = (code.match(/NothingEnum\.nothing/g) || []).length;
      expect(nothingCount).toBe(4); // 2 before + 2 after
    });

    it('should return occurrence count from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { occurrencesChanged: 5 } });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_findReplace')!;
      const result = await tool.handler({ findWhat: 'old', replaceWith: 'new', scope: 'document' }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed.occurrencesChanged).toBe(5);
    });
  });

  describe('text_getTextFrames', () => {
    it('should call executor with code iterating text frames on page', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { index: 0, bounds: [10, 10, 50, 100], contentType: 'TextType', overflows: false, contentPreview: 'Hello...' },
        ],
      });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_getTextFrames')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('textFrames');
      expect(code).toContain('geometricBounds');
      expect(code).toContain('contentType');
      expect(code).toContain('overflows');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return text frames list from executor', async () => {
      const mock = createMockExecutor();
      const frames = [
        { index: 0, bounds: [0, 0, 100, 200], contentType: 'TextType', overflows: false, contentPreview: 'Frame 1...' },
        { index: 1, bounds: [0, 210, 100, 400], contentType: 'TextType', overflows: true, contentPreview: 'Frame 2...' },
      ];
      mock.execute.mockResolvedValue({ result: frames });
      const handler = new TextHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'text_getTextFrames')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].overflows).toBe(false);
      expect(parsed[1].overflows).toBe(true);
    });
  });
});
