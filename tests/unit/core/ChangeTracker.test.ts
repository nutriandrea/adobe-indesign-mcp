import { describe, it, expect } from 'vitest';
import { ChangeTracker } from '../../../src/core/ChangeTracker.js';

describe('ChangeTracker', () => {
  it('starts empty with null timestamp and zero count', () => {
    const tracker = new ChangeTracker();
    expect(tracker.getInfo()).toEqual({
      lastChangedAt: null,
      changeCount: 0,
      lastEventName: null,
    });
    expect(tracker.hasChangedSince(0)).toBe(false);
    expect(tracker.hasChangedSince(null)).toBe(false);
  });

  it('records an event: sets timestamp, increments count, keeps last name', () => {
    const tracker = new ChangeTracker();
    const before = Date.now();
    tracker.record('document_changed', { modified: true });

    const info = tracker.getInfo();
    expect(info.changeCount).toBe(1);
    expect(info.lastEventName).toBe('document_changed');
    expect(info.lastChangedAt).toBeGreaterThanOrEqual(before);
  });

  it('hasChangedSince is true for older timestamps and false for newer ones', () => {
    const tracker = new ChangeTracker();
    const before = Date.now();
    tracker.record('document_changed', {});
    const ts = tracker.getInfo().lastChangedAt!;

    expect(tracker.hasChangedSince(before - 1000)).toBe(true);
    expect(tracker.hasChangedSince(ts)).toBe(false);
    expect(tracker.hasChangedSince(ts + 1000)).toBe(false);
    expect(tracker.hasChangedSince(null)).toBe(true);
  });

  it('getInfo returns a defensive copy', () => {
    const tracker = new ChangeTracker();
    tracker.record('document_changed', {});
    const info = tracker.getInfo();
    info.changeCount = 999;
    info.lastChangedAt = 0;
    expect(tracker.getInfo().changeCount).toBe(1);
    expect(tracker.getInfo().lastChangedAt).not.toBe(0);
  });
});
