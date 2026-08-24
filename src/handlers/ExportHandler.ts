import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { exportDocumentSchema, preflightSchema } from '../schemas/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class ExportHandler implements IHandler {
  public readonly name = 'export';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'export_document',
        description: 'Export the active document to a specified format (PDF, JPG, PNG, EPUB, HTML, package)',
        inputSchema: exportDocumentSchema.shape,
        handler: compose(withLogging('export_document'), withErrorHandling())(this.export.bind(this)),
      },
      {
        name: 'export_preflight',
        description: 'Run a preflight check on the active document',
        inputSchema: preflightSchema.shape,
        handler: compose(withLogging('export_preflight'), withErrorHandling())(this.preflight.bind(this)),
      },
      {
        name: 'export_getSwatches',
        description: 'Get all swatches (colors, gradients, tints) from the active document',
        inputSchema: {},
        handler: compose(withLogging('export_getSwatches'), withErrorHandling())(this.getSwatches.bind(this)),
      },
      {
        name: 'export_getFonts',
        description: 'Get all fonts used in the active document',
        inputSchema: {},
        handler: compose(withLogging('export_getFonts'), withErrorHandling())(this.getFonts.bind(this)),
      },
      {
        name: 'export_getMasterSpreads',
        description: 'List all master spreads in the active document',
        inputSchema: {},
        handler: compose(withLogging('export_getMasterSpreads'), withErrorHandling())(this.getMasterSpreads.bind(this)),
      },
      {
        name: 'export_getTables',
        description: 'List all tables in the active document',
        inputSchema: { pageIndex: z.number().int().min(0).optional() },
        handler: compose(withLogging('export_getTables'), withErrorHandling())(this.getTables.bind(this)),
      },
      {
        name: 'export_getXmlTags',
        description: 'List XML tags in the active document',
        inputSchema: {},
        handler: compose(withLogging('export_getXmlTags'), withErrorHandling())(this.getXmlTags.bind(this)),
      },
      {
        name: 'export_executeScript',
        description: 'Execute arbitrary ExtendScript code in InDesign',
        inputSchema: { code: z.string().min(1).max(50000) },
        handler: compose(withLogging('export_executeScript'), withErrorHandling())(this.executeCode.bind(this)),
      },
      {
        name: 'script_run',
        description: 'Execute arbitrary ExtendScript code with optional debug mode that returns line-level error stack traces',
        inputSchema: {
          code: z.string().min(1).max(100000),
          debug: z.boolean().optional().default(false).describe('Enable debug mode: wraps code in try/catch and returns ExtendScript error stack'),
          timeout: z.number().int().min(1000).max(300000).optional().describe('Custom timeout in ms'),
        },
        handler: compose(withLogging('script_run'), withErrorHandling())(this.scriptRun.bind(this)),
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

  private async export(args: unknown, _extra: any): Promise<ToolResult> {
    const params = exportDocumentSchema.parse(args);
    const formatMap: Record<string, string> = {
      pdf: 'ExportFormat.PDF_TYPE',
      epub: 'ExportFormat.EPUB',
      html: 'ExportFormat.HTML',
      jpg: 'ExportFormat.JPG',
      png: 'ExportFormat.PNG_FORMAT',
      package: 'ExportFormat.PACKAGE',
    };
    const exportFormat = formatMap[params.format];
    const filePath = params.filePath || `~/Desktop/export.${params.format}`;
    const escPath = this.escape(filePath);
    const code = `
      app.activeDocument.exportFile(${exportFormat}, File("${escPath}"), false${params.options ? ', ' + JSON.stringify(params.options) : ''});
      JSON.stringify({ exportedTo: "${escPath}", format: "${params.format}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async preflight(args: unknown, _extra: any): Promise<ToolResult> {
    const params = preflightSchema.parse(args);
    const profileStr = params.profile ? `"${this.escape(params.profile)}"` : 'undefined';
    const code = `
      var process = app.activeDocument.preflightProcesses.add(${profileStr});
      process.start();
      var result = { errors: process.errors, warnings: [], status: 'completed' };
      process.remove();
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getSwatches(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var swatches = app.activeDocument.swatches;
      var result = [];
      for (var i = 0; i < swatches.length; i++) {
        var sw = swatches[i];
        result.push({
          name: sw.name,
          type: sw.constructor.name,
          spot: sw.spot ? true : false
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getFonts(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var fonts = app.activeDocument.fonts;
      var result = [];
      for (var i = 0; i < fonts.length; i++) {
        result.push({
          name: fonts[i].name,
          fontFamily: fonts[i].fontFamily,
          fontStyle: fonts[i].fontStyle
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getMasterSpreads(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var masters = app.activeDocument.masterSpreads;
      var result = [];
      for (var i = 0; i < masters.length; i++) {
        var m = masters[i];
        result.push({
          name: m.name,
          pageCount: m.pages.length
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getTables(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ pageIndex: z.number().int().min(0).optional() }).parse(args as Record<string, unknown>);
    const scope = params.pageIndex !== undefined ? `app.activeDocument.pages[${params.pageIndex}]` : 'app.activeDocument';
    const code = `
      var tables = ${scope}.tables;
      var result = [];
      for (var i = 0; i < tables.length; i++) {
        var t = tables[i];
        result.push({
          index: i,
          rows: t.rows.length,
          columns: t.columns.length
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getXmlTags(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var tags = app.activeDocument.xmlTags;
      var result = [];
      for (var i = 0; i < tags.length; i++) {
        result.push({ name: tags[i].name, label: tags[i].label });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async executeCode(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ code: z.string().min(1).max(50000) }).parse(args as Record<string, unknown>);
    const response = await this.executor.execute(params.code);
    return formatResponse(response.result ?? '(no return value)');
  }

  private async scriptRun(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      code: z.string().min(1).max(100000),
      debug: z.boolean().optional().default(false),
      timeout: z.number().int().min(1000).max(300000).optional(),
    }).parse(args as Record<string, unknown>);
    const response = await this.executor.execute(params.code, params.timeout, params.debug);
    return formatResponse(response.result ?? '(no return value)');
  }
}
