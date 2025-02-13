import { IDBPDatabase, openDB } from "idb";
import { KeyValueStore } from "./kv";

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
        await this.db.put("kv", value, key);
    }
    async get(key: Uint8Array): Promise<Uint8Array | undefined> {
        return await this.db.get("kv", key);
    }
    async contains(key: Uint8Array): Promise<boolean> {
        return (await this.get(key)) !== undefined;
    }

}