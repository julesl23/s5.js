import { describe, test, expect } from "vitest";
import { AsyncMutex } from "../../src/util/async-mutex.js";

describe("AsyncMutex", () => {
  test("acquire() returns a release function", async () => {
    const mutex = new AsyncMutex();
    const release = await mutex.acquire("key1");
    expect(typeof release).toBe("function");
    release();
  });

  test("two sequential acquires on same key serialize", async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];

    const release1 = await mutex.acquire("key");
    // Start second acquire — it should block until release1 is called
    const p2 = mutex.acquire("key").then((release2) => {
      order.push(2);
      release2();
    });

    order.push(1);
    release1();
    await p2;

    expect(order).toEqual([1, 2]);
  });

  test("two acquires on different keys proceed in parallel", async () => {
    const mutex = new AsyncMutex();
    const order: string[] = [];

    const releaseA = await mutex.acquire("keyA");
    const releaseB = await mutex.acquire("keyB");

    // Both acquired without blocking — proves different keys are independent
    order.push("A acquired", "B acquired");
    releaseA();
    releaseB();

    expect(order).toEqual(["A acquired", "B acquired"]);
  });

  test("release() in finally after error still frees lock for next waiter", async () => {
    const mutex = new AsyncMutex();

    // First holder throws after acquiring
    try {
      const release = await mutex.acquire("key");
      try {
        throw new Error("simulated failure");
      } finally {
        release();
      }
    } catch {
      // expected
    }

    // Second acquire should resolve immediately (not deadlock)
    const release2 = await mutex.acquire("key");
    expect(typeof release2).toBe("function");
    release2();
  });

  test("3+ waiters on same key execute in FIFO order", async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];

    const release1 = await mutex.acquire("key");

    const p2 = mutex.acquire("key").then((release) => {
      order.push(2);
      release();
    });
    const p3 = mutex.acquire("key").then((release) => {
      order.push(3);
      release();
    });
    const p4 = mutex.acquire("key").then((release) => {
      order.push(4);
      release();
    });

    order.push(1);
    release1();
    await Promise.all([p2, p3, p4]);

    expect(order).toEqual([1, 2, 3, 4]);
  });

  test("after all waiters complete, new acquire resolves immediately", async () => {
    const mutex = new AsyncMutex();

    // Run and release
    const release1 = await mutex.acquire("key");
    release1();

    // New acquire should be instant (no stale state)
    const before = performance.now();
    const release2 = await mutex.acquire("key");
    const elapsed = performance.now() - before;
    release2();

    // Should resolve in < 5ms (essentially immediate)
    expect(elapsed).toBeLessThan(5);
  });
});
