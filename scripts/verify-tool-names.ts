/**
 * Fails when a shipped document tells an agent to call a tool that does not exist.
 *
 * This repo has shipped both shapes of that mistake:
 *
 *   1. a near miss of a real name — `resource_embedLink` for
 *      `resources_embedLink`, `resource_updateLink` for `resources_updateLink`;
 *   2. a name built from a real handler prefix that was never registered —
 *      `script_execute` (the tool is `script_run`), `document_export` (it is
 *      `export_document`), `style_createSwatch` (it is `color_swatch_create`).
 *
 * The CHANGELOG already records why this matters: a skill is instruction, so a
 * name that does not resolve sends a model into a second failure on top of the
 * one it was recovering from. The existing guards do not catch it —
 * `verify:tool-counts` only compares numbers, and `verify:docs` only checks the
 * generated catalog against the registry, never the prose that points at it.
 *
 * Two strengths, because the two kinds of file differ:
 *
 *   - **Skill files** are read as instructions, so they are checked strictly:
 *     every backticked snake_case token must be a registered tool, unless it is
 *     listed in NON_TOOL_IDENTIFIERS with a reason.
 *   - **Other shipped markdown** is prose that legitimately names parameters
 *     (`document_id`), error codes (`page_not_found`) and history. There only
 *     near misses of a real name are reported, which keeps the signal exact:
 *     across this repo that rule produces no false positives.
 *
 * `plans/` is not scanned. Those are design documents frozen at the date they
 * were written; correcting them would rewrite the record of what was planned.
 *
 * A document that has to quote a name it is warning about can say so:
 *
 *   <!-- tool-names: ignore resource_updateLink -->
 *
 * The declaration applies to the whole file and has to name the token, so it
 * cannot silence a typo the author did not notice.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadHandlers } from '../tests/helpers/loadHandlers.js';

/** Files whose prose is read as instruction rather than description. */
const SKILL_PREFIXES = ['.opencode/skills/', 'skills/'];

/** Directories that are history or build output, not shipped documentation. */
const SKIP_PREFIXES = ['plans/', 'dist/', 'dist-mcpb/', 'node_modules/'];

/** Beyond this edit distance a token is unrelated, not a typo. */
const NEAR_MISS_LIMIT = 2;

/**
 * Backticked snake_case tokens that are not tools, with the reason each is
 * allowed to look like one. Keep this list short: an entry here is a promise
 * that the token is not a tool name an agent could try to call.
 */
const NON_TOOL_IDENTIFIERS = new Map<string, string>([
  ['document_id', 'the optional parameter every document-scoped tool accepts'],
]);

export type Finding = {
  file: string;
  token: string;
  reason: 'unknown tool in skill' | 'near miss of a real tool';
  suggestion?: string;
};

/** Levenshtein distance, iterative so a long name cannot blow the stack. */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current.slice();
  }
  return previous[b.length];
}

/**
 * Backticked snake_case tokens: a lowercase start followed by at least one
 * `_segment`. This deliberately skips single words, paths and filenames.
 */
export function extractToolTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/`([a-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)`/g)) {
    tokens.add(match[1]);
  }
  return tokens;
}

/**
 * Tokens a document has declared it is quoting rather than recommending, via
 * `<!-- tool-names: ignore a, b -->`. File-wide, and explicit per token.
 */
export function ignoredTokens(text: string): Set<string> {
  const ignored = new Set<string>();
  for (const match of text.matchAll(/<!--\s*tool-names:\s*ignore\s+([^>]*?)\s*-->/g)) {
    for (const token of match[1].split(',')) {
      const trimmed = token.trim();
      if (trimmed) ignored.add(trimmed);
    }
  }
  return ignored;
}

/** The registered tool a token most plausibly meant, if it is within reach. */
export function closestTool(token: string, known: ReadonlySet<string>): { name: string; distance: number } | null {
  let best: { name: string; distance: number } | null = null;
  for (const name of known) {
    const distance = levenshtein(token, name);
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best;
}

/** Every finding a single file produces under the rules described above. */
export function review(file: string, text: string, known: ReadonlySet<string>): Finding[] {
  const strict = SKILL_PREFIXES.some((prefix) => file.startsWith(prefix));
  const ignored = ignoredTokens(text);
  const findings: Finding[] = [];

  for (const token of extractToolTokens(text)) {
    if (known.has(token) || ignored.has(token)) continue;

    const closest = closestTool(token, known);
    const nearMiss = closest !== null && closest.distance <= NEAR_MISS_LIMIT;

    if (strict && !NON_TOOL_IDENTIFIERS.has(token)) {
      findings.push({
        file,
        token,
        reason: 'unknown tool in skill',
        suggestion: nearMiss ? closest!.name : undefined,
      });
      continue;
    }

    if (nearMiss) {
      findings.push({ file, token, reason: 'near miss of a real tool', suggestion: closest!.name });
    }
  }

  return findings;
}

/** Markdown and text files tracked by git, minus history and build output. */
export function trackedDocuments(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8', cwd: process.cwd() })
    .split('\n')
    .filter((file) => /\.(md|txt)$/.test(file))
    .filter((file) => !SKIP_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

async function main(): Promise<void> {
  const handlers = await loadHandlers();
  const known = new Set(handlers.flatMap((handler) => handler.tools.map((tool) => tool.name)));
  const files = trackedDocuments();

  const findings = files.flatMap((file) => review(file, readFileSync(file, 'utf-8'), known));

  if (findings.length > 0) {
    console.error(`Tool-name drift: ${findings.length} name(s) do not resolve against the registry.`);
    for (const finding of findings) {
      const hint = finding.suggestion ? ` — did you mean \`${finding.suggestion}\`?` : '';
      console.error(`  - ${finding.file}: \`${finding.token}\` (${finding.reason})${hint}`);
    }
    console.error(
      'A shipped name has to resolve, because a skill is instruction: a tool that does not exist ' +
        'sends a model into a second failure on top of the one it was recovering from.',
    );
    process.exit(1);
  }

  console.log(
    `tool names resolve: ${known.size} tools mentioned in ${files.length} documents, ` +
      `no unknown name in a skill and no near miss elsewhere`,
  );
}

const isEntryPoint = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntryPoint) {
  main().catch((err) => {
    console.error('verify-tool-names failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
