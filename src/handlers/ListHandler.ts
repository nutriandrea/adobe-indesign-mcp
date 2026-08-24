import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class ListHandler implements IHandler {
  public readonly name = 'list';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'list_define',
        description: 'Define a new numbered or bulleted list',
        inputSchema: {
          name: z.string().min(1),
          type: z.enum(['bulleted', 'numbered']),
          continueNumbering: z.boolean().optional().default(true),
        },
        handler: compose(withLogging('list_define'), withErrorHandling())(this.define.bind(this)),
      },
      {
        name: 'list_applyToParagraph',
        description: 'Apply a list to a specific paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          listName: z.string().min(1),
          level: z.number().int().min(1).optional().default(1),
        },
        handler: compose(withLogging('list_applyToParagraph'), withErrorHandling())(this.applyToParagraph.bind(this)),
      },
      {
        name: 'list_applyToSelection',
        description: 'Apply a list to the current text selection',
        inputSchema: {
          listName: z.string().min(1),
          level: z.number().int().min(1).optional().default(1),
        },
        handler: compose(withLogging('list_applyToSelection'), withErrorHandling())(this.applyToSelection.bind(this)),
      },
      {
        name: 'list_removeFromParagraph',
        description: 'Remove list formatting from a paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('list_removeFromParagraph'), withErrorHandling())(this.removeFromParagraph.bind(this)),
      },
      {
        name: 'list_list',
        description: 'List all defined lists in the document',
        inputSchema: {},
        handler: compose(withLogging('list_list'), withErrorHandling())(this.list.bind(this)),
      },
      {
        name: 'list_restartNumbering',
        description: 'Restart numbering at a specific paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          startNumber: z.number().int().min(1),
        },
        handler: compose(withLogging('list_restartNumbering'), withErrorHandling())(this.restartNumbering.bind(this)),
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

  private async define(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      name: z.string().min(1),
      type: z.enum(['bulleted', 'numbered']),
      continueNumbering: z.boolean().optional().default(true),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.name);
    const listType = params.type === 'numbered' ? 'ListType.NUMBERED_LIST' : 'ListType.BULLET_LIST';

    const code = `
      var doc = app.activeDocument;
      var list = doc.lists.add({name: "${escName}", listType: ${listType}});
      JSON.stringify({action: 'defineList', name: "${escName}", type: "${params.type}"});
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyToParagraph(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      listName: z.string().min(1),
      level: z.number().int().min(1).optional().default(1),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.listName);

    const code = `
      var doc = app.activeDocument;
      var paragraph = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      var list = doc.lists.item("${escName}");
      paragraph.appliedList = list;
      paragraph.listLevel = ${params.level};
      JSON.stringify({action: 'applyList', name: "${escName}", level: ${params.level}});
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyToSelection(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      listName: z.string().min(1),
      level: z.number().int().min(1).optional().default(1),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.listName);

    const code = `
      var doc = app.activeDocument;
      if (app.selection.length === 0) { throw new Error("No active selection"); }
      var sel = app.selection[0];
      var list = doc.lists.item("${escName}");
      if (sel.paragraphs) {
        for (var i = 0; i < sel.paragraphs.length; i++) {
          sel.paragraphs[i].appliedList = list;
          sel.paragraphs[i].listLevel = ${params.level};
        }
      }
      JSON.stringify({action: 'applyListToSelection', name: "${escName}", level: ${params.level}});
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async removeFromParagraph(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var paragraph = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      paragraph.appliedList = NothingEnum.NOTHING;
      paragraph.listLevel = 1;
      JSON.stringify({action: 'removeList', pageIndex: ${params.pageIndex}, frameIndex: ${params.frameIndex}, paragraphIndex: ${params.paragraphIndex}});
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async list(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var doc = app.activeDocument;
      var lists = doc.lists;
      var result = [];
      for (var i = 0; i < lists.length; i++) {
        result.push({name: lists[i].name, type: lists[i].listType});
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async restartNumbering(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      startNumber: z.number().int().min(1),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var paragraph = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      paragraph.numberingRestart = true;
      paragraph.numberingStartAt = ${params.startNumber};
      JSON.stringify({action: 'restartNumbering', pageIndex: ${params.pageIndex}, frameIndex: ${params.frameIndex}, paragraphIndex: ${params.paragraphIndex}, startNumber: ${params.startNumber}});
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
