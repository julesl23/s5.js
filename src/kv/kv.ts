export interface KeyValueStore {
    put(key: Uint8Array, value: Uint8Array): Promise<void>;
    get(key: Uint8Array): Promise<Uint8Array | undefined>;
    contains(key: Uint8Array): Promise<boolean>;
}