import { describe, it, expect, vi } from 'vitest';
import { ExportHandler } from '../../../src/handlers/ExportHandler.js';

describe('ExportHandler', () => {
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
    it('should have name "export"', () => {
      const handler = new ExportHandler(createMockExecutor() as any);
      expect(handler.name).toBe('export');
    });

    it('should expose 11 tools', () => {
      const handler = new ExportHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(11);
    });

    it('should export all expected tools', () => {
      const handler = new ExportHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('export_document');
      expect(names).toContain('export_package');
      expect(names).toContain('export_preflight');
      expect(names).toContain('export_getSwatches');
      expect(names).toContain('export_getFonts');
      expect(names).toContain('export_getMasterSpreads');
      expect(names).toContain('export_getTables');
      expect(names).toContain('export_getXmlTags');
      expect(names).toContain('export_executeScript');
    });

    it('should have every tool with required structure', () => {
      const handler = new ExportHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  describe('export_document', () => {
    it('should call executor with exportFile for PDF format', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { exportedTo: '~/Desktop/export.pdf', format: 'pdf' } });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_document')!;
      const result = await tool.handler({ format: 'pdf', filePath: '~/Desktop/export.pdf' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('exportFile');
      expect(code).toContain('ExportFormat');
      expect(code).toContain('pdf');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should call executor with exportFile for EPUB format', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { exportedTo: '~/Desktop/export.epub', format: 'epub' } });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_document')!;
      await tool.handler({ format: 'epub' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('EPUB');
      expect(code).toContain('epub');
    });

    it('should use default filePath when not provided', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { exportedTo: '~/Desktop/export.jpg', format: 'jpg' } });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_document')!;
      await tool.handler({ format: 'jpg' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('export.jpg');
    });
  });

  describe('export_preflight', () => {
    it('should call executor with preflightProcesses.add', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { errors: [], status: 'completed' } });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_preflight')!;
      const result = await tool.handler({ waitForCompletion: true }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('preflightProcesses.add');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });

  describe('export_getSwatches', () => {
    it('should return swatches from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { name: 'Black', type: 'Color', spot: true },
          { name: 'White', type: 'Color', spot: false },
        ],
      });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_getSwatches')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Black');
    });
  });

  describe('export_getFonts', () => {
    it('should return fonts from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [
          { name: 'Arial', fontFamily: 'Arial', fontStyle: 'Regular' },
        ],
      });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_getFonts')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].fontFamily).toBe('Arial');
    });
  });

  describe('export_getMasterSpreads', () => {
    it('should return master spreads', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ name: 'A-Master', pageCount: 2 }],
      });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_getMasterSpreads')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('A-Master');
    });
  });

  describe('export_getTables', () => {
    it('should return tables with optional pageIndex filter', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ index: 0, rows: 5, columns: 3 }],
      });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_getTables')!;
      const result = await tool.handler({ pageIndex: 0 }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('pages[0]');
      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed[0].rows).toBe(5);
    });

    it('should scope to entire document when no pageIndex', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: [] });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_getTables')!;
      await tool.handler({}, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).not.toContain('pages[');
    });
  });

  describe('export_getXmlTags', () => {
    it('should return XML tags from executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({
        result: [{ name: 'root', label: '' }],
      });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_getXmlTags')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed[0].name).toBe('root');
    });
  });

  describe('export_executeScript', () => {
    it('should pass arbitrary code to executor', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: 'execution result' });
      const handler = new ExportHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'export_executeScript')!;
      const result = await tool.handler({ code: 'app.version' }, {});

      expect(mock.execute).toHaveBeenCalledWith('app.version');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });
});

