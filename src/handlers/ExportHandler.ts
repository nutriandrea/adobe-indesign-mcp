import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { exportDocumentSchema, preflightSchema, packageSchema } from '../schemas/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { validateFilePath } from '../utils/security.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../server/registerTool.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";
import { filePathError } from '../utils/security.js';

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
        description: 'Export the active document to a specified format (PDF, JPG, PNG, EPUB, HTML)',
        inputSchema: exportDocumentSchema.shape,
        handler: compose(withLogging('export_document'), withErrorHandling())(this.export.bind(this)),
      },
      {
        name: 'export_batchFolder',
        description:
          'Export every InDesign (.indd) file in a folder to PDF in one run — opens each document invisibly and reports per-file results',
        inputSchema: {
          folderPath: z.string().min(1).describe('Absolute folder containing .indd files'),
          outputDir: z.string().optional().describe('Defaults to the same folder'),
          overwrite: z.boolean().default(false),
          timeoutMs: z.number().int().min(1000).default(300000),
        },
        handler: compose(withLogging('export_batchFolder'), withErrorHandling())(this.batchFolder.bind(this)),
      },
      {
        name: 'export_package',
        description:
          'Package the active document for print: collect fonts, linked graphics and a report into a folder. Unlike exporting, this gathers the document’s dependencies so it can be handed to a printer',
        inputSchema: packageSchema.shape,
        handler: compose(withLogging('export_package'), withErrorHandling())(this.packageDocument.bind(this)),
      },
      {
        name: 'export_preflight',
        description: 'Run a preflight profile against a document and return the problems InDesign reports, including the hierarchy it groups them in. It runs the profile named, or the first profile InDesign lists; export_package instead uses the preflight setup embedded in the document, so the two can disagree',
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
      registerTool(server, tool);
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
    };
    
    const resolvedPathError = filePathError(params.filePath || `~/Desktop/export.${params.format}`);
    if (resolvedPathError) {
      return {
        content: [{ type: 'text', text: `Invalid file path: ${resolvedPathError}` }],
        isError: true,
      };
    }

