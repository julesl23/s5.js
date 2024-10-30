export function encodeLittleEndian(value: number, length: number): Uint8Array {
    const buffer = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = value & 0xFF;
        value = value >> 8;
    }
    return buffer;
}

export function decodeLittleEndian(bytes: Uint8Array): number {
    let total = 0;
    for (let i = 0; i < bytes.length; i++) {
        total += bytes[i] * Math.pow(256, i);
    }
    return total;
}
