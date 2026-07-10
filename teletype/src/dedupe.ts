const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

interface DedupeEntry {
  seenAt: number;
}

export class DedupeWindow {
  private readonly entries = new Map<string, DedupeEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  has(key: string): boolean {
    this.prune();
    return this.entries.has(key);
  }

  add(key: string): void {
    this.prune();
    this.entries.set(key, { seenAt: Date.now() });
    this.evictOverflow();
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, entry] of this.entries) {
      if (entry.seenAt < cutoff) {
        this.entries.delete(key);
      }
    }
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}
