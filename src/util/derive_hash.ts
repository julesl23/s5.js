///
/// This implementation follows the S5 v1 spec at https://docs.sfive.net/spec/key-derivation.html
///

import { CryptoImplementation } from "../api/crypto";
import { encodeLittleEndian } from "./little_endian";

export function deriveHashString(
    base: Uint8Array,
    tweak: Uint8Array,
    crypto: CryptoImplementation,
): Uint8Array {
    if (base.length != 32) {
        throw 'Invalid base length';
    }
    return crypto.hashBlake3Sync(
        new Uint8Array([
            ...base, ...crypto.hashBlake3Sync(tweak),
        ]),
    );
}

export function deriveHashInt(
    base: Uint8Array,
    tweak: number,
    crypto: CryptoImplementation,
): Uint8Array {
    if (base.length != 32) {
        throw 'Invalid base length';
    }
    return crypto.hashBlake3Sync(
        new Uint8Array([
            ...base, ...encodeLittleEndian(tweak, 32),
        ]),
    );
}
