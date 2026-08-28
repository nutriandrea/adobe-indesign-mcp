import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class NoteHandler implements IHandler {
  public readonly name = 'note';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'note_addFootnote',
        description: 'Add a footnote to a specific paragraph in a story',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          text: z.string(),
          numberingType: z.enum(['decimal', 'lowerRoman', 'upperRoman', 'lowerAlpha', 'upperAlpha']).optional().default('decimal'),
          startingNumber: z.number().int().min(1).optional(),
          prefix: z.string().optional(),
          suffix: z.string().optional(),
        },
        handler: compose(withLogging('note_addFootnote'), withErrorHandling())(this.addFootnote.bind(this)),
      },
      {
        name: 'note_listFootnotes',
        description: 'List all footnotes in a story or the active document',
        inputSchema: {
          storyIndex: z.number().int().min(0).optional(),
        },
        handler: compose(withLogging('note_listFootnotes'), withErrorHandling())(this.listFootnotes.bind(this)),
      },
      {
        name: 'note_footnoteOptions',
        description: 'Set footnote options for the active document',
        inputSchema: {
          numberingType: z.enum(['decimal', 'lowerRoman', 'upperRoman', 'lowerAlpha', 'upperAlpha']).optional(),
          startingNumber: z.number().int().min(1).optional(),
          separator: z.string().optional(),
          prefix: z.string().optional(),
          suffix: z.string().optional(),
          layout: z.enum(['column', 'section']).optional(),
        },
        handler: compose(withLogging('note_footnoteOptions'), withErrorHandling())(this.footnoteOptions.bind(this)),
      },
      {
        name: 'note_addEndnote',
        description: 'Add an endnote to a story',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          text: z.string(),
          numberingType: z.enum(['decimal', 'lowerRoman', 'upperRoman', 'lowerAlpha', 'upperAlpha']).optional().default('decimal'),
        },
        handler: compose(withLogging('note_addEndnote'), withErrorHandling())(this.addEndnote.bind(this)),
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

  private async addFootnote(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      text: z.string(),
      numberingType: z.enum(['decimal', 'lowerRoman', 'upperRoman', 'lowerAlpha', 'upperAlpha']).optional().default('decimal'),
      startingNumber: z.number().int().min(1).optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const escText = this.escape(params.text);
    const escPrefix = params.prefix ? this.escape(params.prefix) : '';
    const escSuffix = params.suffix ? this.escape(params.suffix) : '';

    const code = `
      var doc = app.activeDocument;
      var story = doc.stories[${params.storyIndex}];
      var para = story.paragraphs[${params.paragraphIndex}];
      var fn = para.footnotes.add();
      fn.texts[0].contents = "${escText}";
      ${params.prefix ? `fn.prefix = "${escPrefix}";` : ''}
      ${params.suffix ? `fn.suffix = "${escSuffix}";` : ''}
      ${params.startingNumber !== undefined ? `fn.startingNumber = ${params.startingNumber};` : ''}
      JSON.stringify({ index: fn.index, text: "${escText}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listFootnotes(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0).optional(),
    }).parse(args as Record<string, unknown>);

    const scope = params.storyIndex !== undefined
      ? `doc.stories[${params.storyIndex}]`
      : 'doc';

    const code = `
      var doc = app.activeDocument;
      var scope = ${scope};
      var fns = scope.footnotes;
      var result = [];
      for (var i = 0; i < fns.length; i++) {
        result.push({
          index: i,
          text: fns[i].texts[0].contents,
          storyIndex: fns[i].parentStory.index,
          paragraphIndex: fns[i].parentParagraph.index
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async footnoteOptions(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      numberingType: z.enum(['decimal', 'lowerRoman', 'upperRoman', 'lowerAlpha', 'upperAlpha']).optional(),
      startingNumber: z.number().int().min(1).optional(),
      separator: z.string().optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      layout: z.enum(['column', 'section']).optional(),
    }).parse(args as Record<string, unknown>);

    const escSeparator = params.separator ? this.escape(params.separator) : '';
    const escPrefix = params.prefix ? this.escape(params.prefix) : '';
    const escSuffix = params.suffix ? this.escape(params.suffix) : '';

    const code = `
      var doc = app.activeDocument;
      var opts = doc.footnoteOptions;
      ${params.numberingType ? `opts.numberingStyle = FootnoteNumberingStyle.${params.numberingType.toUpperCase()}_FOOTNOTE_NUMBERING;` : ''}
      ${params.startingNumber !== undefined ? `opts.startingNumber = ${params.startingNumber};` : ''}
      ${params.separator ? `opts.separator = "${escSeparator}";` : ''}
      ${params.prefix ? `opts.prefix = "${escPrefix}";` : ''}
      ${params.suffix ? `opts.suffix = "${escSuffix}";` : ''}
      ${params.layout ? `opts.layout = ${params.layout === 'column' ? 'FootnoteLayout.COLUMN_FOOTNOTE_LAYOUT' : 'FootnoteLayout.SECTION_FOOTNOTE_LAYOUT'};` : ''}
      JSON.stringify({ updated: true });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async addEndnote(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      text: z.string(),
      numberingType: z.enum(['decimal', 'lowerRoman', 'upperRoman', 'lowerAlpha', 'upperAlpha']).optional().default('decimal'),
    }).parse(args as Record<string, unknown>);

    const escText = this.escape(params.text);

    const code = `
      var doc = app.activeDocument;
      var story = doc.stories[${params.storyIndex}];
      var en = story.endnotes.add();
      en.texts[0].contents = "${escText}";
      JSON.stringify({ index: en.index, text: "${escText}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
