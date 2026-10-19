/**
 * The distribution metadata — registry manifest, client examples, bundle
 * manifest — is all JSON that a human never runs. A typo in `server.json` is not
 * a failing test, it is a rejected registry publish days later with a generic
 * "package validation failed"; a wrong path in an example is a user's first run
 * failing. So every file here is parsed and pinned to a property that matters.
 *
 * The version equality for `mcpb/manifest.json` also lives in
 * `serverVersion.test.ts`; `server.json` is generated, and `npm run
 * verify:server-json` is what catches it going stale against package.json.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const readJson = (relativePath: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8'),
  ) as Record<string, any>;

const readText = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8');

const pkg = readJson('../../package.json') as {
  name: string;
  version: string;
  mcpName?: string;
  description?: string;
};

describe('server.json (MCP Registry manifest)', () => {
  const server = readJson('../../server.json');

  it('pins a dated schema rather than a moving one', () => {
    expect(server.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    );
  });

  it('claims a name the registry can verify against this GitHub account', () => {
    // `io.github.<user>/<server>` is the one namespace GitHub OIDC can prove.
    expect(server.name).toMatch(/^io\.github\.[a-z0-9-]+\/[a-z0-9._-]+$/);
  });

  it('uses the same server name as package.json `mcpName`', () => {
    // This equality is the whole ownership proof: the registry fetches the npm
    // package and matches `mcpName` against the `name` here. If they disagree
    // the publish is rejected.
    expect(pkg.mcpName).toBeTruthy();
    expect(server.name).toBe(pkg.mcpName);
  });

  it('advertises the version being released, in both places it appears', () => {
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0].version).toBe(pkg.version);
  });

  it('tells a client to install this package over stdio', () => {
    const [entry] = server.packages;
    expect(server.packages).toHaveLength(1);
    expect(entry.registryType).toBe('npm');
    expect(entry.identifier).toBe(pkg.name);
    expect(entry.transport).toEqual({ type: 'stdio' });
  });

  it('points at the repository as a plain https URL', () => {
    // The registry schema wants `https://github.com/...`, not `git+...`/`.git`.
    expect(server.repository).toEqual({
      url: 'https://github.com/nutriandrea/adobe-indesign-mcp',
      source: 'github',
    });
  });
});

describe('mcpb/manifest.json (MCP Bundle)', () => {
  const manifest = readJson('../../mcpb/manifest.json');

  it('declares the manifest version the spec documents', () => {
    expect(manifest.manifest_version).toBe('0.3');
  });

  it('carries every field the MCPB validator requires', () => {
    expect(manifest.name).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.description).toBeTruthy();
    expect(manifest.author?.name).toBeTruthy();
    expect(manifest.server?.type).toBe('node');
    expect(manifest.server?.entry_point).toBeTruthy();
  });

  it('runs the same file it declares as the entry point', () => {
    // A manifest whose `entry_point` and `mcp_config.args` disagree starts a
    // different file than it advertises.
    const { entry_point: entryPoint, mcp_config: config } = manifest.server;
    expect(config.command).toBe('node');
    expect(config.args).toEqual([`\${__dirname}/${entryPoint}`]);
  });

  it('keeps the entry point relative to the bundle root', () => {
    // Absolute paths would resolve to the builder's machine, not the user's.
    expect(manifest.server.entry_point).not.toMatch(/^[/\\]/);
    expect(manifest.server.entry_point).not.toMatch(/^[A-Za-z]:/);
    expect(manifest.server.entry_point).toMatch(/\.js$/);
  });

  it('claims only platforms this server has a bridge for', () => {
    // macOS (JXA/UXP) and Windows (COM). There is no Linux bridge, so claiming
    // `linux` would install a bundle that can never reach InDesign.
    expect(manifest.compatibility.platforms).toEqual(['darwin', 'win32']);
  });
});

describe('glama.json', () => {
  it('claims the server for maintainers who can actually push', () => {
    const glama = readJson('../../glama.json');
    expect(glama.$schema).toBe('https://glama.ai/mcp/schemas/server.json');
    expect(glama.maintainers).toContain('nutriandrea');
  });
});

describe('llms.txt', () => {
  const text = readText('../../llms.txt');

  it('follows the llms.txt convention', () => {
    // H1 title, then a blockquote summary.
    expect(text).toMatch(/^# \S/);
    expect(text).toMatch(/^> /m);
  });

  it('links to the repository it documents', () => {
    expect(text).toContain('https://github.com/nutriandrea/adobe-indesign-mcp');
  });
});

describe('examples/', () => {
  const dir = fileURLToPath(new URL('../../examples/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('ships at least one config per documented client', () => {
    expect(files).toContain('claude-desktop.json');
    expect(files).toContain('cursor.json');
  });

  it.each(files)('%s is a config a client can actually load', (file) => {
    const config = readJson(`../../examples/${file}`);
    const servers = config.mcpServers;
    expect(servers).toBeTypeOf('object');
    const indesign = servers.indesign;
    expect(indesign, `${file} has no "indesign" server`).toBeTruthy();
    expect(indesign.command).toBe('npx');
    expect(Array.isArray(indesign.args)).toBe(true);
    expect(indesign.args.length).toBeGreaterThan(0);
    expect(indesign.args.every((a: unknown) => typeof a === 'string')).toBe(true);
  });

  it('names a package that resolves, keyed to the name that is published', () => {
    // These files pointed at `node /ABSOLUTE/PATH/TO/.../dist/index.js` while the
    // package was unpublished, and `npx` was forbidden then precisely because it
    // did not resolve. The package is on npm now, so `npx` is what a user should
    // run — the failure this test exists to prevent is an example naming a
    // package that is not the one `package.json` publishes. Keying the
    // assertion to `pkg.name` makes a rename fail here rather than on a user's
    // first run.
    for (const file of files) {
      const text = readText(`../../examples/${file}`);
      const indesign = readJson(`../../examples/${file}`).mcpServers.indesign;
      expect(indesign.command, `${file} command`).toBe('npx');
      expect(indesign.args, `${file} args`).toEqual(['-y', pkg.name]);
      expect(text, `${file} carries no local path`).not.toContain('ABSOLUTE/PATH');
    }
  });
});
