import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";
import { filePathError } from '../utils/security.js';

export class BookHandler implements IHandler {
  public readonly name = 'book';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'book_list',
        description: 'List all open books in InDesign',
        inputSchema: {},
        handler: compose(withLogging('book_list'), withErrorHandling())(this.list.bind(this)),
      },
      {
        name: 'book_open',
        description: 'Open an InDesign book file (.indb)',
        inputSchema: { filePath: z.string().min(1) },
        handler: compose(withLogging('book_open'), withErrorHandling())(this.open.bind(this)),
      },
      {
        name: 'book_getDocuments',
        description: 'List all documents in a book',
        inputSchema: { bookIndex: z.number().int().min(0) },
        handler: compose(withLogging('book_getDocuments'), withErrorHandling())(this.getDocuments.bind(this)),
      },
      {
        name: 'book_synchronize',
        description: 'Synchronize book documents with the style source',
        inputSchema: { bookIndex: z.number().int().min(0) },
        handler: compose(withLogging('book_synchronize'), withErrorHandling())(this.synchronize.bind(this)),
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

  private async list(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var result = [];
      if (app.books.length === 0) { JSON.stringify(result); }
      for (var i = 0; i < app.books.length; i++) {
        var b = app.books[i];
        result.push({ index: i, name: b.name, fullName: b.fullName, documentCount: b.bookContents.length });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async open(args: unknown, _extra: any): Promise<ToolResult> {
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
      var book = app.open(File("${escPath}"));
      JSON.stringify({ name: book.name, documentCount: book.bookContents.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getDocuments(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ bookIndex: z.number().int().min(0) }).parse(args as Record<string, unknown>);
    const code = `
      var book = app.books[${params.bookIndex}];
      if (!book.isValid) { throw new Error("Book not found"); }
      var result = [];
      for (var i = 0; i < book.bookContents.length; i++) {
        var doc = book.bookContents[i];
        result.push({ index: i, name: doc.name, fullName: doc.fullName, styleSource: doc.styleSource });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async synchronize(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ bookIndex: z.number().int().min(0) }).parse(args as Record<string, unknown>);
    const code = `
      var book = app.books[${params.bookIndex}];
      if (!book.isValid) { throw new Error("Book not found"); }
      book.synchronize();
      "synchronized";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
