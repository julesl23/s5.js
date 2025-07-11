import { expect, test, describe } from "vitest";
import { bytesToHex } from "@noble/hashes/utils";
import { FS5Directory, FS5DirectoryReference, FS5FileReference } from "../src/fs/directory";

describe("registry", async () => {
    test("serialization 1", async () => {
        const directory = new FS5Directory({}, {}, {});
        const bytes = directory.serialize();
        expect(bytesToHex(bytes)).toBe("5f5d808080");
        const deserializedDirectory = FS5Directory.deserialize(bytes);
        expect(bytesToHex(bytes)).toBe(bytesToHex(deserializedDirectory.serialize()));
    });
    test("serialization 2", async () => {
        const timestamp = BigInt(5050505050505);
        const directory = new FS5Directory({}, {
            "directory name": new FS5DirectoryReference(
                {
                    1: "directory name",
                    2: timestamp,
                    4: new Uint8Array(
                        [0x01, ...new Uint8Array(24), ...new Uint8Array(32 + 16)],
                    ),
                    3: new Uint8Array(33),
                    5: new Uint8Array(32),
                }
            )
        }, {
            "file.txt": new FS5FileReference(
                {
                    1: "file.txt",
                    2: timestamp,
                    6: "text/plain",
                    5: 0,
                    4: {
                        
                        2: new Uint8Array([0x26, 0x1e, ...new Uint8Array(32), 55]),
                        8: timestamp,
                    },
                }
            )
        });
        const bytes = directory.serialize();
        expect(bytesToHex(bytes)).toBe("5f5d8081ae6469726563746f7279206e616d6585a131ae6469726563746f7279206e616d65a132d300000497e98f3989a133c421000000000000000000000000000000000000000000000000000000000000000000a134c44901000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a135c420000000000000000000000000000000000000000000000000000000000000000081a866696c652e74787485a131a866696c652e747874a132d300000497e98f3989a13482a132c423261e000000000000000000000000000000000000000000000000000000000000000037a138d300000497e98f3989a13500a136aa746578742f706c61696e");
        const deserializedDirectory = FS5Directory.deserialize(bytes);
        expect(bytesToHex(bytes)).toBe(bytesToHex(deserializedDirectory.serialize()));
    });
});