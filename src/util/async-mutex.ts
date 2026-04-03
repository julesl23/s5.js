/**
 * Keyed async mutex using Promise-chain pattern.
 * Callers with the same key serialize; different keys run in parallel.
 */
export class AsyncMutex {
  private queue: Map<string, Promise<void>> = new Map();

  async acquire(key: string): Promise<() => void> {
    const existing = this.queue.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queue.set(key, next);
    await existing;
    return release;
  }
}
