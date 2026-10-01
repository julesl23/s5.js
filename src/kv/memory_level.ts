import { MemoryLevel } from "memory-level";
import { KeyValueStore } from "./kv.js";

export class MemoryLevelStore implements KeyValueStore {
    static async open(): Promise<MemoryLevelStore> {
        const db = new MemoryLevel<Uint8Array, Uint8Array>({
            keyEncoding: 'view',
            valueEncoding: 'view',
            storeEncoding: 'view',
        })
        return new MemoryLevelStore(db);
    }
    private readonly db: MemoryLevel<Uint8Array, Uint8Array>;
    constructor(db: MemoryLevel<Uint8Array, Uint8Array>) {
        this.db = db;
    }
    async put(key: Uint8Array, value: Uint8Array): Promise<void> {
        await this.db.put(key, value);
    }
    async get(key: Uint8Array): Promise<Uint8Array | undefined> {
        return await this.db.get(key);
    }
    async contains(key: Uint8Array): Promise<boolean> {
        return await this.db.has(key);
    }

    // memory-level's get/put are asynchronous, so a get→put pair interleaves with a concurrent
    // one in the same process: both read the old value, both pass, both write. Chain every
    // compare-and-put through one promise so they run one at a time.
    private putIfNewerTail: Promise<unknown> = Promise.resolve();

    putIfNewer(
        key: Uint8Array,
        value: Uint8Array,
        isNewer: (existing: Uint8Array | undefined) => boolean,
    ): Promise<boolean> {
        const run = this.putIfNewerTail.then(async () => {
            if (!isNewer(await this.db.get(key))) return false;
            await this.db.put(key, value);
            return true;
        });
        // The next call waits for this one whether it succeeds or throws.
        this.putIfNewerTail = run.catch(() => {});
        return run;
    }
}