import { z } from 'zod';
import type { IHandler, ToolDefinition, ToolResult } from '../types/index.js';
import { withLogging, withErrorHandling, compose } from '../utils/middleware.js';
import type { ChangeTracker } from '../core/ChangeTracker.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const statusParams = z.object({
  since: z.number().optional(),
});

export class ChangesHandler implements IHandler {
  public readonly name = 'changes';

  constructor(private readonly tracker: ChangeTracker) {}

  public register(server: McpServer): void {
    for (const tool of this.tools) {
      server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
    }
  }

  public get tools(): ToolDefinition[] {
    return [
      {
        name: 'changes_getStatus',
        description:
          'Report document change activity pushed by the plugin over the bridge — no InDesign round-trip. ' +
          'Pass `since` (epoch ms) to learn whether anything changed after that moment, e.g. to skip ' +
          're-rendering a preview when nothing changed.',
        inputSchema: {
          since: z.number().optional(),
        },
        handler: compose(
          withLogging('changes_getStatus'),
          withErrorHandling(),
        )(this.getStatus.bind(this)),
      },
    ];
  }

  private async getStatus(args: unknown): Promise<ToolResult> {
    const params = statusParams.parse(args ?? {});
    const info = this.tracker.getInfo();
    const payload =
      params.since !== undefined
        ? { ...info, changed: this.tracker.hasChangedSince(params.since) }
        : info;
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }
}
