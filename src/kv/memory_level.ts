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
}