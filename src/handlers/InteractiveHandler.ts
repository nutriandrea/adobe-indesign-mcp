import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class InteractiveHandler implements IHandler {
  public readonly name = 'interactive';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'interactive_listHyperlinks',
        description: 'List all hyperlinks in the active document',
        inputSchema: {},
        handler: compose(withLogging('interactive_listHyperlinks'), withErrorHandling())(this.listHyperlinks.bind(this)),
      },
      {
        name: 'interactive_addHyperlink',
        description: 'Add a hyperlink to a text selection or page item',
        inputSchema: {
          name: z.string().min(1),
          url: z.string().url(),
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('interactive_addHyperlink'), withErrorHandling())(this.addHyperlink.bind(this)),
      },
      {
        name: 'interactive_deleteHyperlink',
        description: 'Delete a hyperlink by index',
        inputSchema: { index: z.number().int().min(0) },
        handler: compose(withLogging('interactive_deleteHyperlink'), withErrorHandling())(this.deleteHyperlink.bind(this)),
      },
      {
        name: 'interactive_listButtons',
        description: 'List all buttons in the active document',
        inputSchema: {},
        handler: compose(withLogging('interactive_listButtons'), withErrorHandling())(this.listButtons.bind(this)),
      },
      {
        name: 'interactive_listAnchors',
        description: 'List all cross-reference anchors in the active document',
        inputSchema: {},
        handler: compose(withLogging('interactive_listAnchors'), withErrorHandling())(this.listAnchors.bind(this)),
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

  private async listHyperlinks(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var result = [];
      var hyperlinks = app.activeDocument.hyperlinks;
      for (var i = 0; i < hyperlinks.length; i++) {
        var h = hyperlinks[i];
        result.push({
          index: i,
          name: h.name,
          url: h.destination ? h.destination.destinationURL : ''
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async addHyperlink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      name: z.string(),
      url: z.string(),
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);
    const escUrl = this.escape(params.url);
    const code = `
      var dest = app.activeDocument.hyperlinkURLDestinations.add("${escUrl}");
      var src = app.activeDocument.pages[${params.pageIndex}].pageItems[${params.itemIndex}];
      var link = app.activeDocument.hyperlinks.add(src, dest, "${escName}");
      JSON.stringify({ name: link.name, url: "${escUrl}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async deleteHyperlink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ index: z.number().int().min(0) }).parse(args as Record<string, unknown>);
    const code = `
      var link = app.activeDocument.hyperlinks[${params.index}];
      if (!link.isValid) { throw new Error("Hyperlink not found"); }
      link.remove();
      "deleted";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listButtons(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var result = [];
      var buttons = app.activeDocument.buttons;
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        result.push({ index: i, name: b.name, id: b.id, visible: b.visible });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listAnchors(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var result = [];
      var anchors = app.activeDocument.crossReferenceSources;
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        result.push({ index: i, name: a.name });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
