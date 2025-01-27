import { CryptoImplementation, KeyPairEd25519 } from "../api/crypto";
import { RECORD_TYPE_REGISTRY_ENTRY } from "../constants";
import { decodeLittleEndian, encodeLittleEndian } from "../util/little_endian";

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

export function serializeRegistryEntry(entry: RegistryEntry): Uint8Array {
    return new Uint8Array([
        RECORD_TYPE_REGISTRY_ENTRY,
        ...entry.pk,
        ...encodeLittleEndian(entry.revision, 8),
        entry.data.length,
        ...entry.data,
        ...entry.signature,
    ]);
}

export function deserializeRegistryEntry(data: Uint8Array): RegistryEntry {
    const dataLength = data[42];
    return {
        pk: data.subarray(1, 34),
        revision: decodeLittleEndian(data.subarray(34, 42)),
        data: data.subarray(43, 43 + dataLength),
        signature: data.subarray(43 + dataLength),
    };
}

export async function createRegistryEntry(keyPair: KeyPairEd25519,
    data: Uint8Array,
    revision: number, crypto: CryptoImplementation,
): Promise<RegistryEntry> {
    const signature = await crypto.signEd25519(
        keyPair,
        new Uint8Array([
            RECORD_TYPE_REGISTRY_ENTRY,
            ...encodeLittleEndian(revision, 8),
            data.length, // 1 byte
            ...data,
        ])
    );
    return {
        pk: keyPair.publicKey,
        revision: revision,
        data: data,
        signature: signature,
    };
}

export function verifyRegistryEntry(entry: RegistryEntry, crypto: CryptoImplementation): Promise<boolean> {
    return crypto.verifyEd25519(
        entry.pk.subarray(1),
        new Uint8Array([
            RECORD_TYPE_REGISTRY_ENTRY,
            ...encodeLittleEndian(entry.revision, 8),
            entry.data.length, // 1 byte
            ...entry.data,
        ]),
        entry.signature,
    );
}