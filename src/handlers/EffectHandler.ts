import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class EffectHandler implements IHandler {
  public readonly name = 'effect';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'effect_applyDropShadow',
        description: 'Apply a drop shadow effect to an object',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          distance: z.number().min(0).optional().default(7),
          angle: z.number().min(-360).max(360).optional().default(135),
          blur: z.number().min(0).optional().default(5),
          opacity: z.number().min(0).max(100).optional().default(75),
          color: z.string().optional().default('Black'),
          mode: z.enum(['multiply', 'screen', 'normal']).optional().default('multiply'),
        },
        handler: compose(withLogging('effect_applyDropShadow'), withErrorHandling())(this.applyDropShadow.bind(this)),
      },
      {
        name: 'effect_applyFeather',
        description: 'Apply a feather effect to an object',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          type: z.enum(['basic', 'directional', 'gradient']).optional().default('basic'),
          width: z.number().min(0).optional().default(5),
          chamferWidth: z.number().min(0).optional().default(0),
          noise: z.number().min(0).max(100).optional().default(0),
        },
        handler: compose(withLogging('effect_applyFeather'), withErrorHandling())(this.applyFeather.bind(this)),
      },
      {
        name: 'effect_applyTransparency',
        description: 'Set transparency and blend mode for an object',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          opacity: z.number().min(0).max(100).optional().default(100),
          blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'colorDodge', 'colorBurn', 'hardLight', 'softLight', 'difference', 'exclusion']).optional().default('normal'),
          knockoutGroup: z.boolean().optional().default(false),
          isolatedBlending: z.boolean().optional().default(false),
        },
        handler: compose(withLogging('effect_applyTransparency'), withErrorHandling())(this.applyTransparency.bind(this)),
      },
      {
        name: 'effect_applyGradientFeather',
        description: 'Apply a gradient feather effect to an object',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          type: z.enum(['linear', 'radial']).optional().default('linear'),
          startPoint: z.object({ x: z.number(), y: z.number() }).optional(),
          endPoint: z.object({ x: z.number(), y: z.number() }).optional(),
          angle: z.number().min(-360).max(360).optional().default(0),
        },
        handler: compose(withLogging('effect_applyGradientFeather'), withErrorHandling())(this.applyGradientFeather.bind(this)),
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

  private async applyDropShadow(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      distance: z.number().min(0).optional().default(7),
      angle: z.number().min(-360).max(360).optional().default(135),
      blur: z.number().min(0).optional().default(5),
      opacity: z.number().min(0).max(100).optional().default(75),
      color: z.string().optional().default('Black'),
      mode: z.enum(['multiply', 'screen', 'normal']).optional().default('multiply'),
    }).parse(args as Record<string, unknown>);

    const escColor = this.escape(params.color);
    const blurModeMap: Record<string, string> = {
      multiply: 'BlurMode.MULTIPLY',
      screen: 'BlurMode.SCREEN',
      normal: 'BlurMode.NORMAL',
    };

    const code = `
      var doc = app.activeDocument;
      var item = doc.pages[${params.pageIndex}].allPageItems[${params.itemIndex}];
      var shadow = item.transparencySettings.dropShadowSettings;
      shadow.mode = true;
      shadow.distance = ${params.distance};
      shadow.angle = ${params.angle};
      shadow.blurRadius = ${params.blur};
      shadow.opacity = ${params.opacity};
      shadow.effectColor = doc.swatches.item("${escColor}");
      shadow.blurMode = ${blurModeMap[params.mode]};
      JSON.stringify({ effect: 'dropShadow', distance: ${params.distance}, angle: ${params.angle} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyFeather(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      type: z.enum(['basic', 'directional', 'gradient']).optional().default('basic'),
      width: z.number().min(0).optional().default(5),
      chamferWidth: z.number().min(0).optional().default(0),
      noise: z.number().min(0).max(100).optional().default(0),
    }).parse(args as Record<string, unknown>);

    const featherMap: Record<string, string> = {
      basic: 'FeatherMode.BASIC_FEATHER',
      directional: 'FeatherMode.DIRECTIONAL_FEATHER',
      gradient: 'FeatherMode.GRADIENT_FEATHER',
    };

    const code = `
      var doc = app.activeDocument;
      var item = doc.pages[${params.pageIndex}].allPageItems[${params.itemIndex}];
      item.featherMode = ${featherMap[params.type]};
      item.featherWidth = ${params.width};
      item.featherChamferWidth = ${params.chamferWidth};
      item.featherCornerType = FeatherCornerType.ROUNDED;
      item.featherNoise = ${params.noise};
      JSON.stringify({ effect: 'feather', type: "${params.type}", width: ${params.width} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyTransparency(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      opacity: z.number().min(0).max(100).optional().default(100),
      blendMode: z.enum(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'colorDodge', 'colorBurn', 'hardLight', 'softLight', 'difference', 'exclusion']).optional().default('normal'),
      knockoutGroup: z.boolean().optional().default(false),
      isolatedBlending: z.boolean().optional().default(false),
    }).parse(args as Record<string, unknown>);

    const blendMap: Record<string, string> = {
      normal: 'BlendMode.NORMAL',
      multiply: 'BlendMode.MULTIPLY',
      screen: 'BlendMode.SCREEN',
      overlay: 'BlendMode.OVERLAY',
      darken: 'BlendMode.DARKEN',
      lighten: 'BlendMode.LIGHTEN',
      colorDodge: 'BlendMode.COLOR_DODGE',
      colorBurn: 'BlendMode.COLOR_BURN',
      hardLight: 'BlendMode.HARD_LIGHT',
      softLight: 'BlendMode.SOFT_LIGHT',
      difference: 'BlendMode.DIFFERENCE',
      exclusion: 'BlendMode.EXCLUSION',
    };

    const code = `
      var doc = app.activeDocument;
      var item = doc.pages[${params.pageIndex}].allPageItems[${params.itemIndex}];
      item.transparencySettings.blendSettings.blendMode = ${blendMap[params.blendMode]};
      item.transparencySettings.blendSettings.opacity = ${params.opacity};
      item.transparencySettings.knockoutGroup = ${params.knockoutGroup};
      item.transparencySettings.isolatedBlending = ${params.isolatedBlending};
      JSON.stringify({ effect: 'transparency', opacity: ${params.opacity}, blendMode: "${params.blendMode}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyGradientFeather(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      type: z.enum(['linear', 'radial']).optional().default('linear'),
      startPoint: z.object({ x: z.number(), y: z.number() }).optional(),
      endPoint: z.object({ x: z.number(), y: z.number() }).optional(),
      angle: z.number().min(-360).max(360).optional().default(0),
    }).parse(args as Record<string, unknown>);

    const startStr = params.startPoint ? `${params.startPoint.x}, ${params.startPoint.y}` : '0, 0';
    const endStr = params.endPoint ? `${params.endPoint.x}, ${params.endPoint.y}` : '100, 0';

    const code = `
      var doc = app.activeDocument;
      var item = doc.pages[${params.pageIndex}].allPageItems[${params.itemIndex}];
      item.featherMode = FeatherMode.GRADIENT_FEATHER;
      var gf = item.gradientFeather;
      gf.type = ${params.type === 'linear' ? 'GradientType.LINEAR' : 'GradientType.RADIAL'};
      gf.startPoint = [${startStr}];
      gf.endPoint = [${endStr}];
      gf.angle = ${params.angle};
      JSON.stringify({ effect: 'gradientFeather', type: "${params.type}", angle: ${params.angle} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
