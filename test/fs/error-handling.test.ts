import { describe, test, expect, beforeEach, vi } from "vitest";
import { FS5 } from "../../src/fs/fs5.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";

// Reuse mock pattern from path-api-simple.test.ts
class SimpleMockAPI {
  crypto: JSCryptoImplementation;
  private blobs: Map<string, Uint8Array> = new Map();
  private registry: Map<string, any> = new Map();

  constructor() {
    this.crypto = new JSCryptoImplementation();
  }

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    const fullHash = new Uint8Array([0x1e, ...hash]);
    const key = Buffer.from(hash).toString("hex");
    this.blobs.set(key, data);
    return { hash: fullHash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString("hex");
    const data = this.blobs.get(key);
    if (!data) throw new Error(`Blob not found: ${key}`);
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString("hex");
    return this.registry.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString("hex");
    this.registry.set(key, entry);
  }
}

class SimpleMockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

describe("Error Handling in runTransactionOnDirectory", () => {
  let fs: FS5;
  let api: SimpleMockAPI;

  beforeEach(() => {
    api = new SimpleMockAPI();
    const identity = new SimpleMockIdentity();
    fs = new FS5(api as any, identity as any);
  });

  // V8 produces "e?.stack?.split is not a function" when .split() is called
  // on a truthy non-string .stack value. This substring check is engine-specific
  // but matches the exact bug report.
  describe("Bug 2: non-string .stack does not cause secondary TypeError", () => {
    test.each([
      ["non-string stack", { message: "portal error", stack: 42 }],
      ["plain string", "network timeout"],
    ])("error thrown as %s does not crash catch block", async (_label, rejection) => {
      vi.spyOn(api, "registrySet").mockRejectedValue(rejection);

      const error: any = await fs.put("home/test.txt", "data").catch((e: any) => e);
      expect(error).toBeDefined();
      expect(String(error?.message || "")).not.toContain("split is not a function");
    });
  });

  describe("Bug 1b: revision-conflict retry with non-standard errors", () => {
    test("string revision error triggers retry and succeeds", async () => {
      // mockRejectedValueOnce: first registrySet rejects, subsequent calls
      // fall through to the original implementation (vi.spyOn preserves it).
      vi.spyOn(api, "registrySet").mockRejectedValueOnce(
        "Revision number too low"
      );

      // Before fix: string e has no .message, so revision detection fails,
      // retry is skipped, and put() throws.
      // After fix: string is detected as revision error, retry succeeds.
      await expect(fs.put("home/test.txt", "data")).resolves.toBeUndefined();
    });

    test("Error instance revision error triggers retry and succeeds", async () => {
      vi.spyOn(api, "registrySet").mockRejectedValueOnce(
        new Error("Revision number too low")
      );

      // This already works — proper Error has .message for detection.
      await expect(fs.put("home/test.txt", "data")).resolves.toBeUndefined();
    });
  });

  describe("Bug 1a: createFile throws Error instance, not raw string", () => {
    test("duplicate filename throws Error instance", async () => {
      // Create file first via put() so the directory has 'test.txt'
      await fs.put("home/test.txt", "data");

      // createFile() on the same name should throw — verify it's a proper Error
      const error: any = await fs
        .createFile("home", "test.txt", { ts: Date.now(), data: null })
        .catch((e: any) => e);

      // DirectoryTransactionResult.e holds the original thrown value
      expect(error.e).toBeInstanceOf(Error);
    });

    test("duplicate filename error message contains 'same name'", async () => {
      await fs.put("home/test.txt", "data");

      const error: any = await fs
        .createFile("home", "test.txt", { ts: Date.now(), data: null })
        .catch((e: any) => e);

      const msg = error?.e?.message || error?.e || String(error);
      expect(msg).toContain("same name");
    });
  });
});
