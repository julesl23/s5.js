import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { base32 } from "multiformats/bases/base32";
import { base58btc } from "multiformats/bases/base58";
import { base64url } from "multiformats/bases/base64";

export default abstract class Multibase {
    abstract toBytes(): Uint8Array;

    static decodeString(data: string): Uint8Array {
        if (data[0] === "z") {
            return base58btc.decode(data);
        } else if (data[0] === "f") {
            return Uint8Array.from(hexToBytes(data.substring(1)));
        } else if (data[0] === "b") {
            let str = data;
            while (str.length % 4 !== 0) {
                str += "=";
            }
            return base32.decode(str);
        } else if (data[0] === "u") {
            return base64url.decode(data);
        } else {
            throw new Error(`Multibase encoding ${data[0]} not supported`);
        }
    }

    toHex(): string {
        return `f${bytesToHex(this.toBytes())}`;
    }

    toBase32(): string {
        return `${base32.encode(this.toBytes()).replace(/=/g, "").toLowerCase()}`;
    }

    toBase64Url(): string {
        return base64url.encode(this.toBytes());
    }

    toBase58(): string {
        return base58btc.encode(this.toBytes());
    }

    toString(): string {
        return this.toBase32();
    }
}
