import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export class ColorHandler implements IHandler {
  public readonly name = 'color';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'color_swatch_create',
        description: 'Create a new color swatch',
        inputSchema: {
          name: z.string(),
          model: z.enum(['cmyk', 'rgb', 'lab', 'spot']),
          cyan: z.number().min(0).max(100).default(0),
          magenta: z.number().min(0).max(100).default(0),
          yellow: z.number().min(0).max(100).default(0),
          black: z.number().min(0).max(100).default(100),
          red: z.number().min(0).max(255).default(0),
          green: z.number().min(0).max(255).default(0),
          blue: z.number().min(0).max(255).default(0),
          colorType: z.enum(['process', 'spot']).default('process'),
        },
        handler: compose(withLogging('color_swatch_create'), withErrorHandling())(this.createSwatch.bind(this)),
      },
      {
        name: 'color_swatch_list',
        description: 'List all color swatches in the document',
        inputSchema: {},
        handler: compose(withLogging('color_swatch_list'), withErrorHandling())(this.listSwatches.bind(this)),
      },
      {
        name: 'color_swatch_delete',
        description: 'Delete a color swatch by name',
        inputSchema: {
          name: z.string(),
        },
        handler: compose(withLogging('color_swatch_delete'), withErrorHandling())(this.deleteSwatch.bind(this)),
      },
      {
        name: 'color_gradient_create',
        description: 'Create a gradient swatch',
        inputSchema: {
          name: z.string(),
          type: z.enum(['linear', 'radial']).default('linear'),
          stops: z.array(z.object({
            color: z.string(),
            position: z.number().min(0).max(100),
          })).min(2).max(10),
        },
        handler: compose(withLogging('color_gradient_create'), withErrorHandling())(this.createGradient.bind(this)),
      },
      {
        name: 'color_apply',
        description: 'Apply a color swatch to selected item (fill or stroke)',
        inputSchema: {
          swatchName: z.string(),
          target: z.enum(['fill', 'stroke', 'both']).default('fill'),
        },
        handler: compose(withLogging('color_apply'), withErrorHandling())(this.applyColor.bind(this)),
      },
      {
        name: 'color_ink_list',
        description: 'List all inks in the document',
        inputSchema: {},
        handler: compose(withLogging('color_ink_list'), withErrorHandling())(this.listInks.bind(this)),
      },
    ];
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
    }
  }

  private escape(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private async createSwatch(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      name: z.string(),
      model: z.enum(['cmyk', 'rgb', 'lab', 'spot']),
      cyan: z.number().min(0).max(100).default(0),
      magenta: z.number().min(0).max(100).default(0),
      yellow: z.number().min(0).max(100).default(0),
      black: z.number().min(0).max(100).default(100),
      red: z.number().min(0).max(255).default(0),
      green: z.number().min(0).max(255).default(0),
      blue: z.number().min(0).max(255).default(0),
      colorType: z.enum(['process', 'spot']).default('process'),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.name);

    let colorCode = '';
    if (params.model === 'cmyk') {
      const spaceVal = params.colorType === 'spot' ? 'SpotColor' : 'ProcessColor';
      colorCode = `
        var color = doc.colors.add({name: "${escName}", colorModel: __PROCESS_COLOR_MODEL, model: __PROCESS_COLOR_MODEL, space: ColorSpace.${spaceVal}});
        color.colorValue = [${params.cyan}, ${params.magenta}, ${params.yellow}, ${params.black}];
      `;
    } else if (params.model === 'rgb') {
      colorCode = `
        var color = doc.colors.add({name: "${escName}", colorModel: __PROCESS_COLOR_MODEL, model: __PROCESS_COLOR_MODEL, space: ColorSpace.RGB});
        color.colorValue = [${params.red}, ${params.green}, ${params.blue}];
      `;
    } else {
      colorCode = `
        var color = doc.colors.add({name: "${escName}"});
      `;
    }

    const code = `
      var doc = app.activeDocument;
      ${colorCode}
      JSON.stringify({ name: color.name, model: "${params.model}", colorType: "${params.colorType}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listSwatches(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var doc = app.activeDocument;
      var result = [];
      for (var i = 0; i < doc.colors.length; i++) {
        var c = doc.colors[i];
        result.push({
          name: c.name,
          model: c.model,
          space: c.space,
          colorValue: c.colorValue,
          spot: c.spot || false
        });
      }
      for (var j = 0; j < doc.gradients.length; j++) {
        var g = doc.gradients[j];
        result.push({
          name: g.name,
          type: 'gradient',
          gradientType: g.type
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async deleteSwatch(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ name: z.string() }).parse(args as Record<string, unknown>);
    const escName = this.escape(params.name);

    const code = `
      var color = app.activeDocument.colors.item("${escName}");
      if (!color.isValid) { throw new Error("Swatch not found"); }
      color.remove();
      "deleted";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async createGradient(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      name: z.string(),
      type: z.enum(['linear', 'radial']).default('linear'),
      stops: z.array(z.object({
        color: z.string(),
        position: z.number().min(0).max(100),
      })).min(2).max(10),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.name);

    const code = `
      var doc = app.activeDocument;
      var grad = doc.gradients.add({name: "${escName}", type: GradientType.${params.type === 'linear' ? 'LINEAR' : 'RADIAL'}});
      JSON.stringify({ name: grad.name, type: "${params.type}", stops: ${params.stops.length} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyColor(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      swatchName: z.string(),
      target: z.enum(['fill', 'stroke', 'both']).default('fill'),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.swatchName);

    const code = `
      var sel = app.selection;
      if (sel.length === 0) { throw new Error("No selection"); }
      var swatch = app.activeDocument.colors.item("${escName}");
      if (!swatch.isValid) { throw new Error("Swatch not found"); }
      ${params.target === 'fill' || params.target === 'both' ? `sel[0].fillColor = swatch;` : ''}
      ${params.target === 'stroke' || params.target === 'both' ? `sel[0].strokeColor = swatch;` : ''}
      "applied";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listInks(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var inks = app.activeDocument.inks;
      var result = [];
      for (var i = 0; i < inks.length; i++) {
        result.push({
          name: inks[i].name,
          index: i,
          inkType: inks[i].inkType
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
