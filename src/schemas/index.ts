import { z } from 'zod';

export const createDocumentSchema = z.object({
  width: z.number().positive().default(210),
  height: z.number().positive().default(297),
  pages: z.number().int().positive().default(1),
  margins: z
    .object({
      top: z.number().min(0).default(12),
      bottom: z.number().min(0).default(12),
      left: z.number().min(0).default(12),
      right: z.number().min(0).default(12),
    })
    .default({ top: 12, bottom: 12, left: 12, right: 12 }),
  bleed: z
    .object({
      top: z.number().min(0).default(3),
      bottom: z.number().min(0).default(3),
      left: z.number().min(0).default(3),
      right: z.number().min(0).default(3),
    })
    .optional(),
  slug: z
    .object({
      top: z.number().min(0).default(0),
      bottom: z.number().min(0).default(0),
      left: z.number().min(0).default(0),
      right: z.number().min(0).default(0),
    })
    .optional(),
  facingPages: z.boolean().default(false),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
});

export const pageSchema = z.object({
  index: z.number().int().min(0),
  properties: z
    .object({
      label: z.string().optional(),
      pageColor: z.string().optional(),
    })
    .optional(),
});

export const addPageSchema = z.object({
  position: z
    .enum(['atEnd', 'atBeginning', 'before', 'after'])
    .default('atEnd'),
  referencePage: z.number().int().min(0).optional(),
});

export const openDocumentSchema = z.object({
  filePath: z.string().min(1),
  showWindow: z.boolean().default(true),
});

export const saveDocumentSchema = z.object({
  filePath: z.string().optional(),
  saveOptions: z.enum(['yes', 'no', 'ask']).default('yes'),
});

export const closeDocumentSchema = z.object({
  // Defaults to 'no' because it is the only safe value: 'ask' raises a modal
  // save dialog, and 'yes' raises a Save As dialog for a document that has never
  // been saved. Both block the script until the bridge times out and can leave
  // InDesign wedged. Closing without saving never prompts; callers that want the
  // work kept must call document_save first.
  saveOptions: z.enum(['yes', 'no', 'ask']).default('no'),
});

export const placeFileSchema = z.object({
  filePath: z.string().min(1),
  pageIndex: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
  layerIndex: z.number().int().min(0).optional(),
});

export const exportDocumentSchema = z.object({
  format: z.enum(['pdf', 'epub', 'html', 'jpg', 'png']),
  filePath: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

/**
 * `Document.packageForPrint` takes fourteen positional arguments in a fixed
 * order (Adobe InDesign DOM reference), several of them booleans whose meaning
 * is not obvious from the name alone:
 *
 *   to, copyingFonts, copyingLinkedGraphics, copyingProfiles, updatingGraphics,
 *   includingHiddenLayers, ignorePreflightErrors, creatingReport, includeIdml,
 *   includePdf, pdfStyle, useDocumentHyphenationExceptionsOnly,
 *   versionComments, forceSave
 *
 * Defaults are the conservative ones: collect fonts and links, do not rewrite
 * the document's links, do not silently swallow a failed preflight, and do not
 * generate a PDF nobody asked for.
 */
export const packageSchema = z.object({
  folderPath: z
    .string()
    .min(1)
    .describe('Absolute folder to receive the package; created if it does not exist'),
  copyingFonts: z.boolean().default(true).describe('Copy the fonts the document uses'),
  copyingLinkedGraphics: z.boolean().default(true).describe('Copy linked graphics'),
  copyingProfiles: z.boolean().default(false).describe('Copy colour profiles'),
  updatingGraphics: z
    .boolean()
    .default(false)
    .describe('Repoint the document’s links at the copies in the package folder'),
  includingHiddenLayers: z
    .boolean()
    .default(false)
    .describe('Collect fonts and links that live on hidden layers'),
  ignorePreflightErrors: z
    .boolean()
    .default(false)
    .describe('Package even when preflight reports errors; false cancels the packaging'),
  creatingReport: z.boolean().default(true).describe('Write the package report (fonts, links, inks, print settings)'),
  includeIdml: z.boolean().default(false).describe('Also generate an IDML copy'),
  includePdf: z.boolean().default(false).describe('Also generate a PDF'),
  pdfStyle: z.string().optional().describe('PDF preset name, used only when includePdf is true'),
  useDocumentHyphenationExceptionsOnly: z
    .boolean()
    .default(true)
    .describe('Keep the document from reflowing on machines with different hyphenation'),
  versionComments: z.string().optional(),
  forceSave: z.boolean().default(false),
  timeoutMs: z.number().int().min(1000).default(300000),
});

export const executeCodeSchema = z.object({
  code: z.string().min(1).max(50000),
});

export const preflightSchema = z.object({
  profile: z
    .string()
    .optional()
    .describe('Name of the preflight profile to run; defaults to the first profile InDesign lists'),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(300)
    .optional()
    .default(30)
    .describe('How long to wait for the preflight process before reading what it has found'),
});
