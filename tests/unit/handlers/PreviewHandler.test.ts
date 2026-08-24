import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreviewHandler } from '../../../src/handlers/PreviewHandler.js';
import type { ScriptExecutor } from '../../../src/bridge/ScriptExecutor.js';

describe('PreviewHandler', () => {
  let executor: { execute: ReturnType<typeof vi.fn> };
  let io: {
    readFile: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    makeTempPath: () => string;
  };
  let handler: PreviewHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = { execute: vi.fn().mockResolvedValue({ id: 'x', type: 'result', result: '"ok"' }) };
    io = {
      readFile: vi.fn().mockReturnValue(Buffer.from('PNGBYTES')),
      unlink: vi.fn(),
      makeTempPath: () => '/tmp/prev-test.png',
    };
    handler = new PreviewHandler(executor as unknown as ScriptExecutor, io);
  });

  it('exposes exactly one document_preview tool', () => {
    expect(handler.tools.map((t) => t.name)).toEqual(['document_preview']);
  });

  it('sends an export script with page index, PPI and the node-side temp path', async () => {
    const tool = handler.tools[0];
    await tool.handler({ pageIndex: 2, resolutionPpi: 300 });

    const [code] = executor.execute.mock.calls[0];
    expect(code).toContain('pages[2]');
    expect(code).toContain('300');
    expect(code).toContain('/tmp/prev-test.png');
    expect(code).toContain('PNG_FORMAT');
  });

  it('returns an MCP image content block built from the exported file', async () => {
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBeUndefined();
    expect(res.content[0]).toEqual({
      type: 'image',
      data: Buffer.from('PNGBYTES').toString('base64'),
      mimeType: 'image/png',
    });
  });

  it('uses jpeg mime and export format when requested', async () => {
    const tool = handler.tools[0];
    await tool.handler({ format: 'jpeg' });

    const [code] = executor.execute.mock.calls[0];
    expect(code).toContain('JPEG_FORMAT');
    void tool;
  });

  it('reports a readable error when the export file never appears', async () => {
    io.readFile.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('preview failed');
  });

  it('always deletes the temp file, even after read errors', async () => {
    io.readFile.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const tool = handler.tools[0];
    await tool.handler({});

    expect(io.unlink).toHaveBeenCalledWith('/tmp/prev-test.png');
  });

  it('propagates executor failures as error results', async () => {
    executor.execute.mockRejectedValue(new Error('Bridge is not connected'));
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('Bridge is not connected');
  });
});
