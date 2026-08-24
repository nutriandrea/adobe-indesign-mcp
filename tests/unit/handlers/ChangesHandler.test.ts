import { describe, it, expect, vi } from 'vitest';
import { ChangesHandler } from '../../../src/handlers/ChangesHandler.js';
import type { ChangeTracker } from '../../../src/core/ChangeTracker.js';

describe('ChangesHandler', () => {
  let tracker: {
    getInfo: ReturnType<typeof vi.fn>;
    hasChangedSince: ReturnType<typeof vi.fn>;
  };
  let handler: ChangesHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = {
      getInfo: vi.fn().mockReturnValue({
        lastChangedAt: 1724500000000,
        changeCount: 3,
        lastEventName: 'document_changed',
      }),
      hasChangedSince: vi.fn().mockReturnValue(true),
    };
    handler = new ChangesHandler(tracker as unknown as ChangeTracker);
  });

  it('exposes exactly one changes_getStatus tool', () => {
    expect(handler.tools.map((t) => t.name)).toEqual(['changes_getStatus']);
  });

  it('returns tracker info as JSON text without touching InDesign', async () => {
    const tool = handler.tools[0];
    const res = await tool.handler({});

    expect(res.isError).toBeUndefined();
    const parsed = JSON.parse((res.content[0] as { text: string }).text);
    expect(parsed).toEqual({
      lastChangedAt: 1724500000000,
      changeCount: 3,
      lastEventName: 'document_changed',
    });
    expect(tracker.getInfo).toHaveBeenCalledTimes(1);
  });

  it('with since param reports whether anything changed since that time', async () => {
    const tool = handler.tools[0];
    const res = await tool.handler({ since: 1724499000000 });

    const parsed = JSON.parse((res.content[0] as { text: string }).text);
    expect(parsed.changed).toBe(true);
    expect(tracker.hasChangedSince).toHaveBeenCalledWith(1724499000000);
  });
});
