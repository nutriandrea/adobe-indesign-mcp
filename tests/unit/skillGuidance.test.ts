/**
 * Skills are loaded by a host LLM and shipped to users, so a skill that names a
 * tool the server does not expose is worse than no skill at all: the model
 * calls a name that never resolves, then has to recover from a failure the
 * documentation caused.
 *
 * The initialize-time contract is already guarded (instructions.test.ts), and
 * the generated catalog cannot drift (verify:docs regenerates and diffs it) —
 * but `SKILL.md` was unguarded. That is how `health_check` and
 * `list_ai_skills`, two tools that never existed in any handler, survived in
 * the shipped layout skill, together with an invented `mcp_indesign_*` prefix.
 *
 * This walks every skill the repo ships (`skills/`) or lists for a marketplace
 * (`marketplace/`) and holds the tool names in it to the same live registry.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadToolNames } from '../helpers/loadHandlers.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Directories that may contain published skill folders. */
const SKILL_ROOTS = ['skills', 'marketplace'];

/** Every `SKILL.md` under `dir`, walked recursively. */
function findSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findSkillFiles(full);
    if (entry.isFile() && entry.name === 'SKILL.md') return [full];
    return [];
  });
}

const SKILL_FILES = SKILL_ROOTS.flatMap((r) => findSkillFiles(join(ROOT, r))).sort();

/**
 * snake_case tokens a skill may use that are deliberately not tool names.
 * Each needs a reason: this allowlist is where a real drift would hide, so it
 * must stay short and explained.
 */
const NON_TOOL_TOKENS = new Set([
  // The one parameter every tool accepts, declared once in registerTool.
  'document_id',
  // Describes the naming convention the tools follow; not a name itself.
  'snake_case',
  // Envelope error codes a skill may quote back to the model.
  'bridge_not_connected',
  'script_blocked_by_policy',
  'missing_font',
  'link_missing',
  'invalid_reference',
  'execution_timeout',
  'suggested_next_tool',
]);

/** Tool-like tokens: bare snake_case identifiers, as the server registers them. */
function toolTokens(text: string): string[] {
  return text.match(/\b[a-z][a-zA-Z]*_[a-zA-Z_]+\b/g) ?? [];
}

/** The YAML frontmatter block, or null when a file has none. */
function frontmatter(text: string): string | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : null;
}

describe('shipped skills', () => {
  it('finds at least one SKILL.md to guard', () => {
    // A walk that silently returns nothing would make every test below pass
    // vacuously — the same failure mode as a disabled linter.
    expect(SKILL_FILES.length).toBeGreaterThan(0);
  });

  it.each(SKILL_FILES.map((f) => [f.slice(ROOT.length), f] as const))(
    '%s has name and description frontmatter',
    (_label, file) => {
      const fm = frontmatter(readFileSync(file, 'utf8'));
      expect(fm, `${file} has no YAML frontmatter`).not.toBeNull();
      expect(fm).toMatch(/^name:\s*\S+/m);
      expect(fm).toMatch(/^description:\s*\S+/m);
    },
  );

  it.each(SKILL_FILES.map((f) => [f.slice(ROOT.length), f] as const))(
    '%s names only tools that exist',
    async (_label, file) => {
      const registered = new Set(await loadToolNames());
      const dangling = [...new Set(toolTokens(readFileSync(file, 'utf8')))].filter(
        (t) => !registered.has(t) && !NON_TOOL_TOKENS.has(t),
      );
      expect(
        dangling,
        `${file} names tools that are not registered: ${dangling.join(', ')}. ` +
          'Either the tool was renamed or removed, or the skill has a typo. ' +
          'If the token is not a tool, add it to NON_TOOL_TOKENS with a reason.',
      ).toEqual([]);
    },
  );

  it.each(SKILL_FILES.map((f) => [f.slice(ROOT.length), f] as const))(
    '%s lives in a folder named after itself',
    (_label, file) => {
      // A marketplace skill whose `name` and folder disagree is rejected or,
      // worse, silently not loaded. The packaged skill already follows the
      // convention, so hold every skill in both trees to it.
      const name = readFileSync(file, 'utf8').match(/^name:\s*(\S+)\s*$/m)?.[1];
      expect(name).toBe(basename(dirname(file)));
    },
  );

  it.each(SKILL_FILES.map((f) => [f.slice(ROOT.length), f] as const))(
    '%s is not empty and carries no placeholder',
    (_label, file) => {
      const text = readFileSync(file, 'utf8');
      expect(text.trim().length).toBeGreaterThan(200);
      expect(text).not.toMatch(/TODO|FIXME|XXX/);
    },
  );
});

describe('the layout skill in particular', () => {
  const file = join(ROOT, 'skills/indesign/indesign-mcp-layout/SKILL.md');

  it('exists where the package ships it', () => {
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).isFile()).toBe(true);
  });

  it('points at a real way to check the connection', () => {
    const text = readFileSync(file, 'utf8');
    // document_listOpen is the cheap, typed probe the server instructions name.
    expect(text).toMatch(/document_listOpen/);
    // The two names that never existed must not come back.
    expect(text).not.toMatch(/health_check|list_ai_skills/);
  });
});
