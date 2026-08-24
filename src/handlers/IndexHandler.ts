import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class IndexHandler implements IHandler {
  public readonly name = 'index';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'index_addEntry',
        description: 'Add an index entry for the current selection',
        inputSchema: {
          topic: z.string(),
          subTopic: z.string().optional(),
          pageRange: z.enum(['single', 'toNextStyle', 'overNext', 'nextPages']).optional().default('single'),
          pageReferenceType: z.enum(['bold', 'italic', 'regular']).optional().default('regular'),
          sortBy: z.string().optional(),
        },
        handler: compose(withLogging('index_addEntry'), withErrorHandling())(this.addEntry.bind(this)),
      },
      {
        name: 'index_generate',
        description: 'Generate the index on a specified page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }).optional(),
          title: z.string().optional(),
          includeBookDocuments: z.boolean().optional().default(false),
        },
        handler: compose(withLogging('index_generate'), withErrorHandling())(this.generate.bind(this)),
      },
      {
        name: 'index_listTopics',
        description: 'List all index topics in the active document',
        inputSchema: {},
        handler: compose(withLogging('index_listTopics'), withErrorHandling())(this.listTopics.bind(this)),
      },
      {
        name: 'index_createTopic',
        description: 'Create a new index topic',
        inputSchema: {
          name: z.string(),
          parent: z.string().optional(),
        },
        handler: compose(withLogging('index_createTopic'), withErrorHandling())(this.createTopic.bind(this)),
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

  private async addEntry(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      topic: z.string(),
      subTopic: z.string().optional(),
      pageRange: z.enum(['single', 'toNextStyle', 'overNext', 'nextPages']).optional().default('single'),
      pageReferenceType: z.enum(['bold', 'italic', 'regular']).optional().default('regular'),
      sortBy: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const escTopic = this.escape(params.topic);
    const escSortBy = params.sortBy ? this.escape(params.sortBy) : '';

    const pageRefMap: Record<string, string> = {
      bold: 'PageReferenceType.BOLD_PAGE_REFERENCE',
      italic: 'PageReferenceType.ITALIC_PAGE_REFERENCE',
      regular: 'PageReferenceType.REGULAR_PAGE_REFERENCE',
    };

    const code = `
      var doc = app.activeDocument;
      var idx;
      if (doc.indexes.length > 0) { idx = doc.indexes[0]; }
      else { idx = doc.indexes.add(); }
      var topicName = "${escTopic}"${params.subTopic ? ' + ":" + "${escSubTopic}"' : ''};
      var topic = idx.topics.item(topicName);
      if (!topic.isValid) {
        topic = idx.topics.add({ name: topicName });
      }
      ${params.sortBy ? `topic.sortBy = "${escSortBy}";` : ''}
      var sel = doc.selection;
      if (sel.length > 0) {
        var refType = ${pageRefMap[params.pageReferenceType]};
        idx.createReference(sel[0], topic, { pageReferenceType: refType });
      }
      JSON.stringify({ topic: topicName, created: true });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async generate(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }).optional(),
      title: z.string().optional(),
      includeBookDocuments: z.boolean().optional().default(false),
    }).parse(args as Record<string, unknown>);

    const escTitle = params.title ? this.escape(params.title) : '';
    const boundsStr = params.bounds
      ? `tf.geometricBounds = [${params.bounds.top}, ${params.bounds.left}, ${params.bounds.bottom}, ${params.bounds.right}];`
      : '';

    const code = `
      var doc = app.activeDocument;
      if (doc.indexes.length === 0) { JSON.stringify({ error: "No index exists" }); }
      else {
        var page = doc.pages[${params.pageIndex}];
        var tf = page.textFrames.add();
        ${boundsStr}
        ${params.title ? `tf.contents = "${escTitle}";` : ''}
        doc.indexes[0].generate(tf);
        JSON.stringify({ generated: true, pageIndex: ${params.pageIndex} });
      }
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listTopics(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var doc = app.activeDocument;
      if (doc.indexes.length === 0) { JSON.stringify([]); }
      else {
        var idx = doc.indexes[0];
        var topics = idx.topics;
        var result = [];
        for (var i = 0; i < topics.length; i++) {
          result.push({
            name: topics[i].name,
            pageReferenceCount: topics[i].pageReferences.length,
            sortBy: topics[i].sortBy
          });
        }
        JSON.stringify(result);
      }
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async createTopic(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      name: z.string(),
      parent: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.name);
    const fullName = params.parent ? `${this.escape(params.parent)}:${escName}` : escName;

    const code = `
      var doc = app.activeDocument;
      var idx;
      if (doc.indexes.length > 0) { idx = doc.indexes[0]; }
      else { idx = doc.indexes.add(); }
      var topic = idx.topics.add({ name: "${fullName}" });
      JSON.stringify({ name: "${fullName}", created: true });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
