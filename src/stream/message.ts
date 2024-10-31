export interface StreamMessage {
    /// public key with multicodec prefix
    pk: Uint8Array;
    /// revision number of this message, maximum is (256^8)-1
    /// usually consists of a u32 timestamp and a u32 sequence number
    revision: number;
    /// hash of the data payload
    hash: Uint8Array;
    /// signature of this message
    signature: Uint8Array;
    /// data payload bytes
    data?: Uint8Array;
}
