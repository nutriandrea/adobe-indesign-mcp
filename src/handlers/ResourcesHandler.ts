import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../server/registerTool.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";
import { filePathError } from '../utils/security.js';

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
        description: 'Update every link whose source file changed, and report the ones that need an explicit relink',
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
        description: 'Unembed a file, copying it into a folder if one is given',
        inputSchema: {
          linkIndex: z.number().int().min(0),
          folderPath: z.string().min(1).optional().describe('Folder to copy the unembedded file into; omit to link back to the original source file'),
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
      registerTool(server, tool);
    }
  }

  private escape(str: string): string {
    return escapeExtendScriptString(str);
  }

  private async listLinks(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var links = __resolveDocument().links;
      var result = [];
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        result.push({
          index: i,
          name: l.name,
          filePath: l.filePath,
          status: __linkStatus(l),
          embedded: __isEmbedded(l)
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async updateLink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ linkIndex: z.number().int().min(0), newFilePath: z.string() }).parse(args as Record<string, unknown>);
    const __pathError = filePathError(params.newFilePath);
    if (__pathError) {
      return {
        content: [{ type: 'text', text: `Invalid file path: ${__pathError}` }],
        isError: true,
      };
    }

    const escPath = this.escape(params.newFilePath);
    const code = `
      var link = __resolveDocument().links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      link.relink(File("${escPath}"));
      JSON.stringify({ name: link.name, status: __linkStatus(link), filePath: link.filePath });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async updateAllLinks(_args: unknown, _extra: any): Promise<ToolResult> {
    // everyItem().relink() fails live: relink() requires a target path, and a
    // bulk call cannot invent one. Updating out-of-date links is safe and
    // useful; missing ones are reported so the caller can name a new path.
    const code = `
      var links = __resolveDocument().links;
      var updated = [];
      var missing = [];
      var inaccessible = [];
      var failed = [];
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var word = __linkStatus(link);
        if (word === 'link_out_of_date') {
          var problem = null;
          try { link.update(); } catch (e) { problem = e.message; }
          if (!problem && __linkStatus(link) === 'link_out_of_date') {
            problem = 'still out of date after update';
          }
          if (problem) { failed.push(link.name + ': ' + problem); } else { updated.push(link.name); }
        } else if (word === 'link_missing') {
          missing.push(link.name);
        } else if (word === 'link_inaccessible') {
          inaccessible.push(link.name);
        }
      }
      JSON.stringify({
        total: links.length,
        updated: updated,
        missing: missing,
        inaccessible: inaccessible,
        failed: failed
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async embedLink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ linkIndex: z.number().int().min(0) }).parse(args as Record<string, unknown>);
    const code = `
      var link = __resolveDocument().links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      link.unlink();
      JSON.stringify({
        name: link.name,
        embedded: __isEmbedded(link),
        status: __linkStatus(link)
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async unembedLink(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      linkIndex: z.number().int().min(0),
      folderPath: z.string().min(1).optional(),
    }).parse(args as Record<string, unknown>);

    // unembed() takes a Folder to copy the file into, not a file path: passing
    // a File made the call meaningless. With no folder it links back to the
    // original source, which is what most callers want.
    let unembedCall = 'link.unembed();';
    if (params.folderPath) {
      const __pathError = filePathError(params.folderPath);
      if (__pathError) {
        return {
          content: [{ type: 'text', text: `Invalid folder path: ${__pathError}` }],
          isError: true,
        };
      }
      unembedCall = `link.unembed(Folder("${this.escape(params.folderPath)}"));`;
    }

    const code = `
      var link = __resolveDocument().links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      ${unembedCall}
      JSON.stringify({
        name: link.name,
        filePath: link.filePath,
        embedded: __isEmbedded(link),
        status: __linkStatus(link)
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getLinkInfo(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ linkIndex: z.number().int().min(0) }).parse(args as Record<string, unknown>);
    const code = `
      var link = __resolveDocument().links[${params.linkIndex}];
      if (!link.isValid) { throw new Error("Link not found"); }
      JSON.stringify({
        name: link.name,
        filePath: link.filePath,
        status: __linkStatus(link),
        embedded: __isEmbedded(link),
        linkType: link.linkType,
        size: link.size
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
