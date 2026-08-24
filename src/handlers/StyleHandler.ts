import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class StyleHandler implements IHandler {
  public readonly name = 'style';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'style_listParagraph',
        description: 'List all paragraph styles in the active document',
        inputSchema: {},
        handler: compose(withLogging('style_listParagraph'), withErrorHandling())(this.listParagraph.bind(this)),
      },
      {
        name: 'style_listCharacter',
        description: 'List all character styles in the active document',
        inputSchema: {},
        handler: compose(withLogging('style_listCharacter'), withErrorHandling())(this.listCharacter.bind(this)),
      },
      {
        name: 'style_listObject',
        description: 'List all object styles in the active document',
        inputSchema: {},
        handler: compose(withLogging('style_listObject'), withErrorHandling())(this.listObject.bind(this)),
      },
      {
        name: 'style_createParagraph',
        description: 'Create a new paragraph style',
        inputSchema: {
          name: z.string(),
          basedOn: z.string().optional(),
          properties: z.record(z.unknown()).optional(),
        },
        handler: compose(withLogging('style_createParagraph'), withErrorHandling())(this.createParagraph.bind(this)),
      },
      {
        name: 'style_createCharacter',
        description: 'Create a new character style',
        inputSchema: {
          name: z.string(),
          basedOn: z.string().optional(),
          properties: z.record(z.unknown()).optional(),
        },
        handler: compose(withLogging('style_createCharacter'), withErrorHandling())(this.createCharacter.bind(this)),
      },
      {
        name: 'style_duplicate',
        description: 'Duplicate a style',
        inputSchema: {
          type: z.enum(['paragraph', 'character', 'object']),
          name: z.string(),
          newName: z.string(),
        },
        handler: compose(withLogging('style_duplicate'), withErrorHandling())(this.duplicate.bind(this)),
      },
      {
        name: 'style_delete',
        description: 'Delete a style',
        inputSchema: {
          type: z.enum(['paragraph', 'character', 'object']),
          name: z.string(),
        },
        handler: compose(withLogging('style_delete'), withErrorHandling())(this.delete.bind(this)),
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

  private async listParagraph(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var styles = app.activeDocument.paragraphStyles;
      var result = [];
      for (var i = 0; i < styles.length; i++) {
        result.push({
          name: styles[i].name,
          basedOn: styles[i].basedOn ? styles[i].basedOn.name : null,
          properties: {}
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listCharacter(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var styles = app.activeDocument.characterStyles;
      var result = [];
      for (var i = 0; i < styles.length; i++) {
        result.push({
          name: styles[i].name,
          basedOn: styles[i].basedOn ? styles[i].basedOn.name : null,
          properties: {}
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listObject(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var styles = app.activeDocument.objectStyles;
      var result = [];
      for (var i = 0; i < styles.length; i++) {
        result.push({
          name: styles[i].name,
          basedOn: styles[i].basedOn ? styles[i].basedOn.name : null,
          properties: {}
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async createParagraph(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ name: z.string(), basedOn: z.string().optional(), properties: z.record(z.unknown()).optional() }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);
    const basedOnCode = params.basedOn ? `, {basedOn: app.activeDocument.paragraphStyles.item("${this.escape(params.basedOn)}")}` : '';
    const code = `app.activeDocument.paragraphStyles.add({name: "${escName}"${basedOnCode}}); "created"`;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async createCharacter(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ name: z.string(), basedOn: z.string().optional(), properties: z.record(z.unknown()).optional() }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);
    const basedOnCode = params.basedOn ? `, {basedOn: app.activeDocument.characterStyles.item("${this.escape(params.basedOn)}")}` : '';
    const code = `app.activeDocument.characterStyles.add({name: "${escName}"${basedOnCode}}); "created"`;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async duplicate(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ type: z.enum(['paragraph', 'character', 'object']), name: z.string(), newName: z.string() }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);
    const escNew = this.escape(params.newName);
    const styleCollection = params.type === 'paragraph' ? 'paragraphStyles' : params.type === 'character' ? 'characterStyles' : 'objectStyles';
    const code = `
      var style = app.activeDocument.${styleCollection}.item("${escName}").duplicate();
      style.name = "${escNew}";
      JSON.stringify({ name: style.name });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async delete(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ type: z.enum(['paragraph', 'character', 'object']), name: z.string() }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);
    const styleCollection = params.type === 'paragraph' ? 'paragraphStyles' : params.type === 'character' ? 'characterStyles' : 'objectStyles';
    const code = `app.activeDocument.${styleCollection}.item("${escName}").remove(); "deleted"`;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
