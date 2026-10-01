import { IDBPDatabase, openDB } from "idb";
import { KeyValueStore } from "./kv.js";

export class IDBStore implements KeyValueStore {
    static async open(name: string): Promise<IDBStore> {
        const db = await openDB<Uint8Array>(name, 1, {
            upgrade(db) {
                db.createObjectStore('kv');
            },
        });
        return new IDBStore(db);
    }
    private readonly db: IDBPDatabase<Uint8Array>;

    constructor(db: IDBPDatabase<Uint8Array>) {
        this.db = db;
    }

    async put(key: Uint8Array, value: Uint8Array): Promise<void> {
        await this.db.put("kv", value, Array.from(key));
    }
    async get(key: Uint8Array): Promise<Uint8Array | undefined> {
        return await this.db.get("kv", Array.from(key));
    }
    async contains(key: Uint8Array): Promise<boolean> {
        return (await this.get(key)) !== undefined;
    }

    /**
     * One `readwrite` transaction: get, compare, put. IndexedDB serialises readwrite
     * transactions on overlapping scopes across every connection of the origin, so this is
     * atomic between tabs — a check in one transaction and a write in another is not.
     */
    async putIfNewer(
        key: Uint8Array,
        value: Uint8Array,
        isNewer: (existing: Uint8Array | undefined) => boolean,
    ): Promise<boolean> {
        const tx = this.db.transaction("kv", "readwrite");
        const k = Array.from(key);
        let newer: boolean;
        try {
            newer = isNewer(await tx.store.get(k));
        } catch (e) {
            // A throw after an await does not abort the transaction by itself.
            tx.abort();
            await tx.done.catch(() => {});
            throw e;
        }
        if (!newer) {
            await tx.done;
            return false;
        }
        try {
            await tx.store.put(value, k);
        } catch (e) {
            // The failed request aborts the transaction, so `tx.done` rejects too: observe it,
            // or it surfaces as an unhandled rejection.
            await tx.done.catch(() => {});
            throw e;
        }
        // Only report success once committed: a queued write can still abort (e.g. quota).
        await tx.done;
        return true;
    }
}