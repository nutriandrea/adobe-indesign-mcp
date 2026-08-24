import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class XrefHandler implements IHandler {
  public readonly name = 'xref';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'xref_create',
        description: 'Create a cross-reference in the active document',
        inputSchema: {
          sourceText: z.string(),
          targetType: z.enum(['paragraph', 'anchor', 'table', 'footnote', 'endnote']),
          targetName: z.string(),
          appliedFormat: z.string().optional().default('Full Paragraph & Page Number'),
        },
        handler: compose(withLogging('xref_create'), withErrorHandling())(this.create.bind(this)),
      },
      {
        name: 'xref_list',
        description: 'List all cross-references in the active document',
        inputSchema: {},
        handler: compose(withLogging('xref_list'), withErrorHandling())(this.list.bind(this)),
      },
      {
        name: 'xref_updateFormat',
        description: 'Update the format of a cross-reference',
        inputSchema: {
          index: z.number().int().min(0),
          appliedFormat: z.string(),
        },
        handler: compose(withLogging('xref_updateFormat'), withErrorHandling())(this.updateFormat.bind(this)),
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

  private async create(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      sourceText: z.string(),
      targetType: z.enum(['paragraph', 'anchor', 'table', 'footnote', 'endnote']),
      targetName: z.string(),
      appliedFormat: z.string().optional().default('Full Paragraph & Page Number'),
    }).parse(args as Record<string, unknown>);

    const escSource = this.escape(params.sourceText);
    const escFormat = this.escape(params.appliedFormat);

    const code = `
      var doc = app.activeDocument;
      var xref = doc.crossReferenceSources.add();
      xref.name = "${escSource}";
      var fmt = doc.crossReferenceFormats.item("${escFormat}");
      var source = doc.crossReferenceSources.item("${escSource}");
      JSON.stringify({ created: true, name: "${escSource}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async list(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var doc = app.activeDocument;
      var result = [];
      for (var i = 0; i < doc.crossReferenceSources.length; i++) {
        var src = doc.crossReferenceSources[i];
        result.push({
          index: i,
          name: src.name,
          source: src.name,
          format: src.appliedFormat ? src.appliedFormat.name : ''
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async updateFormat(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      index: z.number().int().min(0),
      appliedFormat: z.string(),
    }).parse(args as Record<string, unknown>);

    const escFormat = this.escape(params.appliedFormat);

    const code = `
      var doc = app.activeDocument;
      var src = doc.crossReferenceSources[${params.index}];
      src.appliedFormat = doc.crossReferenceFormats.item("${escFormat}");
      JSON.stringify({ updated: true, index: ${params.index}, format: "${escFormat}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
