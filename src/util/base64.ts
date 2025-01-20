import { base64url } from "multiformats/bases/base64";

export function base64UrlNoPaddingEncode(input: Uint8Array): String {
    return base64url.encode(input);
}

export function base64UrlNoPaddingDecode(input: string): Uint8Array {
    return base64url.decode(input);
}