export interface RegistryEntry {
    /// public key with multicodec prefix
    pk: Uint8Array;
    /// revision number of this entry, maximum is (256^8)-1
    revision: number;
    /// data stored in this entry, can have a maximum length of 48 bytes
    data: Uint8Array;
    /// signature of this registry entry
    signature: Uint8Array;
}
