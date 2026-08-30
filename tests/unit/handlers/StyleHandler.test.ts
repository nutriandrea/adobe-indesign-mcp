import { describe, it, expect, vi } from 'vitest';
import { StyleHandler } from '../../../src/handlers/StyleHandler.js';

describe('StyleHandler', () => {
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
    it('should have name "style"', () => {
      const handler = new StyleHandler(createMockExecutor() as any);
      expect(handler.name).toBe('style');
    });

    it('should expose 7 tools', () => {
      const handler = new StyleHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(7);
    });

    it('should export all expected tools', () => {
      const handler = new StyleHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('style_listParagraph');
      expect(names).toContain('style_listCharacter');
      expect(names).toContain('style_listObject');
      expect(names).toContain('style_createParagraph');
      expect(names).toContain('style_createCharacter');
      expect(names).toContain('style_duplicate');
      expect(names).toContain('style_delete');
    });

    it('should have inputSchema as a plain object', () => {
      const handler = new StyleHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      }
    });
  });

  describe('style_listParagraph', () => {
    it('should call executor with code iterating paragraphStyles', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ name: '[Basic Paragraph]', basedOn: null, pointSize: 12, properties: {} }],
      });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_listParagraph')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('paragraphStyles');
      expect(code).toContain('JSON.stringify');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should guard basedOn/pointSize reads that throw on the root style', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'ok' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_listParagraph')!;
      await tool.handler({}, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('try { bo = styles[i].basedOn ? styles[i].basedOn.name : null; } catch (e)');
      expect(code).toContain('pointSize');
    });
  });

  describe('style_listCharacter', () => {
    it('should call executor with code iterating characterStyles', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ name: '[None]', basedOn: null, properties: {} }],
      });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_listCharacter')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('characterStyles');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('style_listObject', () => {
    it('should call executor with code iterating objectStyles', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ name: '[None]', basedOn: null, properties: {} }],
      });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_listObject')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('objectStyles');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return style list from executor', async () => {
      const mock = createMockExecutor();
      const styles = [{ name: '[None]', basedOn: null, properties: {} }, { name: 'My Object Style', basedOn: '[None]', properties: {} }];
      mock.execute.mockResolvedValue({ result: styles });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_listObject')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[1].name).toBe('My Object Style');
    });
  });

  describe('style_createParagraph', () => {
    it('should call executor with paragraphStyles.add()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'created' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_createParagraph')!;
      const result = await tool.handler({ name: 'My Style' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('paragraphStyles.add');
      expect(code).toContain('My Style');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should include basedOn when provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'created' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_createParagraph')!;
      await tool.handler({ name: 'Sub Style', basedOn: 'Base Style' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('basedOn');
      expect(code).toContain('Base Style');
    });

    it('should map rich formatting params onto the style', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'created' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_createParagraph')!;
      await tool.handler({
        name: 'Body Text',
        pointSize: 12,
        fontFamily: 'Fraunces',
        fontStyle: 'Medium',
        leading: 14.5,
        spaceAfter: 6,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pointSize: 12');
      expect(code).toContain('appliedFont: "Fraunces"');
      expect(code).toContain('fontStyle: "Medium"');
      expect(code).toContain('leading: 14.5');
      expect(code).toContain('spaceAfter: 6');
    });

    it('should pass through free-form properties', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'created' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_createParagraph')!;
      await tool.handler({ name: 'Wide', properties: { keepWithNext: true } }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('keepWithNext: true');
    });
  });

  describe('style_createCharacter', () => {
    it('should call executor with characterStyles.add()', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'created' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_createCharacter')!;
      const result = await tool.handler({ name: 'Char Style' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('characterStyles.add');
      expect(code).toContain('Char Style');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('style_duplicate', () => {
    it('should duplicate a paragraph style', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'Copy of Style' } });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_duplicate')!;
      const result = await tool.handler({ type: 'paragraph', name: 'Original', newName: 'Copy' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('paragraphStyles');
      expect(code).toContain('duplicate()');
      expect(code).toContain('"Copy"');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should duplicate a character style', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { name: 'New Char Style' } });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_duplicate')!;
      await tool.handler({ type: 'character', name: 'Orig', newName: 'New Char Style' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('characterStyles');
    });
  });

  describe('style_delete', () => {
    it('should remove a paragraph style', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'deleted' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_delete')!;
      const result = await tool.handler({ type: 'paragraph', name: 'Old Style' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('paragraphStyles');
      expect(code).toContain('remove()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should remove an object style', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'deleted' });
      const handler = new StyleHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'style_delete')!;
      await tool.handler({ type: 'object', name: 'Bad Style' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('objectStyles');
    });
  });
});
