import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class GrepHandler implements IHandler {
  public readonly name = 'grep';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'grep_find',
        description: 'Find text using GREP pattern in the active document',
        inputSchema: {
          grepWhat: z.string(),
          scope: z.enum(['document', 'story', 'selection']).default('document'),
          includeFootnotes: z.boolean().optional().default(false),
          includeMasterPages: z.boolean().optional().default(false),
        },
        handler: compose(withLogging('grep_find'), withErrorHandling())(this.grepFind.bind(this)),
      },
      {
        name: 'grep_replace',
        description: 'Find and replace text using GREP pattern',
        inputSchema: {
          grepWhat: z.string(),
          replaceWith: z.string(),
          scope: z.enum(['document', 'story', 'selection']).default('document'),
        },
        handler: compose(withLogging('grep_replace'), withErrorHandling())(this.grepReplace.bind(this)),
      },
      {
        name: 'grep_findFormat',
        description: 'Find text with specific formatting',
        inputSchema: {
          findWhat: z.string(),
          format: z.object({
            font: z.string().optional(),
            size: z.number().optional(),
            style: z.string().optional(),
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            color: z.string().optional(),
            allCaps: z.boolean().optional(),
          }).optional(),
          scope: z.enum(['document', 'story', 'selection']).default('document'),
        },
        handler: compose(withLogging('grep_findFormat'), withErrorHandling())(this.findFormat.bind(this)),
      },
      {
        name: 'grep_replaceFormat',
        description: 'Find and replace text while changing formatting',
        inputSchema: {
          findWhat: z.string(),
          replaceWith: z.string(),
          format: z.object({
            font: z.string().optional(),
            size: z.number().optional(),
            style: z.string().optional(),
            bold: z.boolean().optional(),
            italic: z.boolean().optional(),
            color: z.string().optional(),
            allCaps: z.boolean().optional(),
          }).optional(),
        },
        handler: compose(withLogging('grep_replaceFormat'), withErrorHandling())(this.replaceFormat.bind(this)),
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

  private async grepFind(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      grepWhat: z.string(),
      scope: z.enum(['document', 'story', 'selection']).default('document'),
      includeFootnotes: z.boolean().optional().default(false),
      includeMasterPages: z.boolean().optional().default(false),
    }).parse(args as Record<string, unknown>);

    const escFind = this.escape(params.grepWhat);

    const code = `
      app.findGrepPreferences = NothingEnum.nothing;
      app.findGrepPreferences.findWhat = "${escFind}";
      app.findGrepPreferences.includeFootnotes = ${params.includeFootnotes};
      app.findGrepPreferences.includeMasterPages = ${params.includeMasterPages};
      var found = app.activeDocument.findGrep();
      var result = [];
      var limit = Math.min(found.length, 100);
      for (var i = 0; i < limit; i++) {
        result.push({
          index: i,
          text: found[i].contents.substring(0, 200),
          storyIndex: found[i].parentStory.index
        });
      }
      app.findGrepPreferences = NothingEnum.nothing;
      JSON.stringify({ totalFound: found.length, matches: result });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async grepReplace(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      grepWhat: z.string(),
      replaceWith: z.string(),
      scope: z.enum(['document', 'story', 'selection']).default('document'),
    }).parse(args as Record<string, unknown>);

    const escFind = this.escape(params.grepWhat);
    const escReplace = this.escape(params.replaceWith);

    const code = `
      app.findGrepPreferences = NothingEnum.nothing;
      app.changeGrepPreferences = NothingEnum.nothing;
      app.findGrepPreferences.findWhat = "${escFind}";
      app.changeGrepPreferences.changeTo = "${escReplace}";
      var changed = app.activeDocument.changeGrep();
      app.findGrepPreferences = NothingEnum.nothing;
      app.changeGrepPreferences = NothingEnum.nothing;
      JSON.stringify({ occurrencesChanged: changed.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async findFormat(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      findWhat: z.string(),
      format: z.object({
        font: z.string().optional(),
        size: z.number().optional(),
        style: z.string().optional(),
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        color: z.string().optional(),
        allCaps: z.boolean().optional(),
      }).optional(),
      scope: z.enum(['document', 'story', 'selection']).default('document'),
    }).parse(args as Record<string, unknown>);

    const escFind = this.escape(params.findWhat);
    const fmt = params.format;

    let formatLines = '';
    if (fmt) {
      if (fmt.font) formatLines += `app.findTextPreferences.appliedFont = "${this.escape(fmt.font)}";\n`;
      if (fmt.size !== undefined) formatLines += `app.findTextPreferences.pointSize = ${fmt.size};\n`;
      if (fmt.bold !== undefined) formatLines += `app.findTextPreferences.fontStyle = ${fmt.bold ? '"Bold"' : '"Regular"'};\n`;
      if (fmt.italic !== undefined) formatLines += `app.findTextPreferences.fontStyle = "${fmt.italic ? 'Italic' : 'Regular'}";\n`;
      if (fmt.color) formatLines += `app.findTextPreferences.fillColor = doc.swatches.item("${this.escape(fmt.color)}");\n`;
      if (fmt.allCaps !== undefined) formatLines += `app.findTextPreferences.capitalization = ${fmt.allCaps ? 'Capitalization.ALL_CAPS' : 'Capitalization.NORMAL'};\n`;
    }

    const code = `
      app.findTextPreferences = NothingEnum.nothing;
      app.findTextPreferences.findWhat = "${escFind}";
      ${formatLines}
      var found = app.activeDocument.findText();
      var result = [];
      var limit = Math.min(found.length, 100);
      for (var i = 0; i < limit; i++) {
        result.push({
          index: i,
          text: found[i].contents.substring(0, 200),
          storyIndex: found[i].parentStory.index
        });
      }
      app.findTextPreferences = NothingEnum.nothing;
      JSON.stringify({ totalFound: found.length, matches: result });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async replaceFormat(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      findWhat: z.string(),
      replaceWith: z.string(),
      format: z.object({
        font: z.string().optional(),
        size: z.number().optional(),
        style: z.string().optional(),
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        color: z.string().optional(),
        allCaps: z.boolean().optional(),
      }).optional(),
    }).parse(args as Record<string, unknown>);

    const escFind = this.escape(params.findWhat);
    const escReplace = this.escape(params.replaceWith);
    const fmt = params.format;

    let formatLines = '';
    if (fmt) {
      if (fmt.font) formatLines += `app.changeTextPreferences.appliedFont = "${this.escape(fmt.font)}";\n`;
      if (fmt.size !== undefined) formatLines += `app.changeTextPreferences.pointSize = ${fmt.size};\n`;
      if (fmt.color) formatLines += `app.changeTextPreferences.fillColor = doc.swatches.item("${this.escape(fmt.color)}");\n`;
      if (fmt.allCaps !== undefined) formatLines += `app.changeTextPreferences.capitalization = ${fmt.allCaps ? 'Capitalization.ALL_CAPS' : 'Capitalization.NORMAL'};\n`;
    }

    const code = `
      app.findTextPreferences = NothingEnum.nothing;
      app.changeTextPreferences = NothingEnum.nothing;
      app.findTextPreferences.findWhat = "${escFind}";
      app.changeTextPreferences.changeTo = "${escReplace}";
      ${formatLines}
      var changed = app.activeDocument.changeText();
      app.findTextPreferences = NothingEnum.nothing;
      app.changeTextPreferences = NothingEnum.nothing;
      JSON.stringify({ occurrencesChanged: changed.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