describe('export_batchFolder', () => {
  function createMockExecutor() {
    return {
      execute: vi.fn().mockResolvedValue({
        result: JSON.stringify([{ file: 'a.indd', ok: true }]),
      }),
      on: vi.fn(),
    };
  }

  it('is exposed as an export tool', () => {
    const handler = new ExportHandler(createMockExecutor() as any);
    expect(handler.tools.map((t) => t.name)).toContain('export_batchFolder');
    expect(handler.tools).toHaveLength(11);
  });

  it('requires folderPath', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_batchFolder')!;
    // withErrorHandling converts validation failures into error results
    const res = await tool.handler({});
    expect(res.isError).toBe(true);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('sends a loop script over *.indd with invisible open, PDF export and NO_CHANGES close', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_batchFolder')!;

    await tool.handler({ folderPath: '/docs/in', outputDir: '/docs/out' });

    const [code, timeout] = executor.execute.mock.calls[0];
    expect(code).toContain('new Folder("/docs/in")');
    expect(code).toContain('"*.indd"');
    expect(code).toContain('PDF_TYPE');
    expect(code).toContain('NO_CHANGES');
    expect(timeout).toBe(300000);
  });

  it('strips the .indd extension with an escaped dot in the emitted script', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_batchFolder')!;

    await tool.handler({ folderPath: '/docs/in', outputDir: '/docs/out' });

    const [code] = executor.execute.mock.calls[0];
    // The script is a template literal, and a single `\.` there is an
    // unnecessary escape: it silently loses the backslash and the exported
    // regex becomes /.indd$/i, whose dot matches any character. Pin the doubled
    // backslash in the source so the emitted script keeps a literal dot.
    expect(code).toContain('replace(/\\.indd$/i');
  });

  it('escapes paths to prevent ExtendScript injection', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_batchFolder')!;

    await tool.handler({ folderPath: '/da"ta' });

    const [code] = executor.execute.mock.calls[0];
    expect(code).not.toContain('/da"ta');
    expect(code).toContain('\\"');
  });

  it('honors a custom timeout for large batches', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_batchFolder')!;

    await tool.handler({ folderPath: '/x', timeoutMs: 900000 });
    expect(executor.execute.mock.calls[0][1]).toBe(900000);
  });

  it('surfaces per-file failures returned by the script', async () => {
    const executor = createMockExecutor();
    executor.execute.mockResolvedValue({
      result: JSON.stringify([
        { file: 'ok.indd', ok: true },
        { file: 'bad.indd', ok: false, error: 'damaged' },
      ]),
    });
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_batchFolder')!;
    const res = await tool.handler({ folderPath: '/x' });

    expect(res.isError).toBeUndefined();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].ok).toBe(false);
  });

  it('returns an error result when execution fails', async () => {
    const executor = createMockExecutor();
    executor.execute.mockRejectedValue(new Error('Bridge is not connected'));
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_batchFolder')!;
    const res = await tool.handler({ folderPath: '/x' });

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('Bridge is not connected');
  });


describe('path hardening', () => {
  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_document')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.png']) {
      const res = await tool.handler({ filePath: bad, ...{"format": "pdf"} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });
});
});
function createExportExecutor() {
  return {
    execute: vi.fn().mockResolvedValue({ result: 'ok' }),
    on: vi.fn(),
    handleResponse: vi.fn(),
    cancelAll: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ connected: true, queueDepth: 0 }),
  };
}

