import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class TableHandler implements IHandler {
  public readonly name = 'table';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'table_create',
        description: 'Create a table on a page at specified bounds with row/column count',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }),
          rows: z.number().int().min(1).default(3),
          columns: z.number().int().min(1).default(3),
        },
        handler: compose(withLogging('table_create'), withErrorHandling())(this.create.bind(this)),
      },
      {
        name: 'table_list',
        description: 'List all tables on a page or in the document',
        inputSchema: { pageIndex: z.number().int().min(0).optional() },
        handler: compose(withLogging('table_list'), withErrorHandling())(this.list.bind(this)),
      },
      {
        name: 'table_addRow',
        description: 'Add a row to a table at a specific index',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          atIndex: z.number().int().min(0).optional(),
        },
        handler: compose(withLogging('table_addRow'), withErrorHandling())(this.addRow.bind(this)),
      },
      {
        name: 'table_addColumn',
        description: 'Add a column to a table at a specific index',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          atIndex: z.number().int().min(0).optional(),
        },
        handler: compose(withLogging('table_addColumn'), withErrorHandling())(this.addColumn.bind(this)),
      },
      {
        name: 'table_deleteRow',
        description: 'Delete a row from a table',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          rowIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('table_deleteRow'), withErrorHandling())(this.deleteRow.bind(this)),
      },
      {
        name: 'table_deleteColumn',
        description: 'Delete a column from a table',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          columnIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('table_deleteColumn'), withErrorHandling())(this.deleteColumn.bind(this)),
      },
      {
        name: 'table_setCell',
        description: 'Set content of a specific cell',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          row: z.number().int().min(0),
          column: z.number().int().min(0),
          content: z.string(),
        },
        handler: compose(withLogging('table_setCell'), withErrorHandling())(this.setCell.bind(this)),
      },
      {
        name: 'table_getInfo',
        description: 'Get detailed info about a table (rows, columns, cell contents)',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('table_getInfo'), withErrorHandling())(this.getInfo.bind(this)),
      },
      {
        name: 'table_mergeCells',
        description: 'Merge a range of cells into one',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          startRow: z.number().int().min(0),
          startColumn: z.number().int().min(0),
          endRow: z.number().int().min(0),
          endColumn: z.number().int().min(0),
        },
        handler: compose(withLogging('table_mergeCells'), withErrorHandling())(this.mergeCells.bind(this)),
      },
      {
        name: 'table_splitCell',
        description: 'Split a merged cell',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          rowIndex: z.number().int().min(0),
          columnIndex: z.number().int().min(0),
          horizontal: z.boolean().default(true),
          vertical: z.boolean().default(true),
        },
        handler: compose(withLogging('table_splitCell'), withErrorHandling())(this.splitCell.bind(this)),
      },
      {
        name: 'table_setCellFill',
        description: "Set a cell's fill color and tint",
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          rowIndex: z.number().int().min(0),
          columnIndex: z.number().int().min(0),
          fillColor: z.string(),
          tintPercent: z.number().min(0).max(100).optional(),
        },
        handler: compose(withLogging('table_setCellFill'), withErrorHandling())(this.setCellFill.bind(this)),
      },
      {
        name: 'table_setCellStroke',
        description: 'Set cell edge stroke properties',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          rowIndex: z.number().int().min(0),
          columnIndex: z.number().int().min(0),
          edge: z.enum(['top', 'bottom', 'left', 'right', 'all']),
          strokeWeight: z.number().min(0),
          strokeColor: z.string().optional(),
          strokeType: z.string().optional(),
        },
        handler: compose(withLogging('table_setCellStroke'), withErrorHandling())(this.setCellStroke.bind(this)),
      },
      {
        name: 'table_setCellInset',
        description: 'Set cell inset spacing',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          rowIndex: z.number().int().min(0),
          columnIndex: z.number().int().min(0),
          top: z.number().min(0),
          bottom: z.number().min(0),
          left: z.number().min(0),
          right: z.number().min(0),
        },
        handler: compose(withLogging('table_setCellInset'), withErrorHandling())(this.setCellInset.bind(this)),
      },
      {
        name: 'table_setCellAlignment',
        description: 'Set cell text alignment',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          rowIndex: z.number().int().min(0),
          columnIndex: z.number().int().min(0),
          horizontalAlignment: z.enum(['left', 'center', 'right', 'justify']).optional(),
          verticalAlignment: z.enum(['top', 'center', 'bottom', 'justify']).optional(),
        },
        handler: compose(withLogging('table_setCellAlignment'), withErrorHandling())(this.setCellAlignment.bind(this)),
      },
      {
        name: 'table_setHeaderFooter',
        description: 'Set header and footer row counts',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          headerRows: z.number().int().min(0).default(0),
          footerRows: z.number().int().min(0).default(0),
          repeatHeader: z.boolean().default(true),
        },
        handler: compose(withLogging('table_setHeaderFooter'), withErrorHandling())(this.setHeaderFooter.bind(this)),
      },
      {
        name: 'table_setRowColumnSize',
        description: 'Set row height or column width',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          tableIndex: z.number().int().min(0),
          type: z.enum(['row', 'column']),
          index: z.number().int().min(0),
          size: z.number().min(0),
          units: z.enum(['points', 'mm', 'inches']).optional().default('points'),
        },
        handler: compose(withLogging('table_setRowColumnSize'), withErrorHandling())(this.setRowColumnSize.bind(this)),
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

  private scope(pageIndex?: number): string {
    return pageIndex !== undefined ? `app.activeDocument.pages[${pageIndex}]` : 'app.activeDocument';
  }

  private async create(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      bounds: z.object({ top: z.number(), left: z.number(), bottom: z.number(), right: z.number() }),
      rows: z.number().int().min(1).default(3),
      columns: z.number().int().min(1).default(3),
    }).parse(args as Record<string, unknown>);
    const b = params.bounds;
    const code = `
      var pg = app.activeDocument.pages[${params.pageIndex}];
      var tf = pg.textFrames.add();
      tf.geometricBounds = [${b.top}, ${b.left}, ${b.bottom}, ${b.right}];
      var table = tf.tables.add();
      table.rows[0].cells[0].contents = "";
      JSON.stringify({ rows: table.rows.length, columns: table.columns.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async list(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({ pageIndex: z.number().int().min(0).optional() }).parse(args as Record<string, unknown>);
    const s = this.scope(params.pageIndex);
    const code = `
      var tables = ${s}.tables;
      var result = [];
      for (var i = 0; i < tables.length; i++) {
        var t = tables[i];
        result.push({ index: i, rows: t.rows.length, columns: t.columns.length });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async addRow(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      atIndex: z.number().int().min(0).optional(),
    }).parse(args as Record<string, unknown>);
    const at = params.atIndex !== undefined ? params.atIndex : 0;
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.rows.add(${at});
      JSON.stringify({ rows: table.rows.length, columns: table.columns.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async addColumn(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      atIndex: z.number().int().min(0).optional(),
    }).parse(args as Record<string, unknown>);
    const at = params.atIndex !== undefined ? params.atIndex : 0;
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.columns.add(${at});
      JSON.stringify({ rows: table.rows.length, columns: table.columns.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async deleteRow(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      rowIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.rows[${params.rowIndex}].remove();
      JSON.stringify({ rows: table.rows.length, columns: table.columns.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async deleteColumn(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      columnIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.columns[${params.columnIndex}].remove();
      JSON.stringify({ rows: table.rows.length, columns: table.columns.length });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setCell(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      row: z.number().int().min(0),
      column: z.number().int().min(0),
      content: z.string(),
    }).parse(args as Record<string, unknown>);
    const escContent = this.escape(params.content);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.rows[${params.row}].cells[${params.column}].contents = "${escContent}";
      "set";
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getInfo(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      var result = { rows: table.rows.length, columns: table.columns.length, cells: [] };
      for (var r = 0; r < table.rows.length; r++) {
        for (var c = 0; c < table.columns.length; c++) {
          result.cells.push({ row: r, column: c, contents: table.rows[r].cells[c].contents });
        }
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async mergeCells(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      startRow: z.number().int().min(0),
      startColumn: z.number().int().min(0),
      endRow: z.number().int().min(0),
      endColumn: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.rows[${params.startRow}].cells[${params.startColumn}].merge(table.rows[${params.endRow}].cells[${params.endColumn}]);
      JSON.stringify({ merged: true, startRow: ${params.startRow}, startColumn: ${params.startColumn}, endRow: ${params.endRow}, endColumn: ${params.endColumn} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async splitCell(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      rowIndex: z.number().int().min(0),
      columnIndex: z.number().int().min(0),
      horizontal: z.boolean().default(true),
      vertical: z.boolean().default(true),
    }).parse(args as Record<string, unknown>);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.rows[${params.rowIndex}].cells[${params.columnIndex}].split(${params.horizontal}, ${params.vertical});
      JSON.stringify({ split: true, rowIndex: ${params.rowIndex}, columnIndex: ${params.columnIndex} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setCellFill(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      rowIndex: z.number().int().min(0),
      columnIndex: z.number().int().min(0),
      fillColor: z.string(),
      tintPercent: z.number().min(0).max(100).optional(),
    }).parse(args as Record<string, unknown>);
    const escColor = this.escape(params.fillColor);
    const tintLine = params.tintPercent !== undefined
      ? `\n      cell.fillTint = ${params.tintPercent};`
      : '';
    const tintVal = params.tintPercent !== undefined ? params.tintPercent : 'null';
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      var cell = table.rows[${params.rowIndex}].cells[${params.columnIndex}];
      cell.fillColor = app.activeDocument.colors.item("${escColor}");${tintLine}
      JSON.stringify({ fillColor: "${escColor}", tint: ${tintVal} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setCellStroke(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      rowIndex: z.number().int().min(0),
      columnIndex: z.number().int().min(0),
      edge: z.enum(['top', 'bottom', 'left', 'right', 'all']),
      strokeWeight: z.number().min(0),
      strokeColor: z.string().optional(),
      strokeType: z.string().optional(),
    }).parse(args as Record<string, unknown>);
    const edges = params.edge === 'all' ? ['top', 'bottom', 'left', 'right'] : [params.edge];
    const escColor = params.strokeColor ? this.escape(params.strokeColor) : '';
    const escStrokeType = params.strokeType ? this.escape(params.strokeType) : '';
    let assignments = '';
    for (const e of edges) {
      assignments += `\n      cell.${e}EdgeStrokeWeight = ${params.strokeWeight};`;
      if (params.strokeColor) {
        assignments += `\n      cell.${e}EdgeStrokeColor = app.activeDocument.colors.item("${escColor}");`;
      }
      if (params.strokeType) {
        assignments += `\n      cell.${e}EdgeStrokeType = app.activeDocument.strokeStyles.item("${escStrokeType}");`;
      }
    }
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      var cell = table.rows[${params.rowIndex}].cells[${params.columnIndex}];${assignments}
      JSON.stringify({ edge: "${params.edge}", strokeWeight: ${params.strokeWeight} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setCellInset(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      rowIndex: z.number().int().min(0),
      columnIndex: z.number().int().min(0),
      top: z.number().min(0),
      bottom: z.number().min(0),
      left: z.number().min(0),
      right: z.number().min(0),
    }).parse(args as Record<string, unknown>);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      var cell = table.rows[${params.rowIndex}].cells[${params.columnIndex}];
      cell.topInset = ${params.top};
      cell.bottomInset = ${params.bottom};
      cell.leftInset = ${params.left};
      cell.rightInset = ${params.right};
      JSON.stringify({ top: ${params.top}, bottom: ${params.bottom}, left: ${params.left}, right: ${params.right} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setCellAlignment(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      rowIndex: z.number().int().min(0),
      columnIndex: z.number().int().min(0),
      horizontalAlignment: z.enum(['left', 'center', 'right', 'justify']).optional(),
      verticalAlignment: z.enum(['top', 'center', 'bottom', 'justify']).optional(),
    }).parse(args as Record<string, unknown>);
    const hAlignMap: Record<string, string> = {
      left: 'Justification.LEFT_ALIGN',
      center: 'Justification.CENTER_ALIGN',
      right: 'Justification.RIGHT_ALIGN',
      justify: 'Justification.JUSTIFY_ALIGN',
    };
    const vAlignMap: Record<string, string> = {
      top: 'VerticalJustification.TOP_ALIGN',
      center: 'VerticalJustification.CENTER_ALIGN',
      bottom: 'VerticalJustification.BOTTOM_ALIGN',
      justify: 'VerticalJustification.JUSTIFY_ALIGN',
    };
    let setup = '';
    if (params.horizontalAlignment) {
      setup += `\n      cell.paragraphs[0].justification = ${hAlignMap[params.horizontalAlignment]};`;
    }
    if (params.verticalAlignment) {
      setup += `\n      cell.verticalJustification = ${vAlignMap[params.verticalAlignment]};`;
    }
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      var cell = table.rows[${params.rowIndex}].cells[${params.columnIndex}];${setup}
      JSON.stringify({ horizontalAlignment: "${params.horizontalAlignment || ''}", verticalAlignment: "${params.verticalAlignment || ''}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setHeaderFooter(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      headerRows: z.number().int().min(0).default(0),
      footerRows: z.number().int().min(0).default(0),
      repeatHeader: z.boolean().default(true),
    }).parse(args as Record<string, unknown>);
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.headerRowCount = ${params.headerRows};
      table.footerRowCount = ${params.footerRows};
      JSON.stringify({ headerRows: ${params.headerRows}, footerRows: ${params.footerRows}, repeatHeader: ${params.repeatHeader} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setRowColumnSize(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      tableIndex: z.number().int().min(0),
      type: z.enum(['row', 'column']),
      index: z.number().int().min(0),
      size: z.number().min(0),
      units: z.enum(['points', 'mm', 'inches']).optional().default('points'),
    }).parse(args as Record<string, unknown>);
    const sizeInPoints = params.units === 'mm'
      ? params.size * 2.83465
      : params.units === 'inches'
        ? params.size * 72
        : params.size;
    const prop = params.type === 'row' ? 'height' : 'width';
    const code = `
      var table = ${this.scope(params.pageIndex)}.tables[${params.tableIndex}];
      if (!table.isValid) { throw new Error("Table not found"); }
      table.${params.type}s[${params.index}].${prop} = ${sizeInPoints};
      JSON.stringify({ type: "${params.type}", index: ${params.index}, size: ${sizeInPoints}, units: "points" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
