import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class ResourcesHandler implements IHandler {
  public readonly name = 'resources';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'resources_listLinks',
        description: 'List all document links with status and file path',
        inputSchema: {},
        handler: compose(withLogging('resources_listLinks'), withErrorHandling())(this.listLinks.bind(this)),
      },
      {
        name: 'resources_updateLink',
        description: 'Update/relink a specific link by index to a new file',
        inputSchema: {
          linkIndex: z.number().int().min(0),
          newFilePath: z.string().min(1),
        },
        handler: compose(withLogging('resources_updateLink'), withErrorHandling())(this.updateLink.bind(this)),
      },
      {
        name: 'resources_updateAllLinks',
        description: 'Re-establish all broken/modified links',
        inputSchema: {},
        handler: compose(withLogging('resources_updateAllLinks'), withErrorHandling())(this.updateAllLinks.bind(this)),
      },
      {
        name: 'resources_embedLink',
        description: 'Embed a linked file into the document',
        inputSchema: { linkIndex: z.number().int().min(0) },
        handler: compose(withLogging('resources_embedLink'), withErrorHandling())(this.embedLink.bind(this)),
      },
      {
        name: 'resources_unembedLink',
        description: 'Unembed a file and save as linked resource',
        inputSchema: {
          linkIndex: z.number().int().min(0),
          filePath: z.string().min(1),
        },
        handler: compose(withLogging('resources_unembedLink'), withErrorHandling())(this.unembedLink.bind(this)),
      },
      {
        name: 'resources_getLinkInfo',
        description: 'Get detailed status for a specific link',
        inputSchema: { linkIndex: z.number().int().min(0) },
        handler: compose(withLogging('resources_getLinkInfo'), withErrorHandling())(this.getLinkInfo.bind(this)),
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

  private async listLinks(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var links = app.activeDocument.links;
      var result = [];
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        result.push({
          index: i,
          name: l.name,
          filePath: l.filePath,
          status: l.status,
          embedded: l.embedded
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async updateLink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ linkIndex: z.number().int().min(0), newFilePath: z.string() }).parse(args as Record<string, unknown>);
    const escPath = this.escape(params.newFilePath);
    const code = `
      var link = app.activeDocument.links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      link.relink(File("${escPath}"));
      JSON.stringify({ name: link.name, status: link.status, filePath: link.filePath });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async updateAllLinks(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      app.activeDocument.links.everyItem().relink();
      "all links updated";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async embedLink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ linkIndex: z.number().int().min(0) }).parse(args as Record<string, unknown>);
    const code = `
      var link = app.activeDocument.links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      link.embed();
      JSON.stringify({ name: link.name, embedded: true });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async unembedLink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ linkIndex: z.number().int().min(0), filePath: z.string() }).parse(args as Record<string, unknown>);
    const escPath = this.escape(params.filePath);
    const code = `
      var link = app.activeDocument.links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      link.unembed(File("${escPath}"));
      JSON.stringify({ name: link.name, filePath: "${escPath}", embedded: false });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getLinkInfo(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ linkIndex: z.number().int().min(0) }).parse(args as Record<string, unknown>);
    const code = `
      var link = app.activeDocument.links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      JSON.stringify({
        name: link.name,
        filePath: link.filePath,
        status: link.status,
        embedded: link.embedded,
        size: link.size
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
