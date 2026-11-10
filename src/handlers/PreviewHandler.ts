import { z } from 'zod';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import { InDesignError } from '../utils/errorHandler.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../server/registerTool.js';

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
  /** Index into the open documents, as listed by document_listOpen. Defaults to the front document. */
  documentIndex: z.number().int().min(0).optional(),
  format: z.enum(['png', 'jpeg']).default('png'),
  resolutionPpi: z.number().int().min(72).max(600).default(150),
});

/**
 * Ceiling on the exported file. Base64 inflates it by a third inside the
 * message, and a 600 ppi page can render tens of megabytes. An image the host
 * cannot receive is not a preview.
 */
const MAX_PREVIEW_BYTES = 4_000_000;

/**
 * Renders a page to an image and returns it as an MCP image content block so
 * agents can see their work. The ExtendScript side only exports to a temp
 * path chosen by Node; reading bytes happens here (bridge and InDesign share
 * a filesystem), which avoids implementing base64 inside ExtendScript.
 *
 * The rendered file is capped on this side: an image large enough to break the
 * transport is not a preview, and failing with a number the caller can act on
 * beats returning a payload the host will choke on.
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
      registerTool(server, tool);
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
          documentIndex: previewParams.shape.documentIndex,
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

    try {
      let resolution = params.resolutionPpi;
      let bytes = await this.exportPage(params, resolution, tempPath);

      // Rather than fail and make the caller guess a safe number, re-export
      // once at the resolution that would fit the budget.
      if (bytes.length > MAX_PREVIEW_BYTES && resolution > 72) {
        const scaled = Math.max(
          72,
          Math.floor(resolution * Math.sqrt(MAX_PREVIEW_BYTES / bytes.length)),
        );
        if (scaled < resolution) {
          resolution = scaled;
          bytes = await this.exportPage(params, resolution, tempPath);
        }
      }

      // Even at 72 ppi an enormous page can overflow. Say so in a form the agent
      // can act on instead of returning an image the transport will choke on.
      if (bytes.length > MAX_PREVIEW_BYTES) {
        throw new InDesignError(
          `preview is ${bytes.length} bytes at ${resolution} ppi, over the ` +
            `${MAX_PREVIEW_BYTES}-byte cap the bridge can return; request a lower resolutionPpi`,
          'OUTPUT_TOO_LARGE',
        );
      }

      return {
        content: [{ type: 'image', data: bytes.toString('base64'), mimeType }],
      };
    } finally {
      this.io.unlink(tempPath);
    }
  }

  private async exportPage(
    params: z.infer<typeof previewParams>,
    resolution: number,
    tempPath: string,
  ): Promise<Buffer> {
    const isJpeg = params.format === 'jpeg';
    const prefLine = isJpeg
      ? `app.jpegExportPreferences.exportResolution = ${resolution};`
      : `app.pngExportPreferences.exportResolution = ${resolution};`;
    const docExpr =
      params.documentIndex === undefined
        ? '__resolveDocument()'
        : `app.documents[${params.documentIndex}]`;

    // InDesign 2026 DOM: Page has no exportFile — export the DOCUMENT with a
    // pageString taken from the target page's own name (section-aware).
    const code = `
      var __doc = ${docExpr};
      var __page = __doc.pages[${params.pageIndex}];
      ${prefLine}
      app.${isJpeg ? 'jpeg' : 'png'}ExportPreferences.pageString = __page.name;
      __doc.exportFile(ExportFormat.${isJpeg ? 'JPEG_FORMAT' : 'PNG_FORMAT'}, File(${JSON.stringify(tempPath)}));
      'ok';
    `;

    await this.executor.execute(code);
    try {
      return this.io.readFile(tempPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`preview failed: the exported file was not readable (${message})`, { cause: err });
    }
  }
}

