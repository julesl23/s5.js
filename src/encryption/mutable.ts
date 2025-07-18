import { CryptoImplementation } from "../api/crypto.js";
import { decodeLittleEndian, encodeLittleEndian } from "../util/little_endian.js";
import { checkPaddedBlock, padFileSize } from "./padding.js";

const encryptionNonceLength = 24;
const encryptionOverheadLength = 16;
const encryptionKeyLength = 32;

export async function encryptMutableBytes(data: Uint8Array, key: Uint8Array, crypto: CryptoImplementation): Promise<Uint8Array> {
    const lengthBytes = encodeLittleEndian(
        data.length,
        4,
    );

    const totalOverhead =
        encryptionOverheadLength + 4 + encryptionNonceLength + 2;

    const finalSize =
        padFileSize(data.length + totalOverhead) - totalOverhead;

    data = new Uint8Array([
        ...lengthBytes, ...data, ...new Uint8Array(finalSize - data.length),
    ]);

    const nonce = crypto.generateSecureRandomBytes(encryptionNonceLength);

    const encryptedBytes = await crypto.encryptXChaCha20Poly1305(
        key,
        nonce,
        data,
    );

    const header = [0x8d, 0x01, ...nonce];

    return new Uint8Array([...header, ...encryptedBytes]);
}



export async function decryptMutableBytes(data: Uint8Array, key: Uint8Array, crypto: CryptoImplementation): Promise<Uint8Array> {
    if (key.length !== encryptionKeyLength) {
        throw new Error(`wrong encryptionKeyLength (${key.length} != ${encryptionKeyLength})`);
    }
    // Validate that the size of the data corresponds to a padded block
    if (!checkPaddedBlock(data.length)) {
        throw new Error(`Expected parameter 'data' to be padded encrypted data, length was '${data.length}', nearest padded block is '${padFileSize(data.length)}'`);
    }
    const version = data[1];
    if (version != 0x01) {
        throw new Error('Invalid encrypted data version');
    }

    const nonce = data.subarray(2, encryptionNonceLength + 2);
    const decryptedBytes = await crypto.decryptXChaCha20Poly1305(
        key,
        nonce,
        data.subarray(
            encryptionNonceLength + 2,
        ),
    );

    const length = decodeLittleEndian(decryptedBytes.subarray(0, 4));
    return decryptedBytes.subarray(4, length + 4);
}