import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class TocHandler implements IHandler {
  public readonly name = 'toc';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'toc_createStyle',
        description: 'Create or modify a Table of Contents style in the active document',
        inputSchema: {
          name: z.string(),
          title: z.string().optional(),
          titleStyle: z.string().optional(),
          includeParagraphStyles: z.array(z.string()).optional(),
          entryStyle: z.string().optional(),
          pageNumberStyle: z.enum(['beforeEntry', 'afterEntry', 'noPageNumber']).optional().default('afterEntry'),
          betweenEntryAndNumber: z.string().optional().default('\t'),
          replaceExisting: z.boolean().optional().default(true),
        },
        handler: compose(withLogging('toc_createStyle'), withErrorHandling())(this.createStyle.bind(this)),
      },
      {
        name: 'toc_generate',
        description: 'Generate a Table of Contents on a specified page',
        inputSchema: {
          styleName: z.string(),
          pageIndex: z.number().int().min(0),
          bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }).optional(),
          title: z.string().optional(),
          layerIndex: z.number().int().min(0).optional(),
        },
        handler: compose(withLogging('toc_generate'), withErrorHandling())(this.generate.bind(this)),
      },
      {
        name: 'toc_listStyles',
        description: 'List all Table of Contents styles in the active document',
        inputSchema: {},
        handler: compose(withLogging('toc_listStyles'), withErrorHandling())(this.listStyles.bind(this)),
      },
      {
        name: 'toc_update',
        description: 'Update (regenerate) an existing TOC from its story',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          styleName: z.string().optional(),
        },
        handler: compose(withLogging('toc_update'), withErrorHandling())(this.update.bind(this)),
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

  private async createStyle(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      name: z.string(),
      title: z.string().optional(),
      titleStyle: z.string().optional(),
      includeParagraphStyles: z.array(z.string()).optional(),
      entryStyle: z.string().optional(),
      pageNumberStyle: z.enum(['beforeEntry', 'afterEntry', 'noPageNumber']).optional().default('afterEntry'),
      betweenEntryAndNumber: z.string().optional().default('\t'),
      replaceExisting: z.boolean().optional().default(true),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.name);
    const escTitle = params.title ? this.escape(params.title) : '';
    const escTitleStyle = params.titleStyle ? this.escape(params.titleStyle) : '';
    const escEntryStyle = params.entryStyle ? this.escape(params.entryStyle) : '';
    const escSep = this.escape(params.betweenEntryAndNumber);
    const incStyles = params.includeParagraphStyles ? params.includeParagraphStyles.map((s: string) => `"${this.escape(s)}"`).join(', ') : '';

    const code = `
      var doc = app.activeDocument;
      var tocStyle;
      try { tocStyle = doc.tocStyles.item("${escName}"); } catch(e) {}
      if (!tocStyle.isValid) { tocStyle = doc.tocStyles.add(); }
      tocStyle.name = "${escName}";
      ${params.title ? `tocStyle.title = "${escTitle}";` : ''}
      ${params.titleStyle ? `tocStyle.titleStyle = doc.paragraphStyles.item("${escTitleStyle}");` : ''}
      ${params.entryStyle ? `tocStyle.entryStyle = doc.paragraphStyles.item("${escEntryStyle}");` : ''}
      tocStyle.pageNumberStyle = PageNumberStyle.${params.pageNumberStyle === 'beforeEntry' ? 'PAGE_NUMBER_BEFORE_ENTRY' : params.pageNumberStyle === 'afterEntry' ? 'PAGE_NUMBER_AFTER_ENTRY' : 'NO_PAGE_NUMBER'};
      tocStyle.betweenEntryAndNumber = "${escSep}";
      ${params.includeParagraphStyles ? `tocStyle.includeParagraphStyles = [${incStyles}];` : ''}
      JSON.stringify({ name: "${escName}", created: true });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async generate(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      styleName: z.string(),
      pageIndex: z.number().int().min(0),
      bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }).optional(),
      title: z.string().optional(),
      layerIndex: z.number().int().min(0).optional(),
    }).parse(args as Record<string, unknown>);

    const escStyle = this.escape(params.styleName);
    const escTitle = params.title ? this.escape(params.title) : '';
    const boundsStr = params.bounds
      ? `tf.geometricBounds = [${params.bounds.top}, ${params.bounds.left}, ${params.bounds.bottom}, ${params.bounds.right}];`
      : '';

    const code = `
      var doc = app.activeDocument;
      var tocStyle = doc.tocStyles.item("${escStyle}");
      var page = doc.pages[${params.pageIndex}];
      var tf = page.textFrames.add();
      ${params.title ? `tf.contents = "${escTitle}";` : ''}
      ${boundsStr}
      ${params.layerIndex !== undefined ? `tf.itemLayer = doc.layers[${params.layerIndex}];` : ''}
      doc.generateTOC(tocStyle, tf, true);
      JSON.stringify({ pageIndex: ${params.pageIndex}, storyIndex: tf.index });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listStyles(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var doc = app.activeDocument;
      var result = [];
      for (var i = 0; i < doc.tocStyles.length; i++) {
        var s = doc.tocStyles[i];
        var incStyles = [];
        try {
          for (var j = 0; j < s.includeParagraphStyles.length; j++) {
            incStyles.push(s.includeParagraphStyles[j]);
          }
        } catch(e) {}
        result.push({
          name: s.name,
          title: s.title,
          entryStyle: s.entryStyle,
          includeParagraphStyles: incStyles
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async update(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      styleName: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const escStyle = params.styleName ? this.escape(params.styleName) : '';

    const code = `
      var doc = app.activeDocument;
      var story = doc.stories[${params.storyIndex}];
      var tf = story.textContainers[0];
      var tocStyle = ${params.styleName ? `doc.tocStyles.item("${escStyle}")` : 'doc.tocStyles[0]'};
      doc.generateTOC(tocStyle, tf, true);
      JSON.stringify({ updated: true, storyIndex: ${params.storyIndex} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
