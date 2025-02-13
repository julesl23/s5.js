import * as msgpackr from 'msgpackr';
import { decodeLittleEndian } from '../util/little_endian';
import { base64UrlNoPaddingEncode } from '../util/base64';

export class FS5Directory {
    header: FS5DirectoryHeader;
    directories: { [key: string]: FS5DirectoryReference };
    files: { [key: string]: FS5FileReference };

    constructor(header: FS5DirectoryHeader, directories: { [key: string]: FS5DirectoryReference }, files: { [key: string]: FS5FileReference }) {
        this.header = header;
        this.directories = directories;
        this.files = files;
    }

    static deserialize(data: Uint8Array): FS5Directory {
        const res = msgpackr.unpack(data.subarray(2));
        const dirs = {};
        for (const key of Object.keys(res[1])) {
            dirs[key] = new FS5DirectoryReference(res[1][key]);
        }
        const files = {};
        for (const key of Object.keys(res[2])) {
            files[key] = new FS5FileReference(res[2][key]);
        }
        return new FS5Directory(res[0], dirs, files);
    }
}

interface FS5DirectoryHeader {

}

class FS5DirectoryReference {
    private readonly data: FS5DirectoryReferenceData;
    constructor(data: FS5DirectoryReferenceData) {
        this.data = data;
    };

    get created(): BigInt {
        return this.data[2];
    }

    get name(): string {
        return this.data[1];
    }

    get encryptedWriteKey(): Uint8Array {
        return this.data[4];
    }

    get publicKey(): Uint8Array {
        return this.data[3];
    }

    get encryptionKey(): Uint8Array | undefined {
        return this.data[5];
    }
}

interface FS5DirectoryReferenceData {
    1: string,
    2: BigInt,
    3: Uint8Array,
    4: Uint8Array,
    5: Uint8Array | undefined,
}

class FS5FileReference {
    private readonly data: FS5FileReferenceData;
    constructor(data: FS5FileReferenceData) {
        this.data = data;
    };

    get name(): string {
        return this.data[1];
    }
    get created(): BigInt {
        return this.data[2];
    }
    get modified(): BigInt {
        return this.data[4][8];
    }

    get cidString(): string {
        const cid = this.data[4][1] ?? this.data[4][2];
        return 'u' + base64UrlNoPaddingEncode(cid);
    }

    get mediaType(): string | undefined {
        return this.data[6];
    }

    get size(): number {
        const cid = this.data[4][1]?.subarray(72) ?? this.data[4][2];
        return decodeLittleEndian(cid.subarray(34));
    }
}
interface FS5FileReferenceData {
    1: string,
    2: BigInt,
    4: FS5FileVersionData,
    5: number,
    6: string | undefined,
}

interface FS5FileVersionData {

}