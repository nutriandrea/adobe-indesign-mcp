import { describe, it, expect, vi } from 'vitest';
import { TypographyHandler } from '../../../src/handlers/TypographyHandler.js';

/**
 * The audit's whole value is that it answers several typography questions in
 * one pass without inventing anything, so these tests pin the three decisions
 * that made it possible:
 *
 *   - status comes from `Font.status` compared with `FontStatus`, because that
 *     is the only member that reports a substituted or missing font;
 *   - the status is asked once per font *in use*, never by walking `app.fonts`,
 *     because enumerating that collection measured ~400 ms per font;
 *   - overrides and unstyled text are read from `styleOverridden` and from the
 *     document's own [No paragraph style] id, not from its (localised) name.
 */
describe('TypographyHandler', () => {
  function createMockExecutor() {
    return {
      execute: vi.fn().mockResolvedValue({ result: 'ok' }),
      on: vi.fn(),
      handleResponse: vi.fn(),
      cancelAll: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ connected: true, queueDepth: 0 }),
    };
  }

  function toolOf(handler: TypographyHandler) {
    const tool = handler.tools.find((t) => t.name === 'typography_audit');
    if (!tool) throw new Error('typography_audit is not registered');
    return tool;
  }

  describe('handler structure', () => {
    it('has the typography name', () => {
      expect(new TypographyHandler(createMockExecutor() as any).name).toBe('typography');
    });

    it('exposes exactly one tool', () => {
      expect(new TypographyHandler(createMockExecutor() as any).tools).toHaveLength(1);
      expect(toolOf(new TypographyHandler(createMockExecutor() as any)).name).toBe('typography_audit');
    });

    it('says in the description that it does not modify the document', () => {
      const tool = toolOf(new TypographyHandler(createMockExecutor() as any));
      expect(tool.description).toMatch(/read-only/i);
    });
  });

  describe('the script it emits', () => {
    async function emitted(args: Record<string, unknown> = {}): Promise<string> {
      const mock = createMockExecutor();
      await toolOf(new TypographyHandler(mock as any)).handler(args, {});
      return mock.execute.mock.calls[0][0] as string;
    }

    it('reads font status through the FontStatus members', async () => {
      const code = await emitted();
      expect(code).toContain('FontStatus.NOT_AVAILABLE');
      expect(code).toContain('FontStatus.FAUXED');
      expect(code).toContain('FontStatus.SUBSTITUTED');
      expect(code).toContain('FontStatus.INSTALLED');
      expect(code).toContain('appliedFont');
    });

    it('never walks the installed font collection', async () => {
      const code = await emitted();
      expect(code).not.toContain('app.fonts');
    });

    it('reads the override flag and the real style id', async () => {
      const code = await emitted();
      expect(code).toContain('styleOverridden');
      expect(code).toContain('paragraphStyles[0].id');
      expect(code).toContain('appliedParagraphStyle');
    });

    it('takes the page from the paragraph frames, guarded', async () => {
      const code = await emitted();
      expect(code).toContain('parentTextFrames');
      expect(code).toContain('parentPage.name');
    });

    it('passes the caps into the script', async () => {
      const code = await emitted({ maxParagraphs: 1234, samplesPerFinding: 7 });
      expect(code).toContain('var __max = 1234;');
      expect(code).toContain('var __samples = 7;');
    });

    it('defaults the caps rather than sending undefined', async () => {
      const code = await emitted();
      expect(code).toContain('var __max = 50000;');
      expect(code).toContain('var __samples = 3;');
      expect(code).not.toContain('undefined');
    });

    it('reports truncation instead of pretending it saw everything', async () => {
      expect(await emitted()).toContain('truncated');
    });

    it('returns the shape the description promises', async () => {
      const code = await emitted();
      for (const key of [
        'document',
        'pages',
        'stories',
        'paragraphs',
        'fonts',
        'missingFonts',
        'sizes',
        'paragraphStyles',
        'unstyled',
      ]) {
        expect(code).toContain(`${key}:`);
      }
    });
  });

  describe('the answer it passes through', () => {
    it('formats the JSON result unchanged', async () => {
      const payload = {
        document: 'prova.indd',
        pages: 2,
        stories: 1,
        paragraphs: 2,
        truncated: false,
        fonts: [{ postscriptName: 'MinionPro-Regular', paragraphs: 2 }],
        missingFonts: [],
        sizes: [{ pointSize: 12, leading: 'auto', autoLeading: 120, paragraphs: 2 }],
        paragraphStyles: [{ name: '[Nessuno stile paragrafo]', paragraphs: 2, overridden: 0 }],
        unstyled: { paragraphs: 2, samples: [] },
      };
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: JSON.stringify(payload) });
      const result = await toolOf(new TypographyHandler(mock as any)).handler({}, {});
      expect(JSON.parse(result.content[0].text as string)).toEqual(payload);
    });

    it('surfaces an ExtendScript failure rather than an empty report', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: JSON.stringify({
          __extendscript_error: true,
          message: 'Nessun documento aperto',
          line: 2,
        }),
      });
      const result = await toolOf(new TypographyHandler(mock as any)).handler({}, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text as string).toContain('Nessun documento aperto');
    });
  });
});
