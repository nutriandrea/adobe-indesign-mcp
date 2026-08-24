import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class ShapeHandler implements IHandler {
  public readonly name = 'shape';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'shape_rectangle_create',
        description: 'Create a rectangle on a page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
          cornerRadius: z.number().min(0).optional(),
          fillColor: z.string().optional(),
          strokeColor: z.string().optional(),
          strokeWeight: z.number().min(0).default(0),
        },
        handler: compose(withLogging('shape_rectangle_create'), withErrorHandling())(this.createRectangle.bind(this)),
      },
      {
        name: 'shape_ellipse_create',
        description: 'Create an ellipse or circle on a page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
          fillColor: z.string().optional(),
          strokeColor: z.string().optional(),
          strokeWeight: z.number().min(0).default(0),
        },
        handler: compose(withLogging('shape_ellipse_create'), withErrorHandling())(this.createEllipse.bind(this)),
      },
      {
        name: 'shape_polygon_create',
        description: 'Create a polygon on a page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
          numberOfSides: z.number().int().min(3).max(100).default(6),
          fillColor: z.string().optional(),
          strokeColor: z.string().optional(),
          strokeWeight: z.number().min(0).default(0),
        },
        handler: compose(withLogging('shape_polygon_create'), withErrorHandling())(this.createPolygon.bind(this)),
      },
      {
        name: 'shape_line_create',
        description: 'Create a graphic line on a page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
          strokeColor: z.string().optional(),
          strokeWeight: z.number().min(0).default(1),
        },
        handler: compose(withLogging('shape_line_create'), withErrorHandling())(this.createLine.bind(this)),
      },
      {
        name: 'shape_modify',
        description: 'Modify properties of an existing shape',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          x: z.number().optional(),
          y: z.number().optional(),
          width: z.number().positive().optional(),
          height: z.number().positive().optional(),
          fillColor: z.string().optional(),
          strokeColor: z.string().optional(),
          strokeWeight: z.number().min(0).optional(),
          cornerRadius: z.number().min(0).optional(),
        },
        handler: compose(withLogging('shape_modify'), withErrorHandling())(this.modifyShape.bind(this)),
      },
      {
        name: 'shape_delete',
        description: 'Delete a shape from a page',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('shape_delete'), withErrorHandling())(this.deleteShape.bind(this)),
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

  private async createRectangle(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      cornerRadius: z.number().min(0).optional(),
      fillColor: z.string().optional(),
      strokeColor: z.string().optional(),
      strokeWeight: z.number().min(0).default(0),
    }).parse(args as Record<string, unknown>);

    const fillStr = params.fillColor ? `shape.fillColor = app.activeDocument.colors.item("${this.escape(params.fillColor)}");` : '';
    const strokeStr = params.strokeColor ? `shape.strokeColor = app.activeDocument.colors.item("${this.escape(params.strokeColor)}");` : '';
    const radiusStr = params.cornerRadius !== undefined ? `shape.cornerRadius = ${params.cornerRadius};` : '';

    const code = `
      var shape = app.activeDocument.pages[${params.pageIndex}].rectangles.add();
      shape.geometricBounds = [${params.y}, ${params.x}, ${params.y + params.height}, ${params.x + params.width}];
      shape.strokeWeight = ${params.strokeWeight};
      ${fillStr}
      ${strokeStr}
      ${radiusStr}
      JSON.stringify({ index: shape.index, type: 'rectangle', bounds: shape.geometricBounds });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async createEllipse(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      fillColor: z.string().optional(),
      strokeColor: z.string().optional(),
      strokeWeight: z.number().min(0).default(0),
    }).parse(args as Record<string, unknown>);

    const fillStr = params.fillColor ? `shape.fillColor = app.activeDocument.colors.item("${this.escape(params.fillColor)}");` : '';
    const strokeStr = params.strokeColor ? `shape.strokeColor = app.activeDocument.colors.item("${this.escape(params.strokeColor)}");` : '';

    const code = `
      var shape = app.activeDocument.pages[${params.pageIndex}].ovals.add();
      shape.geometricBounds = [${params.y}, ${params.x}, ${params.y + params.height}, ${params.x + params.width}];
      shape.strokeWeight = ${params.strokeWeight};
      ${fillStr}
      ${strokeStr}
      JSON.stringify({ index: shape.index, type: 'ellipse', bounds: shape.geometricBounds });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async createPolygon(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      numberOfSides: z.number().int().min(3).max(100).default(6),
      fillColor: z.string().optional(),
      strokeColor: z.string().optional(),
      strokeWeight: z.number().min(0).default(0),
    }).parse(args as Record<string, unknown>);

    const fillStr = params.fillColor ? `shape.fillColor = app.activeDocument.colors.item("${this.escape(params.fillColor)}");` : '';
    const strokeStr = params.strokeColor ? `shape.strokeColor = app.activeDocument.colors.item("${this.escape(params.strokeColor)}");` : '';

    const code = `
      var shape = app.activeDocument.pages[${params.pageIndex}].polygons.add();
      shape.geometricBounds = [${params.y}, ${params.x}, ${params.y + params.height}, ${params.x + params.width}];
      shape.strokeWeight = ${params.strokeWeight};
      shape.numberOfSides = ${params.numberOfSides};
      ${fillStr}
      ${strokeStr}
      JSON.stringify({ index: shape.index, type: 'polygon', sides: ${params.numberOfSides}, bounds: shape.geometricBounds });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async createLine(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      strokeColor: z.string().optional(),
      strokeWeight: z.number().min(0).default(1),
    }).parse(args as Record<string, unknown>);

    const strokeStr = params.strokeColor ? `line.strokeColor = app.activeDocument.colors.item("${this.escape(params.strokeColor)}");` : '';

    const code = `
      var line = app.activeDocument.pages[${params.pageIndex}].graphicLines.add();
      line.geometricBounds = [${params.y1}, ${params.x1}, ${params.y2}, ${params.x2}];
      line.strokeWeight = ${params.strokeWeight};
      ${strokeStr}
      JSON.stringify({ index: line.index, type: 'line', bounds: line.geometricBounds });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async modifyShape(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      fillColor: z.string().optional(),
      strokeColor: z.string().optional(),
      strokeWeight: z.number().min(0).optional(),
      cornerRadius: z.number().min(0).optional(),
    }).parse(args as Record<string, unknown>);

    let setStr = '';
    if (params.x !== undefined && params.y !== undefined && params.width !== undefined && params.height !== undefined) {
      setStr += `shape.geometricBounds = [${params.y}, ${params.x}, ${params.y + params.height}, ${params.x + params.width}];\n`;
    }
    if (params.fillColor) setStr += `shape.fillColor = app.activeDocument.colors.item("${this.escape(params.fillColor)}");\n`;
    if (params.strokeColor) setStr += `shape.strokeColor = app.activeDocument.colors.item("${this.escape(params.strokeColor)}");\n`;
    if (params.strokeWeight !== undefined) setStr += `shape.strokeWeight = ${params.strokeWeight};\n`;
    if (params.cornerRadius !== undefined) setStr += `shape.cornerRadius = ${params.cornerRadius};\n`;

    const code = `
      var items = app.activeDocument.pages[${params.pageIndex}].allPageItems;
      var shape = items[${params.itemIndex}];
      if (!shape) { throw new Error("Shape not found"); }
      ${setStr}
      JSON.stringify({ index: ${params.itemIndex}, bounds: shape.geometricBounds });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async deleteShape(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var items = app.activeDocument.pages[${params.pageIndex}].allPageItems;
      var shape = items[${params.itemIndex}];
      if (!shape) { throw new Error("Shape not found"); }
      shape.remove();
      "deleted";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
