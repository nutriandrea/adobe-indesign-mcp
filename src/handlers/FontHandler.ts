import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class FontHandler implements IHandler {
  public readonly name = 'font';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'font_list',
        description: 'List all available fonts',
        inputSchema: {},
        handler: compose(withLogging('font_list'), withErrorHandling())(this.listFonts.bind(this)),
      },
      {
        name: 'font_find',
        description: 'Search fonts by name',
        inputSchema: {
          query: z.string(),
        },
        handler: compose(withLogging('font_find'), withErrorHandling())(this.findFonts.bind(this)),
      },
      {
        name: 'font_change',
        description: 'Change font of selected text',
        inputSchema: {
          fontName: z.string(),
          fontStyle: z.string().optional(),
          size: z.number().positive().optional(),
        },
        handler: compose(withLogging('font_change'), withErrorHandling())(this.changeFont.bind(this)),
      },
      {
        name: 'font_glyph_insert',
        description: 'Insert a special glyph at the cursor position',
        inputSchema: {
          glyphId: z.number().int().min(0),
          fontName: z.string().optional(),
        },
        handler: compose(withLogging('font_glyph_insert'), withErrorHandling())(this.insertGlyph.bind(this)),
      },
      {
        name: 'font_missing_check',
        description: 'Check for missing fonts in the document',
        inputSchema: {},
        handler: compose(withLogging('font_missing_check'), withErrorHandling())(this.checkMissingFonts.bind(this)),
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

  private async listFonts(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var fonts = app.fonts;
      var result = [];
      for (var i = 0; i < fonts.length; i++) {
        result.push({
          fontFamily: fonts[i].fontFamily,
          fontStyle: fonts[i].fontStyle,
          postscriptName: fonts[i].postscriptName,
          fontType: fonts[i].fontType
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async findFonts(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ query: z.string() }).parse(args as Record<string, unknown>);
    const escQuery = this.escape(params.query.toLowerCase());

    const code = `
      var fonts = app.fonts;
      var result = [];
      for (var i = 0; i < fonts.length; i++) {
        var name = fonts[i].fontFamily.toLowerCase();
        if (name.indexOf("${escQuery}") >= 0) {
          result.push({
            fontFamily: fonts[i].fontFamily,
            fontStyle: fonts[i].fontStyle,
            postscriptName: fonts[i].postscriptName
          });
        }
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async changeFont(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      fontName: z.string(),
      fontStyle: z.string().optional(),
      size: z.number().positive().optional(),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.fontName);
    const sizeStr = params.size ? `sel[0].pointSize = ${params.size};` : '';

    const code = `
      var sel = app.selection;
      if (sel.length === 0 || !sel[0].hasOwnProperty('appliedFont')) { 
        throw new Error("No text selected"); 
      }
      var font = app.fonts.item("${escName}");
      if (!font.isValid) { throw new Error("Font not found"); }
      sel[0].appliedFont = font;
      ${params.fontStyle ? `sel[0].fontStyle = "${this.escape(params.fontStyle)}";` : ''}
      ${sizeStr}
      JSON.stringify({ font: "${escName}", style: "${params.fontStyle || 'default'}", size: ${params.size || 'unchanged'} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async insertGlyph(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      glyphId: z.number().int().min(0),
      fontName: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const code = `
      var sel = app.selection;
      if (sel.length === 0) { throw new Error("No text insertion point"); }
      sel[0].insertSpecialChar(${params.glyphId});
      JSON.stringify({ glyphId: ${params.glyphId} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async checkMissingFonts(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var doc = app.activeDocument;
      var fonts = doc.fonts;
      var missing = [];
      for (var i = 0; i < fonts.length; i++) {
        if (!fonts[i].isValid) {
          missing.push({
            fontFamily: fonts[i].fontFamily,
            fontStyle: fonts[i].fontStyle
          });
        }
      }
      JSON.stringify({ missing: missing, count: missing.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
