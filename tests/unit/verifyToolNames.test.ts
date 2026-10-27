/**
 * The guard that stops a shipped document from naming a tool that does not
 * exist. The repo has shipped both shapes of that mistake — near misses of a
 * real name (`resource_updateLink`) and names invented from a real handler
 * prefix (`script_execute`, `document_export`, `style_createSwatch`) — and
 * neither `verify:tool-counts` nor `verify:docs` can see it, because one counts
 * numbers and the other only compares the generated catalog with the registry.
 *
 * These tests pin the two strengths: skill files are instruction and get
 * checked strictly, while prose may mention parameters and error codes and only
 * near misses are reported there. That split is the difference between a guard
 * that runs in CI and one that gets muted.
 */
import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  extractToolTokens,
  closestTool,
  review,
  ignoredTokens,
} from '../../scripts/verify-tool-names.js';

const KNOWN = new Set([
  'resources_embedLink',
  'resources_updateLink',
  'script_run',
  'export_document',
  'color_swatch_create',
  'image_place',
  'page_delete',
]);

describe('levenshtein', () => {
  it('measures the single dropped letter that shipped in three skill files', () => {
    expect(levenshtein('resource_updateLink', 'resources_updateLink')).toBe(1);
  });

  it('treats a fully different name as far away', () => {
    expect(levenshtein('script_execute', 'script_run')).toBeGreaterThan(2);
  });

  it('is zero for the same name', () => {
    expect(levenshtein('image_place', 'image_place')).toBe(0);
  });
});

describe('extractToolTokens', () => {
  it('takes backticked snake_case tokens', () => {
    const tokens = extractToolTokens('Usa `script_run` oppure `image_place`.');
    expect([...tokens].sort()).toEqual(['image_place', 'script_run']);
  });

  it('ignores prose, single words and paths', () => {
    const tokens = extractToolTokens(
      'Il file `/path/al/file.docx` e la parola `link` non sono nomi di tool.',
    );
    expect([...tokens]).toEqual([]);
  });
});

describe('closestTool', () => {
  it('suggests the real name behind a typo', () => {
    expect(closestTool('resource_updateLink', KNOWN)).toEqual({
      name: 'resources_updateLink',
      distance: 1,
    });
  });
});

describe('a skill file is instruction, so it is checked strictly', () => {
  it('reports a near miss and names the tool that was meant', () => {
    const findings = review('.opencode/skills/export-batch.md', 'Tool: `resource_updateLink`', KNOWN);
    expect(findings).toEqual([
      {
        file: '.opencode/skills/export-batch.md',
        token: 'resource_updateLink',
        reason: 'unknown tool in skill',
        suggestion: 'resources_updateLink',
      },
    ]);
  });

  it('reports an invented name that is not a typo of anything', () => {
    // `script_execute` never existed: the tool is `script_run`. A distance
    // rule alone would miss it, which is why skills are checked by membership.
    const findings = review('.opencode/skills/import-word.md', 'Usa `script_execute`', KNOWN);
    expect(findings.map((f) => f.token)).toEqual(['script_execute']);
    expect(findings[0].suggestion).toBeUndefined();
  });

  it('accepts every registered tool', () => {
    const text = '`script_run` `image_place` `color_swatch_create` `export_document`';
    expect(review('.opencode/skills/x.md', text, KNOWN)).toEqual([]);
  });

  it('allows the parameter that is not a tool', () => {
    expect(review('.opencode/skills/x.md', 'passa `document_id`', KNOWN)).toEqual([]);
  });
});

describe('a document that quotes a bad name can say so', () => {
  it('reads the tokens the declaration names', () => {
    expect([...ignoredTokens('<!-- tool-names: ignore resource_updateLink, script_execute -->')]).toEqual([
      'resource_updateLink',
      'script_execute',
    ]);
  });

  it('has no effect on documents that do not declare anything', () => {
    expect([...ignoredTokens('`resource_updateLink`')]).toEqual([]);
  });

  it('silences only what it names, not the typo next to it', () => {
    const text = '<!-- tool-names: ignore resource_updateLink -->\n`resource_updateLink` e `image_plac`';
    const findings = review('.opencode/skills/x.md', text, KNOWN);
    expect(findings.map((f) => [f.token, f.reason])).toEqual([['image_plac', 'unknown tool in skill']]);
  });

  it('is what the changelog uses to name the typo it is recording', () => {
    const text = '<!-- tool-names: ignore resource_updateLink -->\n`` `resource_updateLink` ``';
    expect(review('CHANGELOG.md', text, KNOWN)).toEqual([]);
  });
});

describe('prose may mention error codes and parameters', () => {
  it('does not report an error code that resembles nothing registered', () => {
    const text = 'Gli errori `page_not_found`, `document_not_found` e `script_blocked_by_policy`';
    expect(review('docs/architecture.md', text, KNOWN)).toEqual([]);
  });

  it('still reports a near miss, because that is always a mistake', () => {
    const findings = review('README.md', 'usa `image_plac`', KNOWN);
    expect(findings.map((f) => [f.token, f.reason, f.suggestion])).toEqual([
      ['image_plac', 'near miss of a real tool', 'image_place'],
    ]);
  });
});
