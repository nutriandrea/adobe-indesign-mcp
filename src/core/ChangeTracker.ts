export interface ChangeInfo {
  lastChangedAt: number | null;
  changeCount: number;
  lastEventName: string | null;
}

/**
 * Pure state holder for plugin-pushed document events.
 * No InDesign dependency — fed by BridgeServer event routing.
 */
export class ChangeTracker {
  private lastChangedAt: number | null = null;
  private changeCount = 0;
  private lastEventName: string | null = null;

  record(eventName: string, _payload?: unknown): void {
    this.lastChangedAt = Date.now();
    this.changeCount += 1;
    this.lastEventName = eventName;
  }

  getInfo(): ChangeInfo {
    return {
      lastChangedAt: this.lastChangedAt,
      changeCount: this.changeCount,
      lastEventName: this.lastEventName,
    };
  }

  hasChangedSince(timestamp: number | null): boolean {
    if (this.lastChangedAt === null) {
      return false;
    }
    if (timestamp === null) {
      return true;
    }
    return this.lastChangedAt > timestamp;
  }
}
