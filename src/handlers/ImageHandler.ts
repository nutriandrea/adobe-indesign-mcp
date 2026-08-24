import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class ImageHandler implements IHandler {
  public readonly name = 'image';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'image_place',
        description: 'Place an image from a file path onto a page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          filePath: z.string(),
          x: z.number(),
          y: z.number(),
          width: z.number().positive().optional(),
          height: z.number().positive().optional(),
        },
        handler: compose(withLogging('image_place'), withErrorHandling())(this.placeImage.bind(this)),
      },
      {
        name: 'image_adjust',
        description: 'Adjust image properties (brightness, contrast, etc.)',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          brightness: z.number().min(-100).max(100).optional(),
          contrast: z.number().min(-100).max(100).optional(),
        },
        handler: compose(withLogging('image_adjust'), withErrorHandling())(this.adjustImage.bind(this)),
      },
      {
        name: 'image_fit',
        description: 'Fit image content to its frame',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          fitting: z.enum(['fill', 'proportional', 'fitContentToFrame', 'fitFrameToContent', 'center']),
        },
        handler: compose(withLogging('image_fit'), withErrorHandling())(this.fitImage.bind(this)),
      },
      {
        name: 'image_relink',
        description: 'Relink/replace an image with a new file',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          filePath: z.string(),
        },
        handler: compose(withLogging('image_relink'), withErrorHandling())(this.relinkImage.bind(this)),
      },
      {
        name: 'image_info',
        description: 'Get metadata for an image on a page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('image_info'), withErrorHandling())(this.imageInfo.bind(this)),
      },
    ];
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
    }
  }

  private escape(str: string): string {
    return escapeExtendScriptString(str);
  }

  private async placeImage(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      filePath: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
    }).parse(args as Record<string, unknown>);

    const escPath = this.escape(params.filePath);
    const scaleCode = params.width && params.height
      ? `img.geometricBounds = [${params.y}, ${params.x}, ${params.y + params.height}, ${params.x + params.width}];`
      : '';

    const code = `
      var page = app.activeDocument.pages[${params.pageIndex}];
      var img = page.place(File("${escPath}"))[0];
      ${scaleCode}
      JSON.stringify({
        index: img.index,
        bounds: img.geometricBounds,
        linkStatus: img.imageLink ? img.imageLink.status : 'unknown'
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async adjustImage(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      brightness: z.number().min(-100).max(100).optional(),
      contrast: z.number().min(-100).max(100).optional(),
    }).parse(args as Record<string, unknown>);

    let setStr = '';
    if (params.brightness !== undefined) setStr += `img.brightness = ${params.brightness};\n`;
    if (params.contrast !== undefined) setStr += `img.contrast = ${params.contrast};\n`;

    const code = `
      var img = app.activeDocument.pages[${params.pageIndex}].allGraphics[${params.itemIndex}];
      if (!img) { throw new Error("Image not found"); }
      ${setStr}
      "adjusted";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async fitImage(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      fitting: z.enum(['fill', 'proportional', 'fitContentToFrame', 'fitFrameToContent', 'center']),
    }).parse(args as Record<string, unknown>);

    const fittingMap: Record<string, string> = {
      fill: 'FillProportionally',
      proportional: 'Proportionally',
      fitContentToFrame: 'ContentToFrame',
      fitFrameToContent: 'FrameToContent',
      center: 'CenterContent',
    };

    const code = `
      var img = app.activeDocument.pages[${params.pageIndex}].allGraphics[${params.itemIndex}];
      if (!img) { throw new Error("Image not found"); }
      img.fit(FitOptions.${fittingMap[params.fitting]});
      JSON.stringify({ fitting: "${params.fitting}", bounds: img.geometricBounds });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async relinkImage(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      filePath: z.string(),
    }).parse(args as Record<string, unknown>);

    const escPath = this.escape(params.filePath);
    const code = `
      var img = app.activeDocument.pages[${params.pageIndex}].allGraphics[${params.itemIndex}];
      if (!img || !img.imageLink) { throw new Error("Image or link not found"); }
      img.imageLink.relink(File("${escPath}"));
      "relinked";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async imageInfo(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var img = app.activeDocument.pages[${params.pageIndex}].allGraphics[${params.itemIndex}];
      if (!img) { throw new Error("Image not found"); }
      var link = img.imageLink;
      JSON.stringify({
        index: ${params.itemIndex},
        filePath: link ? link.filePath : 'embedded',
        linkStatus: link ? link.status : 'embedded',
        bounds: img.geometricBounds,
        effectivePpi: img.horizontalScale,
        actualPpi: 300
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