const exportFormat = formatMap[params.format];
    const filePath = params.filePath || `~/Desktop/export.${params.format}`;
    const escPath = this.escape(filePath);
    const code = `
      __resolveDocument().exportFile(${exportFormat}, File("${escPath}"), false${params.options ? ', ' + JSON.stringify(params.options) : ''});
      JSON.stringify({ exportedTo: "${escPath}", format: "${params.format}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async batchFolder(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z
      .object({
        folderPath: z.string().min(1),
        outputDir: z.string().optional(),
        overwrite: z.boolean().default(false),
        timeoutMs: z.number().int().min(1000).default(300000),
      })
      .parse(args);

    const folderCheck = validateFilePath(params.folderPath);
    if (!folderCheck.valid) {
      return {
        content: [{ type: 'text', text: `Invalid folder path: ${folderCheck.error}` }],
        isError: true,
      };
    }
    const outDir = params.outputDir ?? params.folderPath;
    if (params.outputDir) {
      const outCheck = validateFilePath(outDir);
      if (!outCheck.valid) {
        return {
          content: [{ type: 'text', text: `Invalid output directory: ${outCheck.error}` }],
          isError: true,
        };
      }
    }

    const code = `
      var __batchResults = [];
      var __folder = new Folder("${this.escape(params.folderPath)}");
      var __outDir = "${this.escape(outDir)}";
      app.scriptPreferences.userInteractionLevel = 1699311169; // NEVER_INTERACT
      var __files = __folder.getFiles("*.indd");
      for (var i = 0; i < __files.length; i++) {
        var doc;
        try {
          doc = app.open(__files[i], false);
          var baseName = __files[i].name.replace(/\\.indd$/i, "");
          var outFile = new File(__outDir + "/" + baseName + ".pdf");
          doc.exportFile(ExportFormat.PDF_TYPE, outFile, ${params.overwrite});
          doc.close(SaveOptions.NO_CHANGES);
          __batchResults.push({ file: __files[i].name, ok: true });
        } catch (__e) {
          try { if (doc) doc.close(SaveOptions.NO_CHANGES); } catch (_ignored) {}
          __batchResults.push({ file: __files[i].name, ok: false, error: String(__e.message || __e) });
        }
      }
      JSON.stringify({ total: __files.length, results: __batchResults });
    `;

    try {
      const response = await this.executor.execute(code, params.timeoutMs);
      return formatResponse(response.result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Batch export failed: ${message}` }],
        isError: true,
      };
    }
  }

  private async packageDocument(args: unknown, _extra: any): Promise<ToolResult> {
    const params = packageSchema.parse(args);

    const folderCheck = validateFilePath(params.folderPath);
    if (!folderCheck.valid) {
      return {
        content: [{ type: 'text', text: `Invalid folder path: ${folderCheck.error}` }],
        isError: true,
      };
    }

    // Fourteen positional arguments, in the order the DOM reference lists them.
    // `to` accepts a folder, an alias or a path; a Folder satisfies it because
    // Folder is the directory flavour of the same file-system object.
    const pdfStyle = params.pdfStyle ? `"${this.escape(params.pdfStyle)}"` : '""';
    const versionComments = params.versionComments
      ? `"${this.escape(params.versionComments)}"`
      : '""';

    const code = `
      var __doc = __resolveDocument();
      var __folder = new Folder("${this.escape(params.folderPath)}");
      if (!__folder.exists && !__folder.create()) {
        JSON.stringify({ ok: false, error: "Cannot create package folder: " + __folder.fsName });
      } else {
        try {
          // The DOM declares this as returning Boolean: false means InDesign
          // refused and wrote nothing, which is what happens when preflight
          // reports errors and ignorePreflightErrors is false. It does not
          // throw, so ignoring the value would report an empty folder as
          // success.
          var __packaged = __doc.packageForPrint(
            __folder,
            ${params.copyingFonts},
            ${params.copyingLinkedGraphics},
            ${params.copyingProfiles},
            ${params.updatingGraphics},
            ${params.includingHiddenLayers},
            ${params.ignorePreflightErrors},
            ${params.creatingReport},
            ${params.includeIdml},
            ${params.includePdf},
            ${pdfStyle},
            ${params.useDocumentHyphenationExceptionsOnly},
            ${versionComments},
            ${params.forceSave}
          );
          if (__packaged === false) {
            JSON.stringify({
              ok: false,
              document: __doc.name,
              packagedInto: __folder.fsName,
              error: "InDesign refused to package the document and wrote nothing.",
              hint: ${params.ignorePreflightErrors}
                ? "Packaging returned false. The destination may be read-only or the document may be in a state that cannot be packaged."
                : "This is what a failed preflight looks like: with ignorePreflightErrors false, packageForPrint returns false and copies nothing instead of raising. Packaging checks the preflight setup embedded in the document; run export_preflight with that profile to see the errors, fix them, or set ignorePreflightErrors: true to package anyway."
            });
          } else {
            var __subfolders = [];
            var __topFiles = [];
            var __sub = __folder.getFiles();
            for (var i = 0; i < __sub.length; i++) {
              var __entry = __sub[i];
              if (__entry instanceof Folder) {
                var __inner = __entry.getFiles();
                var __innerNames = [];
                for (var j = 0; j < __inner.length; j++) {
                  __innerNames.push(__inner[j].displayName);
                }
                __subfolders.push({ name: __entry.displayName, files: __innerNames });
              } else {
                __topFiles.push(__entry.displayName);
              }
            }
            var __copiedCount = __topFiles.length;
            for (var k = 0; k < __subfolders.length; k++) {
              __copiedCount += __subfolders[k].files.length;
            }
            JSON.stringify({
              ok: true,
              document: __doc.name,
              packagedInto: __folder.fsName,
              copiedFiles: __copiedCount,
              topLevelFiles: __topFiles,
              subfolders: __subfolders
            });
          }
        } catch (__e) {
          JSON.stringify({
            ok: false,
            error: String(__e.message || __e),
            hint: ${params.ignorePreflightErrors}
              ? "Packaging raised. Check the message above; the folder may be read-only or on a full volume."
              : "Packaging cancels itself when the document’s own preflight reports errors. Run export_preflight with that profile to see them, fix them, or set ignorePreflightErrors: true to package anyway."
          });
        }
      }
    `;

    try {
      const response = await this.executor.execute(code, params.timeoutMs);
      return formatResponse(response.result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Packaging failed: ${message}` }],
        isError: true,
      };
    }
  }

  private async preflight(args: unknown, _extra: any): Promise<ToolResult> {
    const params = preflightSchema.parse(args);
    const requested = params.profile ? this.escape(params.profile) : '';
    // app.preflightProcesses, not Document.preflightProcesses: the collection
    // lives on Application. add() requires the document *and* a profile, and
    // PreflightProcess has no start()/errors, only waitForProcess() and
    // aggregatedResults. A finished process removes itself, so everything has
    // to be read before the app takes it away.
    // itemByName() does not resolve the profile InDesign itself lists as
    // "[di base]" / "[Basic]" — the brackets defeat it — so the name is matched
    // against the collection instead of trusted to the lookup.
    const code = `
      var doc = __resolveDocument();
      var wanted = "${requested}";
      var profile = null;
      if (wanted === '') {
        profile = app.preflightProfiles.length ? app.preflightProfiles[0] : null;
      } else {
        for (var p = 0; p < app.preflightProfiles.length; p++) {
          if (String(app.preflightProfiles[p].name) === wanted) {
            profile = app.preflightProfiles[p];
            break;
          }
        }
      }
      if (!profile || !profile.isValid) {
        var available = [];
        for (var a = 0; a < app.preflightProfiles.length; a++) {
          available.push(app.preflightProfiles[a].name);
        }
        throw new Error("Preflight profile not found: " + wanted + ". Available profiles: " + available.join(' | '));
      }
      var proc = app.preflightProcesses.add(doc, profile);
      try {
        // A process that has already finished rejects the wait; its results
        // are still readable below, so this is not a failure.
        proc.waitForProcess(${params.timeoutSeconds});
      } catch (e) {}
      var findings = [];
      var aggregateError = null;
      try {
        var agg = proc.aggregatedResults;
        if (agg && agg[2]) {
          for (var i = 0; i < agg[2].length; i++) {
            var row = agg[2][i];
            var details = [];
            if (row[4]) {
              for (var j = 0; j < row[4].length; j++) {
                details.push({ label: String(row[4][j][0]), description: String(row[4][j][1]) });
              }
            }
            findings.push({
              parentNodeID: row[0],
              errorName: String(row[1]),
              pageNumber: String(row[2]),
              errorInfo: String(row[3]),
              details: details
            });
          }
        }
      } catch (e2) {
        aggregateError = e2.message;
      }
      var report = '';
      try { report = String(proc.processResults).replace(/\\s+$/, ''); } catch (e3) {}
      try { proc.remove(); } catch (e4) {}
      if (aggregateError) {
        throw new Error("Preflight finished but its results could not be read: " + aggregateError + (report ? " (report: " + report + ")" : ""));
      }
      JSON.stringify({
        profile: profile.name,
        document: doc.name,
        hasErrors: findings.length > 0,
        findingCount: findings.length,
        findings: findings,
        processResults: report
      });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async getSwatches(_args: unknown, _extra: any): Promise<ToolResult> {
    const code = `
      var swatches = __resolveDocument().swatches;
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
      var fonts = __resolveDocument().fonts;
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
      var masters = __resolveDocument().masterSpreads;
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
    const scope = params.pageIndex !== undefined ? `__resolveDocument().pages[${params.pageIndex}]` : '__resolveDocument()';
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
      var tags = __resolveDocument().xmlTags;
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
