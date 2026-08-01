import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export class TextHandler implements IHandler {
  public readonly name = 'text';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'text_addFrame',
        description: 'Add a text frame to a specified page with content',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }),
          content: z.string().default(''),
        },
        handler: compose(withLogging('text_addFrame'), withErrorHandling())(this.addFrame.bind(this)),
      },
      {
        name: 'text_setContent',
        description: 'Set content of a text frame',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          content: z.string(),
        },
        handler: compose(withLogging('text_setContent'), withErrorHandling())(this.setContent.bind(this)),
      },
      {
        name: 'text_getContent',
        description: 'Get content from a text frame',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          includeControlChars: z.boolean().optional().default(false).describe('Include BOM (\\ufeff) and control chars (\\u0004) in output'),
          timeout: z.number().int().min(1000).max(300000).optional().describe('Custom timeout in ms'),
        },
        handler: compose(withLogging('text_getContent'), withErrorHandling())(this.getContent.bind(this)),
      },
      {
        name: 'text_getStories',
        description: 'List all stories in the active document with optional timeout and max results',
        inputSchema: {
          maxResults: z.number().int().min(1).max(5000).optional().default(500).describe('Maximum number of stories to return'),
          timeout: z.number().int().min(1000).max(300000).optional().describe('Custom timeout in ms for large documents'),
          includeControlChars: z.boolean().optional().default(false).describe('Include BOM and control characters in content preview'),
        },
        handler: compose(withLogging('text_getStories'), withErrorHandling())(this.getStories.bind(this)),
      },
      {
        name: 'text_applyParagraphStyle',
        description: 'Apply a paragraph style to a text range',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          styleName: z.string(),
          paragraphIndex: z.number().int().min(0).optional(),
        },
        handler: compose(withLogging('text_applyParagraphStyle'), withErrorHandling())(this.applyParagraphStyle.bind(this)),
      },
      {
        name: 'text_findReplace',
        description: 'Find and replace text content',
        inputSchema: {
          findWhat: z.string(),
          replaceWith: z.string(),
          scope: z.enum(['document', 'story', 'selection']).default('document'),
        },
        handler: compose(withLogging('text_findReplace'), withErrorHandling())(this.findReplace.bind(this)),
      },
      {
        name: 'text_getTextFrames',
        description: 'List all text frames on a page with optional timeout',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          timeout: z.number().int().min(1000).max(300000).optional().describe('Custom timeout in ms for large documents'),
          includeControlChars: z.boolean().optional().default(false).describe('Include BOM and control characters in content preview'),
        },
        handler: compose(withLogging('text_getTextFrames'), withErrorHandling())(this.getTextFrames.bind(this)),
      },
    ];
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
    }
  }

  private escape(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }

  /** Normalize \n (and \r\n) to ExtendScript's paragraph break \r — InDesign
   *  2026 does NOT create paragraphs from \n in `contents = "..."`. */
  private normalizeParagraphs(content: string): string {
    return content.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
  }

  private async addFrame(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }),
      content: z.string().default(''),
    }).parse(args);
    const escContent = this.escape(this.normalizeParagraphs(params.content));
    const { top, left, bottom, right } = params.bounds;
    const code = `
      var page = app.activeDocument.pages[${params.pageIndex}];
      var tf = page.textFrames.add();
      tf.geometricBounds = [${top}, ${left}, ${bottom}, ${right}];
      tf.contents = "${escContent}";
      JSON.stringify({ index: tf.index, bounds: tf.geometricBounds });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setContent(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      content: z.string(),
    }).parse(args as Record<string, unknown>);
    const escContent = this.escape(this.normalizeParagraphs(params.content));
    const code = `app.activeDocument.pages[${params.pageIndex}].textFrames[${params.frameIndex}].contents = "${escContent}"; "set"`;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getContent(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      includeControlChars: z.boolean().optional().default(false),
      timeout: z.number().int().min(1000).max(300000).optional(),
    }).parse(args as Record<string, unknown>);

    const code = params.includeControlChars
      ? `app.activeDocument.pages[${params.pageIndex}].textFrames[${params.frameIndex}].contents`
      : `app.activeDocument.pages[${params.pageIndex}].textFrames[${params.frameIndex}].contents.replace(/[\\ufeff\\u0004]/g, '')`;

    const response = await this.executor.execute(code, params.timeout);
    return formatResponse(response.result);
  }

  private async getStories(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      maxResults: z.number().int().min(1).max(5000).optional().default(500),
      timeout: z.number().int().min(1000).max(300000).optional(),
      includeControlChars: z.boolean().optional().default(false),
    }).parse(args as Record<string, unknown>);

    const filterExpr = params.includeControlChars
      ? 'stories[i].contents.substring(0, 200)'
      : "stories[i].contents.replace(/[\\ufeff\\u0004]/g, '').substring(0, 200)";

    const code = `
      var stories = app.activeDocument.stories;
      var result = [];
      var limit = Math.min(stories.length, ${params.maxResults});
      for (var i = 0; i < limit; i++) {
        result.push({
          index: i,
          length: stories[i].length,
          textFrames: stories[i].textContainers.length,
          contents: ${filterExpr}
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code, params.timeout);
    return formatResponse(response.result);
  }

  private async applyParagraphStyle(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      styleName: z.string(),
      paragraphIndex: z.number().int().min(0).optional(),
    }).parse(args as Record<string, unknown>);
    const escStyle = this.escape(params.styleName);
    const code = params.paragraphIndex !== undefined
      ? `app.activeDocument.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}].appliedParagraphStyle = app.activeDocument.paragraphStyles.item("${escStyle}"); "applied"`
      : `app.activeDocument.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs.everyItem().appliedParagraphStyle = app.activeDocument.paragraphStyles.item("${escStyle}"); "applied"`;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async findReplace(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      findWhat: z.string(),
      replaceWith: z.string(),
      scope: z.enum(['document', 'story', 'selection']).default('document'),
    }).parse(args as Record<string, unknown>);
    const escFind = this.escape(params.findWhat);
    const escReplace = this.escape(params.replaceWith);
    const code = `
      app.findTextPreferences = NothingEnum.nothing;
      app.changeTextPreferences = NothingEnum.nothing;
      app.findTextPreferences.findWhat = "${escFind}";
      app.changeTextPreferences.changeTo = "${escReplace}";
      var changed = app.activeDocument.changeText();
      app.findTextPreferences = NothingEnum.nothing;
      app.changeTextPreferences = NothingEnum.nothing;
      JSON.stringify({ occurrencesChanged: changed.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getTextFrames(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      timeout: z.number().int().min(1000).max(300000).optional(),
      includeControlChars: z.boolean().optional().default(false),
    }).parse(args as Record<string, unknown>);

    const filterExpr = params.includeControlChars
      ? 'tfs[i].contents.substring(0, 100)'
      : "tfs[i].contents.replace(/[\\ufeff\\u0004]/g, '').substring(0, 100)";

    const code = `
      var tfs = app.activeDocument.pages[${params.pageIndex}].textFrames;
      var result = [];
      for (var i = 0; i < tfs.length; i++) {
        result.push({
          index: i,
          bounds: tfs[i].geometricBounds,
          contentType: tfs[i].contentType,
          overflows: tfs[i].overflows,
          contentPreview: ${filterExpr}
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code, params.timeout);
    return formatResponse(response.result);
  }
}
