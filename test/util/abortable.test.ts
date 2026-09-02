import { describe, test, expect } from "vitest";
import { getEventListeners } from "node:events";
import { abortable } from "../../src/util/abortable.js";

/**
 * `abortable` guarantees OUR function returns when a signal fires, without
 * depending on the runtime aborting an in-flight body stream for us. See
 * docs/development/IMPLEMENTATION_NODE_TIMEOUTS.md, design decision 2.
 */
describe("abortable", () => {
  test("resolves with the underlying value when the promise wins", async () => {
    const ac = new AbortController();
    await expect(abortable(Promise.resolve("ok"), ac.signal)).resolves.toBe("ok");
  });

  test("rejects with the underlying error when the promise rejects first", async () => {
    const ac = new AbortController();
    await expect(abortable(Promise.reject(new Error("boom")), ac.signal)).rejects.toThrow("boom");
  });

  test("rejects as soon as the signal fires, even though the promise never settles", async () => {
    const ac = new AbortController();
    const never = new Promise<never>(() => {});
    const p = abortable(never, ac.signal);
    ac.abort(new Error("aborted by test"));
    await expect(p).rejects.toThrow("aborted by test");
  });

  test("rejects immediately for an already-aborted signal", async () => {
    const ac = new AbortController();
    ac.abort(new Error("already gone"));
    await expect(abortable(new Promise<never>(() => {}), ac.signal)).rejects.toThrow("already gone");
  });

  test("a promise rejecting AFTER the signal fired produces no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    try {
      const ac = new AbortController();
      let rejectLate!: (e: Error) => void;
      const late = new Promise<never>((_, rej) => { rejectLate = rej; });
      const p = abortable(late, ac.signal);
      ac.abort(new Error("abort first"));
      await expect(p).rejects.toThrow("abort first");
      rejectLate(new Error("late rejection nobody awaits"));
      // Give the microtask queue and the unhandled-rejection check a chance to fire.
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  test("removes its abort listener once settled (no leak on a long-lived signal)", async () => {
    const ac = new AbortController();
    for (let i = 0; i < 50; i++) await abortable(Promise.resolve(i), ac.signal);
    // Node exposes listener counts on AbortSignal via the events shim.
    expect(getEventListeners(ac.signal, "abort").length).toBe(0);
  });
});
