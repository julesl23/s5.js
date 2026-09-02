/**
 * Settle with `promise`, or reject the moment `signal` fires — whichever happens first.
 *
 * Every network call in this library used to be able to hang forever: a peer that accepts
 * the connection and never responds parks the `await` indefinitely, so the caller neither
 * returns nor throws, and every downstream recovery path (portal fallback, retry, repair)
 * becomes unreachable. Passing an `AbortSignal` to `fetch` covers the request, and per the
 * WHATWG spec aborting after headers arrive also errors the body stream — but relying on
 * that alone is a spec-nuance bet on every runtime we ship to. This helper makes the
 * guarantee ours: the signal still aborts the real socket, and this races it so that *our*
 * function is guaranteed to return.
 *
 * Rejects with `signal.reason`, so an `AbortController.abort(new Error("..."))` carries a
 * diagnostic message through to the caller.
 */
export function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // We are abandoning `promise`; adopt its outcome so a later rejection cannot surface
    // as an unhandled rejection (which, among other things, makes vitest exit non-zero).
    Promise.resolve(promise).catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    // Always attach both handlers: if the signal won the race these are no-ops on an
    // already-settled promise, but they still mark `promise` as handled.
    Promise.resolve(promise).then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); }
    );
  });
}
