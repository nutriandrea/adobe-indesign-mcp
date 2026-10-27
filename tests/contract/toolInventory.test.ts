/**
 * Tool inventory guard.
 *
 * The project once advertised three different tool counts at once (183 in the
 * repo description, 191 in package.json, 194 in the README). This test pins the
 * real number — measured by instantiating every handler exactly the way
 * IndesignMcpServer does — so the counts can never silently drift again.
 *
 * When you add or remove a tool, update EXPECTED_TOOL_COUNT and every place
 * the README/package.json/repo description mention the count.
 */
import { describe, it, expect } from 'vitest';
import { loadHandlers } from '../helpers/loadHandlers.js';

const EXPECTED_TOOL_COUNT = 199;

describe('tool inventory guard', () => {
  it('exposes exactly the advertised number of tools', async () => {
    const handlers = await loadHandlers();
    const total = handlers.reduce((sum, h) => sum + h.tools.length, 0);
    expect(
      total,
      `Tool count changed: ${total} != ${EXPECTED_TOOL_COUNT}. ` +
        'Update EXPECTED_TOOL_COUNT and every doc that mentions the count ' +
        '(README, package.json description, repo description).',
    ).toBe(EXPECTED_TOOL_COUNT);
  });

  it('has no duplicate tool names across handlers', async () => {
    const handlers = await loadHandlers();
    const names = handlers.flatMap((h) => h.tools.map((t) => t.name));
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates, `Duplicate tool names: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('gives every tool a non-empty name and description', async () => {
    const handlers = await loadHandlers();
    const offenders: string[] = [];
    for (const { name: handlerName, tools } of handlers) {
      for (const tool of tools) {
        if (!tool.name || tool.name.length === 0) offenders.push(`${handlerName}: missing name`);
        if (!tool.description || tool.description.length === 0) {
          offenders.push(`${handlerName}: tool '${tool.name}' missing description`);
        }
      }
    }
    expect(offenders, `Malformed tool metadata:\n${offenders.join('\n')}`).toEqual([]);
  });

  /**
   * The README handler table is a hand-maintained mirror of the registry, and
   * it drifted for three releases: it listed 31 handlers instead of 33, under-
   * counted Export, and omitted Changes and Preview entirely. Parse the table
   * and compare it to the real registry so that cannot happen again.
   */
  describe('README handler table', () => {
    async function readmeTable(): Promise<Map<string, number>> {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const readme = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../README.md'),
        'utf-8',
      );
      // Scope to the catalog section — the rest of the README has other tables
      // whose first cell is bold too.
      const section = readme.split('### Full Handler Catalog')[1]?.split('\n## ')[0] ?? '';
      const rows = section.split('\n').filter((line) => /^\|\s*\*\*[A-Za-z]+\*\*\s*\|/.test(line));
      const counts = new Map<string, number>();
      for (const row of rows) {
        const [, handler, tools] = row.split('|');
        counts.set(handler.replace(/\*/g, '').trim(), Number(tools.replace(/\*/g, '').trim()));
      }
      return counts;
    }

    it('lists the same handlers as the registry, with the same counts', async () => {
      const [table, handlers] = await Promise.all([readmeTable(), loadHandlers()]);

      const real = new Map(handlers.map((h) => [h.name.replace('Handler', ''), h.tools.length]));

      expect(
        [...real.keys()].filter((name) => !table.has(name)),
        'Handlers missing from the README table',
      ).toEqual([]);

      const mismatched = [...real.entries()].filter(([name, count]) => table.get(name) !== count);
      expect(
        mismatched.map(([name, count]) => `${name}: README says ${table.get(name)}, real is ${count}`),
        'README handler table has stale tool counts',
      ).toEqual([]);
    });

    it('sums to the advertised tool count', async () => {
      const table = await readmeTable();
      const total = [...table.values()].reduce((sum, count) => sum + count, 0);
      expect(
        total,
        `README table sums to ${total}, not ${EXPECTED_TOOL_COUNT}`,
      ).toBe(EXPECTED_TOOL_COUNT);
    });
  });
});
