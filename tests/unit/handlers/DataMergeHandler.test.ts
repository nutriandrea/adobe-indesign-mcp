import { describe, it, expect, vi } from 'vitest';
import { DataMergeHandler } from '../../../src/handlers/DataMergeHandler.js';

describe('DataMergeHandler', () => {
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
    it('should have name "dataMerge"', () => {
      const handler = new DataMergeHandler(createMockExecutor() as any);
      expect(handler.name).toBe('dataMerge');
    });

    it('should expose 5 tools', () => {
      const handler = new DataMergeHandler(createMockExecutor() as any);
      expect(handler.tools).toHaveLength(5);
    });

    it('should export all expected tools', () => {
      const handler = new DataMergeHandler(createMockExecutor() as any);
      const names = handler.tools.map((t) => t.name);
      expect(names).toContain('dataMerge_selectDataSource');
      expect(names).toContain('dataMerge_listFields');
      expect(names).toContain('dataMerge_mergeRecords');
      expect(names).toContain('dataMerge_export');
      expect(names).toContain('dataMerge_removeDataSource');
    });

    it('should have every tool with name, description, inputSchema, and handler', () => {
      const handler = new DataMergeHandler(createMockExecutor() as any);
      for (const tool of handler.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  describe('dataMerge_selectDataSource', () => {
    it('should call executor with selectDataSource ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, filePath: '/path/to/data.csv' } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_selectDataSource')!;
      const result = await tool.handler({ filePath: '/path/to/data.csv' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('dataMergeProperties');
      expect(code).toContain('selectDataSource');
      expect(code).toContain('/path/to/data.csv');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should escape special characters in filePath', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, filePath: '/path/with \"quotes\"/data.csv' } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_selectDataSource')!;
      await tool.handler({ filePath: '/path/with "quotes"/data.csv' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('\\"');
      expect(code).not.toContain('unescaped');
    });

    it('should return selectDataSource result with filePath', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, filePath: '/path/to/data.csv' } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_selectDataSource')!;
      const result = await tool.handler({ filePath: '/path/to/data.csv' }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ success: true, filePath: '/path/to/data.csv' });
    });
  });

  describe('dataMerge_listFields', () => {
    it('should call executor with listFields ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: [{ name: 'FirstName', fieldType: 'text' }] });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_listFields')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('dataMergeFields');
      expect(code).toContain('fields[i].name');
      expect(code).toContain('fields[i].fieldType');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return listFields result with field array', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: [{ name: 'FirstName', fieldType: 'text' }, { name: 'LastName', fieldType: 'text' }] });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_listFields')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toMatchObject({ name: 'FirstName', fieldType: 'text' });
    });
  });

  describe('dataMerge_mergeRecords', () => {
    it('should call executor with mergeRecords ExtendScript code using defaults', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, recordsPerPage: 1, linkImages: false, generatePreview: false, alertWhenOverset: true } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_mergeRecords')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('dataMergePreferences.recordsPerPage = 1');
      expect(code).toContain('dataMergePreferences.linkImages = false');
      expect(code).toContain('dataMergePreferences.generatePreview = false');
      expect(code).toContain('dataMergePreferences.alertWhenOverset = true');
      expect(code).toContain('mergeRecords()');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should accept custom merge parameters', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, recordsPerPage: 2, linkImages: true, generatePreview: true, alertWhenOverset: false } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_mergeRecords')!;
      const result = await tool.handler({
        recordsPerPage: 2,
        linkImages: true,
        generatePreview: true,
        alertWhenOverset: false,
      }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('dataMergePreferences.recordsPerPage = 2');
      expect(code).toContain('dataMergePreferences.linkImages = true');
      expect(code).toContain('dataMergePreferences.generatePreview = true');
      expect(code).toContain('dataMergePreferences.alertWhenOverset = false');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return mergeRecords result with preferences', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, recordsPerPage: 2, linkImages: true, generatePreview: false, alertWhenOverset: true } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_mergeRecords')!;
      const result = await tool.handler({ recordsPerPage: 2, linkImages: true }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ success: true, recordsPerPage: 2, linkImages: true });
    });
  });

  describe('dataMerge_export', () => {
    it('should call executor with PDF export ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, format: 'pdf', outputPath: '/path/to/output.pdf' } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_export')!;
      const result = await tool.handler({ format: 'pdf', outputPath: '/path/to/output.pdf' }, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('ExportFormat.pdfType');
      expect(code).toContain('exportFile');
      expect(code).toContain('/path/to/output.pdf');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should call executor with JPG export ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, format: 'jpg', outputPath: '/path/to/output.jpg' } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_export')!;
      const result = await tool.handler({ format: 'jpg', outputPath: '/path/to/output.jpg' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('ExportFormat.jpgType');
      expect(code).toContain('exportFile');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should call executor with INDD saveACopy ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, format: 'indd', outputPath: '/path/to/output.indd' } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_export')!;
      const result = await tool.handler({ format: 'indd', outputPath: '/path/to/output.indd' }, {});

      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('saveACopy');
      expect(code).not.toContain('exportFile');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return export result with format', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true, format: 'pdf', outputPath: '/path/to/output.pdf' } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_export')!;
      const result = await tool.handler({ format: 'pdf', outputPath: '/path/to/output.pdf' }, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ success: true, format: 'pdf' });
    });
  });

  describe('dataMerge_removeDataSource', () => {
    it('should call executor with removeDataSource ExtendScript code', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_removeDataSource')!;
      const result = await tool.handler({}, {});

      expect(mock.execute).toHaveBeenCalledTimes(1);
      const code = mock.execute.mock.calls[0][0] as string;
      expect(code).toContain('removeDataSource');
      expect(result.content[0]).toHaveProperty('type', 'text');
    });

    it('should return removeDataSource result with success', async () => {
      const mock = createMockExecutor();
      mock.execute.mockResolvedValue({ result: { success: true } });
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_removeDataSource')!;
      const result = await tool.handler({}, {});

      const text = result.content[0] as any;
      const parsed = JSON.parse(text.text);
      expect(parsed).toMatchObject({ success: true });
    });
  });

  describe('error handling', () => {
    it('should return isError when executor rejects', async () => {
      const mock = createMockExecutor();
      mock.execute.mockRejectedValue(new Error('Failed to select data source'));
      const handler = new DataMergeHandler(mock as any);

      const tool = handler.tools.find((t) => t.name === 'dataMerge_selectDataSource')!;
      const result = await tool.handler({ filePath: '/path/to/data.csv' }, {});

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
    });
  });


describe('path hardening', () => {
  it('rejects traversal and system paths before touching the executor', async () => {
    const executor = createMockExecutor();
    const handler = new DataMergeHandler(executor as any);
    const tool = handler.tools.find((t) => t.name === 'dataMerge_selectDataSource')!;
    for (const bad of ['../../etc/passwd', '/etc/hosts', 'C:\\Windows\\System32\\x.png']) {
      const res = await tool.handler({ filePath: bad, ...{} });
      expect(res.isError, `expected isError for ${bad}`).toBe(true);
      expect(executor.execute, `executor must not run for ${bad}`).not.toHaveBeenCalled();
    }
  });
});
});