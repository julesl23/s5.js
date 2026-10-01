export interface KeyValueStore {
    put(key: Uint8Array, value: Uint8Array): Promise<void>;
    get(key: Uint8Array): Promise<Uint8Array | undefined>;
    contains(key: Uint8Array): Promise<boolean>;

    /**
     * Atomic compare-and-put: read the current value, ask `isNewer(existing)`, and write
     * `value` only if it returns true — as ONE step no other writer can interleave with.
     * Resolves `true` when written, `false` when refused. If `isNewer` throws, nothing is
     * written and the call rejects with that error.
     *
     * `isNewer` must be synchronous: in `IDBStore` it runs inside the transaction, and any
     * non-IndexedDB `await` there would auto-commit it.
     *
     * Optional so caller-supplied stores (`S5Node.init(openKeyValueStore)`) keep compiling;
     * the registry falls back to a non-atomic get→check→put for stores without it.
     */
    putIfNewer?(
        key: Uint8Array,
        value: Uint8Array,
        isNewer: (existing: Uint8Array | undefined) => boolean,
    ): Promise<boolean>;
}
