/**
 * Fails when an advertised tool count disagrees with the real registry.
 *
 * The vitest guard (tests/contract/toolInventory.test.ts) pins the registry
 * against a constant and against the README's handler table. It does not read
 * the counts the project *advertises* in prose, in the README badge or in the
 * package description — which is exactly how this repo once shipped 183, 191
 * and 194 at the same time. This script reads all of them and compares each to
 * the registry, so the number a user or an agent actually sees cannot drift.
 *
 * The registry is instantiated through the same shared loader the server and
 * the tests use, so this adds no fourth copy of the handler list.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHandlers } from '../tests/helpers/loadHandlers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every markdown file under `marketplace/`, walked recursively. These are
 * listing copy shown to buyers, so a stale count is a promise the project
 * breaks in public.
 */
function marketplaceMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return marketplaceMarkdown(full);
    if (entry.isFile() && entry.name.endsWith('.md')) return [full];
    return [];
  });
}

function readmeHandlerTableSum(): number {
  const readme = readFileSync(join(root, 'README.md'), 'utf-8');
  const section = readme.split('### Full Handler Catalog')[1]?.split('\n## ')[0] ?? '';
  const rows = section.split('\n').filter((line) => /^\|\s*\*\*[A-Za-z]+\*\*\s*\|/.test(line));
  return rows.reduce((sum, row) => {
    const tools = row.split('|')[2];
    return sum + Number((tools ?? '').replace(/\*/g, '').trim());
  }, 0);
}

function eachMatch(text: string, re: RegExp, label: string): Array<[string, number]> {
  return [...text.matchAll(re)].map((m) => [label, Number(m[1])]);
}

async function main(): Promise<void> {
  const handlers = await loadHandlers();
  const total = handlers.reduce((sum, h) => sum + h.tools.length, 0);

  const readme = readFileSync(join(root, 'README.md'), 'utf-8');
  const llmsTxt = readFileSync(join(root, 'llms.txt'), 'utf-8');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
    description?: string;
  };

  const advertised: Array<[string, number]> = [
    // Section headings read "### Text & Typography (27 tools)" — sub-totals by
    // category, and the README keeps an uncounted "Other" bucket, so they do
    // not sum to the total. The negative lookbehind skips them.
    ...eachMatch(readme, /(?<!\()\b(\d{2,4})\s+tools?\b/gi, 'README prose'),
    ...eachMatch(readme, /badge\/tools-(\d+)-/g, 'README badge'),
    // llms.txt is read by agents rather than humans, so it is even easier to
    // forget. It has no parenthesised sub-totals, so no lookbehind is needed.
    ...eachMatch(llmsTxt, /\b(\d{2,4})\s+tools?\b/gi, 'llms.txt'),
    ...eachMatch(pkg.description ?? '', /\b(\d{2,4})\s+tools?\b/gi, 'package.json description'),
    // Marketplace listing copy is read by buyers, and `marketplace/README.md`
    // in this package spells out the count too — checked as prose with no
    // parenthesised sub-totals, so the negative lookbehind is unnecessary.
    ...marketplaceMarkdown(join(root, 'marketplace')).flatMap((file) =>
      eachMatch(
        readFileSync(file, 'utf-8'),
        /\b(\d{2,4})\s+tools?\b/gi,
        file.slice(root.length),
      ),
    ),
    ['README handler table', readmeHandlerTableSum()],
  ];

  const drift = advertised.filter(([, value]) => value !== total);

  if (drift.length > 0) {
    console.error(`Tool-count drift: the registry has ${total} tools, but:`);
    for (const [where, value] of drift) {
      console.error(`  - ${where} advertises ${value}`);
    }
    process.exit(1);
  }

  console.log(
    `tool counts consistent: ${total} tools across ${handlers.length} handlers, ` +
      `checked in ${advertised.length} advertised places`,
  );
}

main().catch((err) => {
  console.error('verify-tool-counts failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
