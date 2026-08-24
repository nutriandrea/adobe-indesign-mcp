import { z } from 'zod';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface PreviewIo {
  readFile: (path: string) => Buffer;
  unlink: (path: string) => void;
  makeTempPath: (ext: string) => string;
}

export const defaultPreviewIo: PreviewIo = {
  readFile: (path) => readFileSync(path),
  unlink: (path) => {
    try {
      unlinkSync(path);
    } catch {
      // best effort
    }
  },
  makeTempPath: (ext) => join(tmpdir(), `indesign-preview-${randomUUID()}.${ext}`),
}

const previewParams = z.object({
  pageIndex: z.number().int().min(0).default(0),
  format: z.enum(['png', 'jpeg']).default('png'),
  resolutionPpi: z.number().int().min(72).max(600).default(150),
});

/**
 * Renders a page to an image and returns it as an MCP image content block so
 * agents can see their work. The ExtendScript side only exports to a temp
 * path chosen by Node; reading bytes happens here (bridge and InDesign share
 * a filesystem), which avoids implementing base64 inside ExtendScript.
 */
export class PreviewHandler implements IHandler {
  public readonly name = 'preview';
  private executor: ScriptExecutor;
  private io: PreviewIo;

  constructor(executor: ScriptExecutor, io: PreviewIo = defaultPreviewIo) {
    this.executor = executor;
    this.io = io;
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
    }
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'preview_document',
        description:
          'Render a page of the active document as an image (PNG or JPEG) so you can visually inspect layout, colors and typography',
        inputSchema: {
          pageIndex: previewParams.shape.pageIndex,
          format: previewParams.shape.format,
          resolutionPpi: previewParams.shape.resolutionPpi,
        },
        handler: compose(withLogging('preview_document'), withErrorHandling())(this.preview.bind(this)),
      },
    ];
  }

  private async preview(args: unknown): Promise<ToolResult> {
    const params = previewParams.parse(args);
    const isJpeg = params.format === 'jpeg';
    const tempPath = this.io.makeTempPath(isJpeg ? 'jpg' : 'png');
    const mimeType = isJpeg ? 'image/jpeg' : 'image/png';

    const prefLine = isJpeg
      ? `app.jpegExportPreferences.resolutionPpi = ${params.resolutionPpi};`
      : `app.pngExportPreferences.resolutionPpi = ${params.resolutionPpi};`;

    const code = `
      var __previewPage = app.activeDocument.pages[${params.pageIndex}];
      ${prefLine}
      __previewPage.exportFile(ExportFormat.${isJpeg ? 'JPEG_FORMAT' : 'PNG_FORMAT'}, File(${JSON.stringify(tempPath)}));
      JSON.stringify({ ok: true });
    `;

    try {
      await this.executor.execute(code);
      const bytes = this.io.readFile(tempPath);
      return {
        content: [
          { type: 'image', data: bytes.toString('base64'), mimeType },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `preview failed: ${message}` }],
        isError: true,
      };
    } finally {
      this.io.unlink(tempPath);
    }
  }
}

