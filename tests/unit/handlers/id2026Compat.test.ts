import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ColorHandler } from '../../../src/handlers/ColorHandler.js';
import { AnchoredObjectHandler } from '../../../src/handlers/AnchoredObjectHandler.js';
import { EXTENDSCRIPT_HELPERS } from '../../../src/bridge/extendScriptHelpers.js';

/**
 * InDesign 2026 compatibility contract:
 * - ColorModel enum members were renamed (PROCESS_RGB/PROCESS_CMYK -> PROCESS)
 *   and the enum object is READ-ONLY. Generated code must never reference
 *   ColorModel.PROCESS_RGB / PROCESS_CMYK directly; it must use the
 *   __PROCESS_COLOR_MODEL helper resolved at runtime.
 * - AnchorPoint enum members gained an _ANCHOR suffix in 2026. Generated code
 *   must resolve via the __ANCHOR_POINT(name) helper instead of hardcoding
 *   AnchorPoint.X.
 * - move() no longer accepts InsertionPoint targets: anchored items must be
 *   created directly on the insertion point's own collection.
 */
describe('InDesign 2026 compatibility', () => {
  let mock: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mock = { execute: vi.fn().mockResolvedValue({ result: 'ok' }) };
  });

  describe('EXTENDSCRIPT_HELPERS', () => {
    it('defines __PROCESS_COLOR_MODEL resolver that never writes to the enum', () => {
      expect(EXTENDSCRIPT_HELPERS).toContain('__PROCESS_COLOR_MODEL');
      expect(EXTENDSCRIPT_HELPERS).toContain('ColorModel.PROCESS');
    });

    it('defines __ANCHOR_POINT resolver with _ANCHOR suffix support and numeric fallbacks', () => {
      expect(EXTENDSCRIPT_HELPERS).toContain('__ANCHOR_POINT');
      expect(EXTENDSCRIPT_HELPERS).toContain('_ANCHOR');
      expect(EXTENDSCRIPT_HELPERS).toContain('1095660652');
    });
  });

  describe('ColorHandler.color_swatch_create', () => {
    it('cmyk swatches use __PROCESS_COLOR_MODEL, not ColorModel.PROCESS_CMYK', async () => {
      const handler = new ColorHandler(mock as any);
      const tool = handler.tools.find((t) => t.name === 'color_swatch_create')!;
      await tool.handler(
        { name: 'Brand Blue', model: 'cmyk', cyan: 100, magenta: 50, yellow: 0, black: 0 },
        {},
      );
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('__PROCESS_COLOR_MODEL');
      expect(code).not.toContain('ColorModel.PROCESS_CMYK');
      expect(code).not.toContain('ColorModel.PROCESS_RGB');
    });

    it('rgb swatches use __PROCESS_COLOR_MODEL, not ColorModel.PROCESS_RGB', async () => {
      const handler = new ColorHandler(mock as any);
      const tool = handler.tools.find((t) => t.name === 'color_swatch_create')!;
      await tool.handler(
        { name: 'Accent', model: 'rgb', red: 10, green: 20, blue: 30 },
        {},
      );
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('__PROCESS_COLOR_MODEL');
      expect(code).not.toContain('ColorModel.PROCESS_RGB');
    });
  });

  describe('AnchoredObjectHandler.anchoredObject_create', () => {
    it('resolves anchor points through __ANCHOR_POINT, not raw enum refs', async () => {
      const handler = new AnchoredObjectHandler(mock as any);
      const tool = handler.tools.find((t) => t.name === 'anchoredObject_create')!;
      await tool.handler(
        {
          storyIndex: 0,
          insertionIndex: 2,
          contentType: 'textFrame',
          height: 100,
          width: 50,
          anchorPosition: 'topLeft',
        },
        {},
      );
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain("__ANCHOR_POINT('TOP_LEFT')");
      expect(code).not.toContain('AnchorPoint.TOP_LEFT');
    });

    it('creates the item directly on the insertion point instead of move(ip)', async () => {
      const handler = new AnchoredObjectHandler(mock as any);
      const tool = handler.tools.find((t) => t.name === 'anchoredObject_create')!;
      await tool.handler(
        {
          storyIndex: 0,
          insertionIndex: 0,
          contentType: 'rectangle',
          height: 80,
          width: 40,
          anchorPosition: 'center',
        },
        {},
      );
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('ip.rectangles.add(');
      expect(code).not.toContain('.move(ip)');
    });
  });
});