describe('export_package', () => {
  const createMockExecutor = createExportExecutor;
  function packagedScript(executor: ReturnType<typeof createMockExecutor>): string {
    const call = executor.execute.mock.calls[0];
    return String(call[0]);
  }

  function positionalArgs(script: string): string[] {
    const open = script.indexOf('packageForPrint(');
    expect(open, 'packageForPrint must appear in the script').toBeGreaterThan(-1);
    const body = script.slice(open + 'packageForPrint('.length, script.indexOf(');', open));
    return body
      .split(',')
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0);
  }

  it('passes the fourteen arguments in the order the DOM reference lists them', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_package')!;

    await tool.handler({ folderPath: '/tmp/pkg' });

    const args = positionalArgs(packagedScript(executor));
    expect(args).toHaveLength(14);
    // to, copyingFonts, copyingLinkedGraphics, copyingProfiles, updatingGraphics,
    // includingHiddenLayers, ignorePreflightErrors, creatingReport, includeIdml,
    // includePdf, pdfStyle, useDocumentHyphenationExceptionsOnly,
    // versionComments, forceSave
    expect(args[0]).toBe('__folder');
    expect(args.slice(1, 10)).toEqual(['true', 'true', 'false', 'false', 'false', 'false', 'true', 'false', 'false']);
    expect(args[10]).toBe('""');
    expect(args[11]).toBe('true');
    expect(args[12]).toBe('""');
    expect(args[13]).toBe('false');
  });

  it('does not silently swallow preflight errors by default', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_package')!;

    await tool.handler({ folderPath: '/tmp/pkg' });

    const args = positionalArgs(packagedScript(executor));
    // ignorePreflightErrors is the seventh argument; false keeps packaging honest.
    expect(args[6]).toBe('false');
  });

  it('carries overrides into the right positions', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_package')!;

    await tool.handler({
      folderPath: '/tmp/pkg',
      copyingFonts: false,
      copyingLinkedGraphics: false,
      ignorePreflightErrors: true,
      creatingReport: false,
      includePdf: true,
      pdfStyle: 'Press Quality',
    });

    const args = positionalArgs(packagedScript(executor));
    expect(args[1]).toBe('false');
    expect(args[2]).toBe('false');
    expect(args[6]).toBe('true');
    expect(args[7]).toBe('false');
    expect(args[9]).toBe('true');
    expect(args[10]).toBe('"Press Quality"');
  });

  it('creates the folder when missing and reports what landed in it', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_package')!;

    await tool.handler({ folderPath: '/tmp/pkg' });

    const script = packagedScript(executor);
    expect(script).toContain('__folder.exists');
    expect(script).toContain('__folder.create()');
    expect(script).toContain('getFiles()');
    expect(script).toContain('fileCount');
  });

  it('explains a preflight cancellation instead of failing silently', async () => {
    const executor = createMockExecutor();
    executor.execute.mockResolvedValue({
      result: JSON.stringify({ ok: false, error: 'Preflight errors', hint: 'run export_preflight' }),
    });
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_package')!;

    const res = await tool.handler({ folderPath: '/tmp/pkg' });

    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.ok).toBe(false);
    expect(parsed.hint).toContain('export_preflight');
    // The script-level hint must be in the generated code for the real InDesign path too.
    expect(packagedScript(executor)).toContain('set ignorePreflightErrors: true');
  });

  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_package')!;

    for (const bad of ['../../etc/passwd', '/etc/hosts']) {
      const res = await tool.handler({ folderPath: bad });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });

  it('returns an error result when the bridge fails', async () => {
    const executor = createMockExecutor();
    executor.execute.mockRejectedValue(new Error('Bridge is not connected'));
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_package')!;

    const res = await tool.handler({ folderPath: '/tmp/pkg' });

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('Bridge is not connected');
  });
});

describe('export_document format honesty', () => {
  const createMockExecutor = createExportExecutor;

  // `ExportFormat` in the InDesign DOM has no PACKAGE member, so the old
  // `format: 'package'` path evaluated to undefined and always failed. Packaging
  // is a separate tool with its own arguments.
  it('no longer advertises a package format it cannot produce', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_document')!;

    const res = await tool.handler({ format: 'package' });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('invalid_enum_value');
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('never emits ExportFormat.PACKAGE in the script', async () => {
    const executor = createMockExecutor();
    const handler = new ExportHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'export_document')!;

    await tool.handler({ format: 'pdf', filePath: '/tmp/out.pdf' });

    expect(String(executor.execute.mock.calls[0][0])).not.toContain('ExportFormat.PACKAGE');
  });
});
