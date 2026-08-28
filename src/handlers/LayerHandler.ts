import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class LayerHandler implements IHandler {
  public readonly name = 'layer';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'layer_create',
        description: 'Create a new layer in the active document',
        inputSchema: {
          name: z.string().default('Layer'),
          visible: z.boolean().default(true),
          locked: z.boolean().default(false),
          printable: z.boolean().default(true),
          guideLayer: z.boolean().default(false),
        },
        handler: compose(withLogging('layer_create'), withErrorHandling())(this.createLayer.bind(this)),
      },
      {
        name: 'layer_list',
        description: 'List all layers in the active document',
        inputSchema: {},
        handler: compose(withLogging('layer_list'), withErrorHandling())(this.listLayers.bind(this)),
      },
      {
        name: 'layer_reorder',
        description: 'Move a layer to a new position in the layer stack',
        inputSchema: {
          layerIndex: z.number().int().min(0),
          newIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('layer_reorder'), withErrorHandling())(this.reorderLayer.bind(this)),
      },
      {
        name: 'layer_setProperties',
        description: 'Set layer properties (visibility, lock, etc.)',
        inputSchema: {
          layerIndex: z.number().int().min(0),
          visible: z.boolean().optional(),
          locked: z.boolean().optional(),
          printable: z.boolean().optional(),
        },
        handler: compose(withLogging('layer_setProperties'), withErrorHandling())(this.setLayerProperties.bind(this)),
      },
      {
        name: 'layer_delete',
        description: 'Delete a layer',
        inputSchema: {
          layerIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('layer_delete'), withErrorHandling())(this.deleteLayer.bind(this)),
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

  private async createLayer(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      name: z.string().default('Layer'),
      visible: z.boolean().default(true),
      locked: z.boolean().default(false),
      printable: z.boolean().default(true),
      guideLayer: z.boolean().default(false),
    }).parse(args as Record<string, unknown>);

    const escName = this.escape(params.name);
    const code = `
      var layer = app.activeDocument.layers.add({name: "${escName}"});
      layer.visible = ${params.visible};
      layer.locked = ${params.locked};
      layer.printable = ${params.printable};
      JSON.stringify({ name: layer.name, index: layer.index });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async listLayers(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var layers = app.activeDocument.layers;
      var result = [];
      for (var i = 0; i < layers.length; i++) {
        result.push({
          name: layers[i].name,
          index: i,
          visible: layers[i].visible,
          locked: layers[i].locked,
          printable: layers[i].printable
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async reorderLayer(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      layerIndex: z.number().int().min(0),
      newIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var target = doc.layers[${params.newIndex}];
      doc.layers[${params.layerIndex}].move(LocationOptions.AT_BEFORE, target);
      JSON.stringify({ layerIndex: ${params.layerIndex}, newIndex: ${params.newIndex} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setLayerProperties(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      layerIndex: z.number().int().min(0),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      printable: z.boolean().optional(),
    }).parse(args as Record<string, unknown>);

    let setStr = '';
    if (params.visible !== undefined) setStr += `layer.visible = ${params.visible};\n`;
    if (params.locked !== undefined) setStr += `layer.locked = ${params.locked};\n`;
    if (params.printable !== undefined) setStr += `layer.printable = ${params.printable};\n`;

    const code = `
      var layer = app.activeDocument.layers[${params.layerIndex}];
      if (!layer) { throw new Error("Layer not found"); }
      ${setStr}
      JSON.stringify({ index: ${params.layerIndex}, visible: layer.visible, locked: layer.locked });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async deleteLayer(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      layerIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var layer = app.activeDocument.layers[${params.layerIndex}];
      if (!layer) { throw new Error("Layer not found"); }
      layer.remove();
      "deleted";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
