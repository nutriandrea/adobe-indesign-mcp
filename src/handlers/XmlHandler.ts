import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";
import { filePathError } from '../utils/security.js';

export class XmlHandler implements IHandler {
  public readonly name = 'xml';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'xml_listTags',
        description: 'List all XML tags in the active document',
        inputSchema: {},
        handler: compose(withLogging('xml_listTags'), withErrorHandling())(this.listTags.bind(this)),
      },
      {
        name: 'xml_addTag',
        description: 'Create a new XML tag',
        inputSchema: { name: z.string().min(1) },
        handler: compose(withLogging('xml_addTag'), withErrorHandling())(this.addTag.bind(this)),
      },
      {
        name: 'xml_deleteTag',
        description: 'Delete an XML tag by name',
        inputSchema: { name: z.string().min(1) },
        handler: compose(withLogging('xml_deleteTag'), withErrorHandling())(this.deleteTag.bind(this)),
      },
      {
        name: 'xml_tagPageItem',
        description: 'Apply an XML tag to a page item',
        inputSchema: {
          tagName: z.string().min(1),
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('xml_tagPageItem'), withErrorHandling())(this.tagPageItem.bind(this)),
      },
      {
        name: 'xml_export',
        description: 'Export document structure as XML',
        inputSchema: { filePath: z.string().min(1) },
        handler: compose(withLogging('xml_export'), withErrorHandling())(this.exportXml.bind(this)),
      },
      {
        name: 'xml_import',
        description: 'Import XML file into the document',
        inputSchema: { filePath: z.string().min(1) },
        handler: compose(withLogging('xml_import'), withErrorHandling())(this.importXml.bind(this)),
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

  private async listTags(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var tags = app.activeDocument.xmlTags;
      var result = [];
      for (var i = 0; i < tags.length; i++) {
        result.push({ name: tags[i].name, label: tags[i].label, tagColor: tags[i].tagColor });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async addTag(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ name: z.string() }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);
    const code = `
      var tag = app.activeDocument.xmlTags.add("${escName}");
      JSON.stringify({ name: tag.name });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async deleteTag(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ name: z.string() }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);
    const code = `
      var tag = app.activeDocument.xmlTags.item("${escName}");
      if (!tag.isValid) { throw new Error("XML tag '${escName}' not found"); }
      tag.remove();
      "deleted";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async tagPageItem(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      tagName: z.string(),
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);
    const escTag = this.escape(params.tagName);
    const code = `
      var tag = app.activeDocument.xmlTags.item("${escTag}");
      if (!tag.isValid) { throw new Error("XML tag '${escTag}' not found"); }
      app.activeDocument.pages[${params.pageIndex}].pageItems[${params.itemIndex}].markup(tag);
      JSON.stringify({ tagged: true, tag: "${escTag}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async exportXml(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ filePath: z.string() }).parse(args as Record<string, unknown>);
    const __pathError = filePathError(params.filePath);
    if (__pathError) {
      return {
        content: [{ type: 'text', text: `Invalid file path: ${__pathError}` }],
        isError: true,
      };
    }

    const escPath = this.escape(params.filePath);
    const code = `
      app.activeDocument.exportFile(ExportFormat.xmlType, File("${escPath}"));
      "exported";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async importXml(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ filePath: z.string() }).parse(args as Record<string, unknown>);
    const escPath = this.escape(params.filePath);
    const code = `
      app.activeDocument.importXML(File("${escPath}"));
      "imported";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
