import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { formatResponse } from '../utils/errorHandler.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ScriptExecutor } from '../bridge/ScriptExecutor.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { escapeExtendScriptString } from "../utils/stringUtils.js";

export class TextAdvancedHandler implements IHandler {
  public readonly name = 'textAdvanced';
  private executor: ScriptExecutor;

  constructor(executor: ScriptExecutor) {
    this.executor = executor;
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'text_linkFrames',
        description: 'Link (thread) two text frames together',
        inputSchema: {
          sourcePageIndex: z.number().int().min(0),
          sourceFrameIndex: z.number().int().min(0),
          targetPageIndex: z.number().int().min(0),
          targetFrameIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('text_linkFrames'), withErrorHandling())(this.linkFrames.bind(this)),
      },
      {
        name: 'text_unlinkFrames',
        description: 'Unlink a text frame from its thread',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
        },
        handler: compose(withLogging('text_unlinkFrames'), withErrorHandling())(this.unlinkFrames.bind(this)),
      },
      {
        name: 'text_setColumns',
        description: 'Set column count and gutter for a text frame',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          count: z.number().int().min(1).max(12),
          gutter: z.number().min(0).optional().default(12),
        },
        handler: compose(withLogging('text_setColumns'), withErrorHandling())(this.setColumns.bind(this)),
      },
      {
        name: 'text_setTextWrap',
        description: 'Set text wrap preferences for an object',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          itemIndex: z.number().int().min(0),
          mode: z.enum(['none', 'boundingBox', 'objectShape', 'contour']),
          side: z.enum(['both', 'left', 'right', 'towardSpine', 'awayFromSpine']).optional().default('both'),
          offset: z.number().min(0).optional().default(7.055),
        },
        handler: compose(withLogging('text_setTextWrap'), withErrorHandling())(this.setTextWrap.bind(this)),
      },
      {
        name: 'text_setDropCap',
        description: 'Set drop cap options for a paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          lines: z.number().int().min(1).max(10).optional().default(3),
          characters: z.number().int().min(1).max(10).optional().default(1),
          characterStyle: z.string().optional(),
        },
        handler: compose(withLogging('text_setDropCap'), withErrorHandling())(this.setDropCap.bind(this)),
      },
      {
        name: 'text_setKeepOptions',
        description: 'Set keep options (widow/orphan control) for a paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0).optional(),
          linesTogether: z.number().int().min(1).max(10).optional().default(2),
          startParagraph: z.enum(['anywhere', 'nextColumn', 'nextPage', 'nextOddPage', 'nextEvenPage']).optional().default('anywhere'),
          keepWithPrevious: z.boolean().optional().default(false),
          keepWithNext: z.number().int().min(0).max(5).optional().default(0),
        },
        handler: compose(withLogging('text_setKeepOptions'), withErrorHandling())(this.setKeepOptions.bind(this)),
      },
      {
        name: 'text_setInsetSpacing',
        description: 'Set text frame inset spacing',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          top: z.number().min(0),
          left: z.number().min(0),
          bottom: z.number().min(0),
          right: z.number().min(0),
        },
        handler: compose(withLogging('text_setInsetSpacing'), withErrorHandling())(this.setInsetSpacing.bind(this)),
      },
      {
        name: 'text_setAutoSize',
        description: 'Set auto-sizing type for a text frame',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          autoSizingType: z.enum(['off', 'heightOnly', 'widthAndHeight', 'heightAndWidth']),
          referencePoint: z.enum(['topLeft', 'topCenter', 'topRight', 'leftCenter', 'center', 'rightCenter', 'bottomLeft', 'bottomCenter', 'bottomRight']).optional(),
        },
        handler: compose(withLogging('text_setAutoSize'), withErrorHandling())(this.setAutoSize.bind(this)),
      },
      {
        name: 'text_setVerticalJustification',
        description: 'Set vertical justification for a text frame',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          justification: z.enum(['top', 'center', 'bottom', 'justify']),
        },
        handler: compose(withLogging('text_setVerticalJustification'), withErrorHandling())(this.setVerticalJustification.bind(this)),
      },
      {
        name: 'text_setFirstBaseline',
        description: 'Set first baseline options for a text frame',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          offsetType: z.enum(['leading', 'capHeight', 'xHeight', 'baseline', 'ascent', 'fixedHeight', 'leadingFixed', 'minimum']),
          minOffset: z.number().min(0).optional(),
        },
        handler: compose(withLogging('text_setFirstBaseline'), withErrorHandling())(this.setFirstBaseline.bind(this)),
      },
      {
        name: 'text_setIgnoreWrap',
        description: 'Set whether text frame ignores text wrap',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          ignoreWrap: z.boolean(),
        },
        handler: compose(withLogging('text_setIgnoreWrap'), withErrorHandling())(this.setIgnoreWrap.bind(this)),
      },
      {
        name: 'text_setParagraphRuleAbove',
        description: 'Add or modify rule above a paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          ruleOn: z.boolean(),
          ruleWeight: z.number(),
          ruleColor: z.string(),
          ruleWidth: z.enum(['column', 'text', 'custom']),
          ruleOffset: z.number(),
          ruleLeftIndent: z.number(),
          ruleRightIndent: z.number(),
          ruleType: z.string().optional(),
        },
        handler: compose(withLogging('text_setParagraphRuleAbove'), withErrorHandling())(this.setParagraphRuleAbove.bind(this)),
      },
      {
        name: 'text_setParagraphRuleBelow',
        description: 'Add or modify rule below a paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          ruleOn: z.boolean(),
          ruleWeight: z.number(),
          ruleColor: z.string(),
          ruleWidth: z.enum(['column', 'text', 'custom']),
          ruleOffset: z.number(),
          ruleLeftIndent: z.number(),
          ruleRightIndent: z.number(),
          ruleType: z.string().optional(),
        },
        handler: compose(withLogging('text_setParagraphRuleBelow'), withErrorHandling())(this.setParagraphRuleBelow.bind(this)),
      },
      {
        name: 'text_setTabs',
        description: 'Set tab stops for a paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          tabStops: z.array(z.object({
            position: z.number(),
            alignment: z.enum(['left', 'center', 'right', 'decimal', 'character']),
            leader: z.string().optional().default(''),
            character: z.string().optional().default(''),
          })),
        },
        handler: compose(withLogging('text_setTabs'), withErrorHandling())(this.setTabs.bind(this)),
      },
      {
        name: 'text_setHyphenation',
        description: 'Set hyphenation settings for a paragraph',
        inputSchema: {
          pageIndex: z.number().int().min(0),
          frameIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          hyphenation: z.boolean(),
          wordSpacing: z.number().optional(),
          letterSpacing: z.number().optional(),
          minWordLength: z.number().int().min(1).optional(),
          maxConsecutiveHyphens: z.number().int().min(0).optional(),
        },
        handler: compose(withLogging('text_setHyphenation'), withErrorHandling())(this.setHyphenation.bind(this)),
      },
      // ── Formatting tools ──
      {
        name: 'text_getFormatting',
        description: 'Get detailed formatting (font, size, style, character style) for each text style range in a paragraph',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          includeControlChars: z.boolean().optional().default(false).describe('Include BOM/control chars in range text'),
        },
        handler: compose(withLogging('text_getFormatting'), withErrorHandling())(this.getFormatting.bind(this)),
      },
      {
        name: 'text_applyCharStyle',
        description: 'Apply a character style to a range of characters within a paragraph',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          startChar: z.number().int().min(0),
          endChar: z.number().int().min(1),
          styleName: z.string(),
        },
        handler: compose(withLogging('text_applyCharStyle'), withErrorHandling())(this.applyCharStyle.bind(this)),
      },
      {
        name: 'text_applyFont',
        description: 'Apply font family, style, and/or size to a range of characters within a paragraph',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          paragraphIndex: z.number().int().min(0),
          startChar: z.number().int().min(0),
          endChar: z.number().int().min(1),
          fontFamily: z.string().optional().describe('Font family name (e.g. "Minion Pro")'),
          fontStyle: z.string().optional().describe('Font style (e.g. "Bold", "Italic", "Regular")'),
          pointSize: z.number().positive().optional(),
        },
        handler: compose(withLogging('text_applyFont'), withErrorHandling())(this.applyFont.bind(this)),
      },
      // ── Search tools ──
      {
        name: 'text_search',
        description: 'Search text within a story using a GREP pattern, returning match positions and context',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          pattern: z.string().describe('GREP search pattern'),
          maxResults: z.number().int().min(1).max(5000).optional().default(200),
          timeout: z.number().int().min(1000).max(300000).optional(),
        },
        handler: compose(withLogging('text_search'), withErrorHandling())(this.textSearch.bind(this)),
      },
      {
        name: 'text_searchFormatting',
        description: 'Find text ranges with specific formatting (font family, style, or size) within a story',
        inputSchema: {
          storyIndex: z.number().int().min(0),
          fontFamily: z.string().optional().describe('Font family to search for'),
          fontStyle: z.string().optional().describe('Font style to search for (e.g. "Bold", "Italic")'),
          pointSize: z.number().optional().describe('Font size in points'),
          maxResults: z.number().int().min(1).max(5000).optional().default(200),
          timeout: z.number().int().min(1000).max(300000).optional(),
        },
        handler: compose(withLogging('text_searchFormatting'), withErrorHandling())(this.searchFormatting.bind(this)),
      },
    ];
  }

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
    }
  }

  // ── Formatting tools ──

  private async getFormatting(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      includeControlChars: z.boolean().optional().default(false),
    }).parse(args as Record<string, unknown>);

    const contentFilter = params.includeControlChars
      ? 'r.contents'
      : "r.contents.replace(/[\\ufeff\\u0004]/g, '')";

    const code = `
      var story = app.activeDocument.stories[${params.storyIndex}];
      var para = story.paragraphs[${params.paragraphIndex}];
      var paraStart = para.characters[0].index;
      var ranges = para.textStyleRanges;
      var result = [];
      for (var i = 0; i < ranges.length; i++) {
        var r = ranges[i];
        var csName = ""; try { csName = r.appliedCharacterStyle.name; } catch(e) {}
        var fcName = ""; try { fcName = r.fillColor.name; } catch(e) {}
        result.push({
          start: r.characters[0].index - paraStart,
          end: r.characters[0].index - paraStart + r.characters.length,
          font: r.appliedFont.name,
          fontStyle: r.fontStyle,
          pointSize: r.pointSize,
          characterStyle: csName,
          fillColor: fcName,
          capitalization: r.capitalization,
          tracking: r.tracking,
          baselineShift: r.baselineShift,
          horizontalScale: r.horizontalScale,
          verticalScale: r.verticalScale,
          contents: ${contentFilter}
        });
      }
      JSON.stringify(result);
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyCharStyle(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      startChar: z.number().int().min(0),
      endChar: z.number().int().min(1),
      styleName: z.string(),
    }).parse(args as Record<string, unknown>);

    const escStyle = this.escape(params.styleName);

    const code = `
      var story = app.activeDocument.stories[${params.storyIndex}];
      var para = story.paragraphs[${params.paragraphIndex}];
      var paraStart = para.characters[0].index;
      var range = story.characters.itemByRange(paraStart + ${params.startChar}, paraStart + ${params.endChar} - 1);
      range.appliedCharacterStyle = app.activeDocument.characterStyles.item("${escStyle}");
      JSON.stringify({ applied: true, style: "${escStyle}", start: ${params.startChar}, end: ${params.endChar} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async applyFont(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      startChar: z.number().int().min(0),
      endChar: z.number().int().min(1),
      fontFamily: z.string().optional(),
      fontStyle: z.string().optional(),
      pointSize: z.number().positive().optional(),
    }).parse(args as Record<string, unknown>);

    let props = '';
    if (params.fontFamily) props += `\nrange.appliedFont = "${this.escape(params.fontFamily)}";`;
    if (params.fontStyle) props += `\nrange.fontStyle = "${this.escape(params.fontStyle)}";`;
    if (params.pointSize) props += `\nrange.pointSize = ${params.pointSize};`;

    const code = `
      var story = app.activeDocument.stories[${params.storyIndex}];
      var para = story.paragraphs[${params.paragraphIndex}];
      var paraStart = para.characters[0].index;
      var range = story.characters.itemByRange(paraStart + ${params.startChar}, paraStart + ${params.endChar} - 1);
      ${props}
      JSON.stringify({ applied: true${params.fontFamily ? `, fontFamily: "${this.escape(params.fontFamily)}"` : ''}${params.fontStyle ? `, fontStyle: "${this.escape(params.fontStyle)}"` : ''}${params.pointSize ? `, pointSize: ${params.pointSize}` : ''} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  // ── Search tools ──

  private async textSearch(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      pattern: z.string(),
      maxResults: z.number().int().min(1).max(5000).optional().default(200),
      timeout: z.number().int().min(1000).max(300000).optional(),
    }).parse(args as Record<string, unknown>);

    const escPattern = this.escape(params.pattern);

    const code = `
      app.findGrepPreferences = NothingEnum.nothing;
      app.findGrepPreferences.findWhat = "${escPattern}";
      var found = app.activeDocument.stories[${params.storyIndex}].findGrep();
      var result = [];
      var limit = Math.min(found.length, ${params.maxResults});
      for (var i = 0; i < limit; i++) {
        var item = found[i];
        var para = item.parent;
        while (typeof para.index === 'undefined') { para = para.parent; }
        var paraStart = para.characters[0].index;
        result.push({
          paragraphIndex: para.index,
          charStart: item.characters[0].index - paraStart,
          charEnd: item.characters[-1].index + 1 - paraStart,
          text: item.contents.substring(0, 500)
        });
      }
      app.findGrepPreferences = NothingEnum.nothing;
      JSON.stringify({ totalFound: found.length, matches: result });
    `;
    const response = await this.executor.execute(code, params.timeout);
    return formatResponse(response.result);
  }

  private async searchFormatting(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      storyIndex: z.number().int().min(0),
      fontFamily: z.string().optional(),
      fontStyle: z.string().optional(),
      pointSize: z.number().optional(),
      maxResults: z.number().int().min(1).max(5000).optional().default(200),
      timeout: z.number().int().min(1000).max(300000).optional(),
    }).parse(args as Record<string, unknown>);

    let findPrefs = '';
    if (params.fontFamily) findPrefs += `\napp.findTextPreferences.appliedFont = "${this.escape(params.fontFamily)}";`;
    if (params.fontStyle) findPrefs += `\napp.findTextPreferences.fontStyle = "${this.escape(params.fontStyle)}";`;
    if (params.pointSize) findPrefs += `\napp.findTextPreferences.pointSize = ${params.pointSize};`;

    const code = `
      app.findTextPreferences = NothingEnum.nothing;
      app.findTextPreferences.findWhat = "";
      ${findPrefs}
      var found = app.activeDocument.stories[${params.storyIndex}].findText();
      var result = [];
      var limit = Math.min(found.length, ${params.maxResults});
      for (var i = 0; i < limit; i++) {
        var item = found[i];
        var para = item.parent;
        while (typeof para.index === 'undefined') { para = para.parent; }
        var paraStart = para.characters[0].index;
        result.push({
          paragraphIndex: para.index,
          charStart: item.characters[0].index - paraStart,
          charEnd: item.characters[-1].index + 1 - paraStart,
          text: item.contents.substring(0, 500)
        });
      }
      app.findTextPreferences = NothingEnum.nothing;
      JSON.stringify({ totalFound: found.length, matches: result });
    `;
    const response = await this.executor.execute(code, params.timeout);
    return formatResponse(response.result);
  }

  private escape(str: string): string {
    return escapeExtendScriptString(str);
  }

  private async linkFrames(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      sourcePageIndex: z.number().int().min(0),
      sourceFrameIndex: z.number().int().min(0),
      targetPageIndex: z.number().int().min(0),
      targetFrameIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var srcFrame = doc.pages[${params.sourcePageIndex}].textFrames[${params.sourceFrameIndex}];
      var tgtFrame = doc.pages[${params.targetPageIndex}].textFrames[${params.targetFrameIndex}];
      srcFrame.nextTextFrame = tgtFrame;
      JSON.stringify({ linked: true, source: ${params.sourceFrameIndex}, target: ${params.targetFrameIndex} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async unlinkFrames(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var tf = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}];
      tf.nextTextFrame = null;
      JSON.stringify({ unlinked: true, frame: ${params.frameIndex} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setColumns(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      count: z.number().int().min(1).max(12),
      gutter: z.number().min(0).optional().default(12),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var tf = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}];
      tf.textFramePreferences.textColumnCount = ${params.count};
      tf.textFramePreferences.textColumnGutter = ${params.gutter};
      JSON.stringify({ columns: ${params.count}, gutter: ${params.gutter} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setTextWrap(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      itemIndex: z.number().int().min(0),
      mode: z.enum(['none', 'boundingBox', 'objectShape', 'contour']),
      side: z.enum(['both', 'left', 'right', 'towardSpine', 'awayFromSpine']).optional().default('both'),
      offset: z.number().min(0).optional().default(7.055),
    }).parse(args as Record<string, unknown>);

    const modeMap: Record<string, string> = {
      none: 'TextWrapPreferences.TEXT_WRAP_OFF',
      boundingBox: 'TextWrapPreferences.TEXT_WRAP_BOUNDING_BOX',
      objectShape: 'TextWrapPreferences.TEXT_WRAP_OBJECT_SHAPE',
      contour: 'TextWrapPreferences.TEXT_WRAP_CONTOUR',
    };

    const sideMap: Record<string, string> = {
      both: 'TextWrapSide.BOTH_SIDES',
      left: 'TextWrapSide.LEFT_SIDE',
      right: 'TextWrapSide.RIGHT_SIDE',
      towardSpine: 'TextWrapSide.TOWARD_SPINE_SIDE',
      awayFromSpine: 'TextWrapSide.AWAY_FROM_SPINE_SIDE',
    };

    const code = `
      var doc = app.activeDocument;
      var item = doc.pages[${params.pageIndex}].allPageItems[${params.itemIndex}];
      item.textWrapPreferences.textWrapMode = ${modeMap[params.mode]};
      item.textWrapPreferences.textWrapSide = ${sideMap[params.side]};
      item.textWrapPreferences.textWrapOffset = ${params.offset};
      JSON.stringify({ mode: "${params.mode}", side: "${params.side}", offset: ${params.offset} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setDropCap(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      lines: z.number().int().min(1).max(10).optional().default(3),
      characters: z.number().int().min(1).max(10).optional().default(1),
      characterStyle: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const escCharStyle = params.characterStyle ? this.escape(params.characterStyle) : '';

    const code = `
      var doc = app.activeDocument;
      var para = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      para.dropCapCharacters = ${params.characters};
      para.dropCapLines = ${params.lines};
      ${params.characterStyle ? `para.dropCapStyle = doc.characterStyles.item("${escCharStyle}");` : ''}
      JSON.stringify({ lines: ${params.lines}, characters: ${params.characters} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setKeepOptions(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0).optional(),
      linesTogether: z.number().int().min(1).max(10).optional().default(2),
      startParagraph: z.enum(['anywhere', 'nextColumn', 'nextPage', 'nextOddPage', 'nextEvenPage']).optional().default('anywhere'),
      keepWithPrevious: z.boolean().optional().default(false),
      keepWithNext: z.number().int().min(0).max(5).optional().default(0),
    }).parse(args as Record<string, unknown>);

    const startMap: Record<string, string> = {
      anywhere: 'StartParagraph.ANYWHERE',
      nextColumn: 'StartParagraph.NEXT_COLUMN',
      nextPage: 'StartParagraph.NEXT_PAGE',
      nextOddPage: 'StartParagraph.NEXT_ODD_PAGE',
      nextEvenPage: 'StartParagraph.NEXT_EVEN_PAGE',
    };

    const code = `
      var doc = app.activeDocument;
      var para = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex ?? 0}];
      para.keepLinesTogether = true;
      para.keepWithNext = ${params.keepWithNext};
      para.keepWithPrevious = ${params.keepWithPrevious};
      para.keepAllLinesTogether = true;
      para.startParagraph = ${startMap[params.startParagraph]};
      JSON.stringify({ linesTogether: true, startParagraph: "${params.startParagraph}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setInsetSpacing(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      top: z.number().min(0),
      left: z.number().min(0),
      bottom: z.number().min(0),
      right: z.number().min(0),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var tf = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}];
      tf.textFramePreferences.insetSpacing = [${params.top}, ${params.left}, ${params.bottom}, ${params.right}];
      JSON.stringify({ insetSpacing: [${params.top}, ${params.left}, ${params.bottom}, ${params.right}] });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setAutoSize(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      autoSizingType: z.enum(['off', 'heightOnly', 'widthAndHeight', 'heightAndWidth']),
      referencePoint: z.enum(['topLeft', 'topCenter', 'topRight', 'leftCenter', 'center', 'rightCenter', 'bottomLeft', 'bottomCenter', 'bottomRight']).optional(),
    }).parse(args as Record<string, unknown>);

    const autoSizeMap: Record<string, string> = {
      off: 'AutoSizingTypeEnum.AUTO_SIZING_OFF',
      heightOnly: 'AutoSizingTypeEnum.AUTO_SIZING_HEIGHT_ONLY',
      widthAndHeight: 'AutoSizingTypeEnum.AUTO_SIZING_WIDTH_AND_HEIGHT',
      heightAndWidth: 'AutoSizingTypeEnum.AUTO_SIZING_HEIGHT_AND_WIDTH',
    };

    const refPointMap: Record<string, string> = {
      topLeft: 'AnchorPoint.TOP_LEFT_ANCHOR',
      topCenter: 'AnchorPoint.TOP_CENTER_ANCHOR',
      topRight: 'AnchorPoint.TOP_RIGHT_ANCHOR',
      leftCenter: 'AnchorPoint.LEFT_CENTER_ANCHOR',
      center: 'AnchorPoint.CENTER_ANCHOR',
      rightCenter: 'AnchorPoint.RIGHT_CENTER_ANCHOR',
      bottomLeft: 'AnchorPoint.BOTTOM_LEFT_ANCHOR',
      bottomCenter: 'AnchorPoint.BOTTOM_CENTER_ANCHOR',
      bottomRight: 'AnchorPoint.BOTTOM_RIGHT_ANCHOR',
    };

    const code = `
      var doc = app.activeDocument;
      var tf = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}];
      tf.textFramePreferences.autoSizingType = ${autoSizeMap[params.autoSizingType]};
      ${params.referencePoint ? `tf.textFramePreferences.autoSizingReferencePoint = ${refPointMap[params.referencePoint]};` : ''}
      JSON.stringify({ autoSizingType: "${params.autoSizingType}"${params.referencePoint ? `, referencePoint: "${params.referencePoint}"` : ''} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setVerticalJustification(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      justification: z.enum(['top', 'center', 'bottom', 'justify']),
    }).parse(args as Record<string, unknown>);

    const justMap: Record<string, string> = {
      top: 'VerticalJustification.TOP_ALIGN',
      center: 'VerticalJustification.CENTER_ALIGN',
      bottom: 'VerticalJustification.BOTTOM_ALIGN',
      justify: 'VerticalJustification.JUSTIFY_ALIGN',
    };

    const code = `
      var doc = app.activeDocument;
      var tf = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}];
      tf.textFramePreferences.verticalJustification = ${justMap[params.justification]};
      JSON.stringify({ justification: "${params.justification}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setFirstBaseline(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      offsetType: z.enum(['leading', 'capHeight', 'xHeight', 'baseline', 'ascent', 'fixedHeight', 'leadingFixed', 'minimum']),
      minOffset: z.number().min(0).optional(),
    }).parse(args as Record<string, unknown>);

    const baselineMap: Record<string, string> = {
      leading: 'FirstBaseline.LEADING_OFFSET',
      capHeight: 'FirstBaseline.CAP_HEIGHT',
      xHeight: 'FirstBaseline.X_HEIGHT',
      baseline: 'FirstBaseline.BASELINE',
      ascent: 'FirstBaseline.ASCENT_OFFSET',
      fixedHeight: 'FirstBaseline.FIXED_HEIGHT',
      leadingFixed: 'FirstBaseline.LEADING_FIXED',
      minimum: 'FirstBaseline.MINIMUM',
    };

    const code = `
      var doc = app.activeDocument;
      var tf = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}];
      tf.textFramePreferences.firstBaselineOffset = ${baselineMap[params.offsetType]};
      ${params.minOffset !== undefined ? `tf.textFramePreferences.minimumFirstBaseline = ${params.minOffset};` : ''}
      JSON.stringify({ offsetType: "${params.offsetType}"${params.minOffset !== undefined ? `, minOffset: ${params.minOffset}` : ''} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setIgnoreWrap(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      ignoreWrap: z.boolean(),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var tf = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}];
      tf.textFramePreferences.ignoreWrap = ${params.ignoreWrap};
      JSON.stringify({ ignoreWrap: ${params.ignoreWrap} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setParagraphRuleAbove(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      ruleOn: z.boolean(),
      ruleWeight: z.number(),
      ruleColor: z.string(),
      ruleWidth: z.enum(['column', 'text', 'custom']),
      ruleOffset: z.number(),
      ruleLeftIndent: z.number(),
      ruleRightIndent: z.number(),
      ruleType: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const widthMap: Record<string, string> = {
      column: 'RuleWidth.COLUMN_WIDTH',
      text: 'RuleWidth.TEXT_WIDTH',
      custom: 'RuleWidth.CUSTOM_WIDTH',
    };

    const escColor = this.escape(params.ruleColor);

    const code = `
      var doc = app.activeDocument;
      var para = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      para.ruleAbove = ${params.ruleOn};
      para.ruleAboveWeight = ${params.ruleWeight};
      para.ruleAboveColor = doc.colors.item("${escColor}");
      para.ruleAboveWidth = ${widthMap[params.ruleWidth]};
      para.ruleAboveOffset = ${params.ruleOffset};
      para.ruleAboveLeftIndent = ${params.ruleLeftIndent};
      para.ruleAboveRightIndent = ${params.ruleRightIndent};
      ${params.ruleType !== undefined ? `para.ruleAboveType = "${this.escape(params.ruleType)}";` : ''}
      JSON.stringify({ ruleAbove: ${params.ruleOn}, ruleColor: "${escColor}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setParagraphRuleBelow(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      ruleOn: z.boolean(),
      ruleWeight: z.number(),
      ruleColor: z.string(),
      ruleWidth: z.enum(['column', 'text', 'custom']),
      ruleOffset: z.number(),
      ruleLeftIndent: z.number(),
      ruleRightIndent: z.number(),
      ruleType: z.string().optional(),
    }).parse(args as Record<string, unknown>);

    const widthMap: Record<string, string> = {
      column: 'RuleWidth.COLUMN_WIDTH',
      text: 'RuleWidth.TEXT_WIDTH',
      custom: 'RuleWidth.CUSTOM_WIDTH',
    };

    const escColor = this.escape(params.ruleColor);

    const code = `
      var doc = app.activeDocument;
      var para = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      para.ruleBelow = ${params.ruleOn};
      para.ruleBelowWeight = ${params.ruleWeight};
      para.ruleBelowColor = doc.colors.item("${escColor}");
      para.ruleBelowWidth = ${widthMap[params.ruleWidth]};
      para.ruleBelowOffset = ${params.ruleOffset};
      para.ruleBelowLeftIndent = ${params.ruleLeftIndent};
      para.ruleBelowRightIndent = ${params.ruleRightIndent};
      ${params.ruleType !== undefined ? `para.ruleBelowType = "${this.escape(params.ruleType)}";` : ''}
      JSON.stringify({ ruleBelow: ${params.ruleOn}, ruleColor: "${escColor}" });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setTabs(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      tabStops: z.array(z.object({
        position: z.number(),
        alignment: z.enum(['left', 'center', 'right', 'decimal', 'character']),
        leader: z.string().optional().default(''),
        character: z.string().optional().default(''),
      })),
    }).parse(args as Record<string, unknown>);

    const alignMap: Record<string, string> = {
      left: 'TabAlignment.LEFT_ALIGN',
      center: 'TabAlignment.CENTER_ALIGN',
      right: 'TabAlignment.RIGHT_ALIGN',
      decimal: 'TabAlignment.DECIMAL_ALIGN',
      character: 'TabAlignment.CHARACTER_ALIGN',
    };

    const tabsCode = params.tabStops.map(
      (t: { position: number; alignment: string; leader: string; character: string }) =>
        `{position:${t.position},alignment:${alignMap[t.alignment]},leader:"${t.leader}",character:"${t.character}"}`
    ).join(',');

    const code = `
      var doc = app.activeDocument;
      var para = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      para.tabList = [${tabsCode}];
      JSON.stringify({ tabCount: ${params.tabStops.length} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }

  private async setHyphenation(args: unknown, _extra: any): Promise<ToolResult> {
    const params = z.object({
      pageIndex: z.number().int().min(0),
      frameIndex: z.number().int().min(0),
      paragraphIndex: z.number().int().min(0),
      hyphenation: z.boolean(),
      wordSpacing: z.number().optional(),
      letterSpacing: z.number().optional(),
      minWordLength: z.number().int().min(1).optional(),
      maxConsecutiveHyphens: z.number().int().min(0).optional(),
    }).parse(args as Record<string, unknown>);

    const code = `
      var doc = app.activeDocument;
      var para = doc.pages[${params.pageIndex}].textFrames[${params.frameIndex}].paragraphs[${params.paragraphIndex}];
      para.hyphenation = ${params.hyphenation};
      ${params.wordSpacing !== undefined ? `para.desiredWordSpacing = ${params.wordSpacing};` : ''}
      ${params.letterSpacing !== undefined ? `para.desiredLetterSpacing = ${params.letterSpacing};` : ''}
      ${params.minWordLength !== undefined ? `para.hyphenationMinWordSize = ${params.minWordLength};` : ''}
      ${params.maxConsecutiveHyphens !== undefined ? `para.hyphenateLadderLimit = ${params.maxConsecutiveHyphens};` : ''}
      JSON.stringify({ hyphenation: ${params.hyphenation} });
    `;
    const response = await this.executor.execute(code);
    return formatResponse(response.result);
  }
}
