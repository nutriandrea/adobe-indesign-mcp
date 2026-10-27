import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../server/registerTool.js';
import { typographyAuditSchema } from '../schemas/index.js';

/**
 * Read-only typography audit.
 *
 * The reason this exists as one pass over the document rather than several
 * small questions is cost: `Font.status` is expensive, so the audit asks it once
 * per *font in use* and never enumerates `app.fonts`. A scan of that collection
 * on a machine with 1817 fonts measured about 400 ms per font before it gave up,
 * which is why "check every installed font" is not an option.
 *
 * Two things this deliberately does not do:
 *
 *   - It does not judge. It reports the fonts in use with their status, the
 *     size/leading pairs, and how much of the text carries overrides. Deciding
 *     that 9.5/12 next to 9/11 is a mistake is the operator's call.
 *   - It does not touch the document. Nothing here sets a property.
 */
export class TypographyHandler implements IHandler {
  public readonly name = 'typography';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'typography_audit',
        description:
          'Audit the typography of a document without changing it: every font in use with its status (installed, fauxed, substituted, not available), the point-size and leading combinations, how many paragraphs use each paragraph style and how many of those carry local overrides, and the text that has no paragraph style at all. Samples carry the page name so a finding can be found. Read-only — nothing in the document is modified',
        inputSchema: typographyAuditSchema.shape,
        handler: compose(withLogging('typography_audit'), withErrorHandling())(this.audit.bind(this)),
      },
    ];
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      registerTool(server, tool);
    }
  }

  private async audit(args: unknown, _extra: unknown): Promise<ToolResult> {
    const params = typographyAuditSchema.parse(args as Record<string, unknown>);

    // Comments stay outside the template: backslash escapes and comments inside
    // it are consumed on the way to ExtendScript, and that has bitten this
    // project twice.
    const code = `
      var __doc = __resolveDocument();
      var __max = ${params.maxParagraphs};
      var __samples = ${params.samplesPerFinding};
      var __noStyleId = __doc.paragraphStyles[0].id;

      var __statusName = function (value) {
        if (value == FontStatus.NOT_AVAILABLE) { return 'not_available'; }
        if (value == FontStatus.FAUXED) { return 'fauxed'; }
        if (value == FontStatus.SUBSTITUTED) { return 'substituted'; }
        if (value == FontStatus.INSTALLED) { return 'installed'; }
        return 'unknown';
      };

      var __sample = function (para) {
        var page = null;
        try {
          if (para.parentTextFrames.length > 0 && para.parentTextFrames[0].parentPage) {
            page = String(para.parentTextFrames[0].parentPage.name);
          }
        } catch (e) { page = null; }
        var text = '';
        try { text = String(para.contents); } catch (e) { text = ''; }
        if (text.length > 60) { text = text.substring(0, 60); }
        return { page: page, preview: text };
      };

      var __fonts = {};
      var __sizes = {};
      var __styles = {};
      var __unstyled = { paragraphs: 0, samples: [] };
      var __count = 0;
      var __truncated = false;

      for (var s = 0; s < __doc.stories.length; s++) {
        if (__truncated) { break; }
        var __paras = __doc.stories[s].paragraphs;
        for (var i = 0; i < __paras.length; i++) {
          if (__count >= __max) { __truncated = true; break; }
          var __p = __paras[i];
          __count++;

          var __fontRec = null;
          try {
            var __font = __p.appliedFont;
            var __key = String(__font.postscriptName) + '|' + String(__p.fontStyle);
            __fontRec = __fonts[__key];
            if (!__fontRec) {
              __fontRec = {
                postscriptName: String(__font.postscriptName),
                family: String(__font.fontFamily),
                style: String(__p.fontStyle),
                status: __statusName(__font.status),
                paragraphs: 0,
                samples: []
              };
              __fonts[__key] = __fontRec;
            }
          } catch (e) {
            __fontRec = __fonts.unresolved;
            if (!__fontRec) {
              __fontRec = {
                postscriptName: 'unresolved',
                family: 'unresolved',
                style: 'unknown',
                status: 'unknown',
                paragraphs: 0,
                samples: []
              };
              __fonts.unresolved = __fontRec;
            }
          }
          __fontRec.paragraphs++;
          if (__fontRec.status != 'installed' && __fontRec.samples.length < __samples) {
            __fontRec.samples.push(__sample(__p));
          }

          var __leading = 'auto';
          var __autoLeading = null;
          try {
            if (typeof __p.leading == 'number') { __leading = __p.leading; }
            else { __autoLeading = __p.autoLeading; }
          } catch (e) {}
          var __size = 0;
          try { __size = Number(__p.pointSize); } catch (e) {}
          var __sizeKey = String(__size) + '|' + String(__leading) + '|' + String(__autoLeading);
          var __sizeRec = __sizes[__sizeKey];
          if (!__sizeRec) {
            __sizeRec = {
              pointSize: __size,
              leading: __leading,
              autoLeading: __autoLeading,
              paragraphs: 0
            };
            __sizes[__sizeKey] = __sizeRec;
          }
          __sizeRec.paragraphs++;

          var __style = __p.appliedParagraphStyle;
          var __styleRec = __styles[String(__style.id)];
          if (!__styleRec) {
            __styleRec = {
              name: String(__style.name),
              paragraphs: 0,
              overridden: 0,
              overriddenSamples: []
            };
            __styles[String(__style.id)] = __styleRec;
          }
          __styleRec.paragraphs++;
          var __overridden = false;
          try { __overridden = __p.styleOverridden; } catch (e) {}
          if (__overridden) {
            __styleRec.overridden++;
            if (__styleRec.overriddenSamples.length < __samples) {
              __styleRec.overriddenSamples.push(__sample(__p));
            }
          }
          if (__style.id == __noStyleId) {
            __unstyled.paragraphs++;
            if (__unstyled.samples.length < __samples) { __unstyled.samples.push(__sample(__p)); }
          }
        }
      }

      var __toSortedList = function (map) {
        var list = [];
        for (var key in map) { list.push(map[key]); }
        list.sort(function (a, b) { return b.paragraphs - a.paragraphs; });
        return list;
      };

      var __fontList = __toSortedList(__fonts);
      var __missing = [];
      for (var f = 0; f < __fontList.length; f++) {
        if (__fontList[f].status != 'installed') { __missing.push(__fontList[f]); }
      }

      JSON.stringify({
        document: String(__doc.name),
        pages: __doc.pages.length,
        stories: __doc.stories.length,
        paragraphs: __count,
        truncated: __truncated,
        fonts: __fontList,
        missingFonts: __missing,
        sizes: __toSortedList(__sizes),
        paragraphStyles: __toSortedList(__styles),
        unstyled: __unstyled
      });
    `;

    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
