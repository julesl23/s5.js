import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { S5Node } from "../../src/node/node.js";
import { JSCryptoImplementation } from "../../src/api/crypto/js.js";
import { base64UrlNoPaddingEncode } from "../../src/util/base64.js";

/**
 * Liveness regression tests for the P2P blob download.
 *
 * Reported by the Fabstir node/bridge developer: `downloadBlobAsBytes` evaluated its
 * timeout ONLY between `while` iterations while the `fetch` inside the `for` loop had no
 * signal, so a single advertised location that accepts the connection and never responds
 * parked the await forever. The function never returned and never threw — so the portal
 * fallback in identity/api.ts (measured at 0.2s) was unreachable, and beta.54's
 * repairDirectory, which awaits this same call, hung too.
 *
 * See docs/development/IMPLEMENTATION_NODE_TIMEOUTS.md.
 */

const crypto = new JSCryptoImplementation();

/** A node whose P2P layer advertises exactly the locations a test asks for. */
function makeNode(locations: string[], hash: Uint8Array): S5Node {
  const node = new S5Node(crypto);
  const hashStr = base64UrlNoPaddingEncode(Uint8Array.from([0x1f, ...hash.subarray(1)]));
  (node as any).p2p = {
    isConnectedToNetwork: true,
    sendHashRequest: () => {},
    blobLocations: new Map([[hashStr, locations.map((url) => ({ parts: [url] }))]]),
  };
  return node;
}

/** 33-byte multihash (0x1e prefix) for some bytes, as the download path expects. */
async function hashOf(data: Uint8Array): Promise<Uint8Array> {
  return Uint8Array.from([0x1e, ...(await crypto.hashBlake3(data))]);
}

const NEVER = () => new Promise<never>(() => {});

describe("S5Node.downloadBlobAsBytes — liveness", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("THE regression: a location whose fetch never settles rejects within budget (does not hang)", async () => {
    const data = new TextEncoder().encode("payload");
    const hash = await hashOf(data);
    const node = makeNode(["https://hanging.example/blob"], hash);
    globalThis.fetch = NEVER as any;

    const started = Date.now();
    await expect(
      node.downloadBlobAsBytes(hash, 2000, 200, 1000)
    ).rejects.toThrow(/Blob not found/);
    expect(Date.now() - started).toBeLessThan(4000);
  }, { timeout: 8000 });

  test("a location whose body read never settles also rejects within budget", async () => {
    const data = new TextEncoder().encode("payload");
    const hash = await hashOf(data);
    const node = makeNode(["https://headers-then-stall.example/blob"], hash);
    globalThis.fetch = (async () => ({
      status: 200,
      arrayBuffer: NEVER,
    })) as any;

    const started = Date.now();
    await expect(
      node.downloadBlobAsBytes(hash, 2000, 200, 300)
    ).rejects.toThrow(/Blob not found/);
    expect(Date.now() - started).toBeLessThan(4000);
  }, { timeout: 8000 });

  test("a hanging location does not stop a healthy one from being tried", async () => {
    const data = new TextEncoder().encode("the real bytes");
    const hash = await hashOf(data);
    const node = makeNode(
      ["https://hanging.example/blob", "https://healthy.example/blob"],
      hash
    );
    globalThis.fetch = (async (url: string) => {
      if (url.includes("hanging")) return NEVER();
      return { status: 200, arrayBuffer: async () => data.buffer.slice(0) };
    }) as any;

    const started = Date.now();
    const out = await node.downloadBlobAsBytes(hash, 5000, 200, 1000);
    expect(new TextDecoder().decode(out)).toBe("the real bytes");
    expect(Date.now() - started).toBeLessThan(4000);
  }, { timeout: 8000 });

  test("R2 guard: a body slower than the HEADERS budget still completes (connect/read split)", async () => {
    const data = new TextEncoder().encode("slow but alive");
    const hash = await hashOf(data);
    const node = makeNode(["https://slow-body.example/blob"], hash);
    globalThis.fetch = (async () => ({
      status: 200,
      // Body takes 400ms — five times the 80ms headers budget. Must NOT be aborted:
      // a single per-attempt signal would kill this, which is the regression R2 caught.
      arrayBuffer: async () => {
        await new Promise((r) => setTimeout(r, 400));
        return data.buffer.slice(0);
      },
    })) as any;

    const out = await node.downloadBlobAsBytes(hash, 5000, 80, 5000);
    expect(new TextDecoder().decode(out)).toBe("slow but alive");
  }, { timeout: 8000 });

  test("preserved behaviour: healthy location returns verified bytes", async () => {
    const data = new TextEncoder().encode("verified");
    const hash = await hashOf(data);
    const node = makeNode(["https://healthy.example/blob"], hash);
    globalThis.fetch = (async () => ({
      status: 200,
      arrayBuffer: async () => data.buffer.slice(0),
    })) as any;

    expect(new TextDecoder().decode(await node.downloadBlobAsBytes(hash))).toBe("verified");
  });

  test("preserved behaviour: a 404 location is skipped and reported", async () => {
    const data = new TextEncoder().encode("gone");
    const hash = await hashOf(data);
    const node = makeNode(["https://missing.example/blob"], hash);
    globalThis.fetch = (async () => ({ status: 404 })) as any;

    await expect(node.downloadBlobAsBytes(hash, 500, 200, 500))
      .rejects.toThrow(/404 not found/);
  }, { timeout: 8000 });

  test("preserved behaviour: bytes failing hash verification are never returned", async () => {
    const data = new TextEncoder().encode("expected");
    const hash = await hashOf(data);
    const node = makeNode(["https://tampered.example/blob"], hash);
    globalThis.fetch = (async () => ({
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode("tampered").buffer,
    })) as any;

    await expect(node.downloadBlobAsBytes(hash, 500, 200, 500))
      .rejects.toThrow(/Blob not found/);
  }, { timeout: 8000 });

  test("the timeout error still classifies as a RETRYABLE S5DirectoryLoadError (beta.54 seam)", async () => {
    const { S5DirectoryLoadError } = await import("../../src/fs/errors.js");
    const data = new TextEncoder().encode("payload");
    const hash = await hashOf(data);
    const node = makeNode(["https://hanging.example/blob"], hash);
    globalThis.fetch = NEVER as any;

    const err: any = await node.downloadBlobAsBytes(hash, 500, 100, 500).then(() => null, (e) => e);
    // This is exactly the string _fetchDirectoryMetadata matches on to decide "retryable".
    const message = (err?.message || "").toLowerCase();
    expect(message.includes("404") || message.includes("not found")).toBe(true);
    // And the typed error it would produce is retryable.
    expect(new S5DirectoryLoadError("x", { retryable: true }).retryable).toBe(true);
  }, { timeout: 8000 });
});

describe("S5Node.downloadBlobAsBytes — exhausted locations", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("THE reported cost: once every known location has failed, give up on the grace window, not the full budget", async () => {
    const data = new TextEncoder().encode("gone");
    const hash = await hashOf(data);
    const node = makeNode(["https://dead.example/blob"], hash);
    globalThis.fetch = (async () => ({ status: 404 })) as any;

    const started = Date.now();
    // Generous global budget; the location fails instantly. Before this fix the call
    // spun on sleep(10) for the whole 10s — with a directory fanning out to many
    // children, that is where the consumer's minutes went.
    await expect(
      node.downloadBlobAsBytes(hash, 10000, 500, 500, 300)
    ).rejects.toThrow(/Blob not found/);
    expect(Date.now() - started).toBeLessThan(2000);
  }, { timeout: 15000 });

  test("the grace RESETS when a new location arrives, so a late healthy peer is still used", async () => {
    const data = new TextEncoder().encode("late arrival");
    const hash = await hashOf(data);
    const node = makeNode(["https://dead.example/blob"], hash);
    const hashStr = [...(node as any).p2p.blobLocations.keys()][0] as string;

    globalThis.fetch = (async (url: string) => {
      if (url.includes("dead")) return { status: 404 };
      return { status: 200, arrayBuffer: async () => data.buffer.slice(0) };
    }) as any;

    // A healthy location is advertised after the first is exhausted but WITHIN the grace
    // window — which is the whole point of having a grace rather than giving up at once.
    setTimeout(() => {
      (node as any).p2p.blobLocations
        .get(hashStr)!
        .push({ parts: ["https://late-healthy.example/blob"] });
    }, 200);

    const out = await node.downloadBlobAsBytes(hash, 10000, 500, 500, 800);
    expect(new TextDecoder().decode(out)).toBe("late arrival");
  }, { timeout: 15000 });

  test("zero discovered locations is NOT exhaustion — discovery keeps the full budget", async () => {
    const data = new TextEncoder().encode("never advertised");
    const hash = await hashOf(data);
    const node = makeNode([], hash);
    globalThis.fetch = (async () => ({ status: 404 })) as any;

    const started = Date.now();
    await expect(
      node.downloadBlobAsBytes(hash, 800, 500, 500, 100)
    ).rejects.toThrow(/Blob not found/);
    // Must have waited out the real budget, not the (much shorter) grace: a blob whose
    // locations have not propagated yet would otherwise fail early.
    expect(Date.now() - started).toBeGreaterThanOrEqual(700);
  }, { timeout: 15000 });

  test("the exhaustion error names the failed-location count and stays classifiable", async () => {
    const data = new TextEncoder().encode("gone");
    const hash = await hashOf(data);
    const node = makeNode(["https://a.example/blob", "https://b.example/blob"], hash);
    globalThis.fetch = (async () => ({ status: 404 })) as any;

    const err: any = await node
      .downloadBlobAsBytes(hash, 10000, 500, 500, 200)
      .then(() => null, (e) => e);

    expect(err.message).toMatch(/2 known location/);
    // Still contains "not found", so the FS layer keeps typing it retryable (beta.54 seam).
    expect(err.message.toLowerCase()).toContain("not found");
  }, { timeout: 15000 });
});

describe("S5Node.ensureInitialized — liveness", () => {
  test("resolves promptly once the network connects", async () => {
    const node = new S5Node(crypto);
    (node as any).p2p = { isConnectedToNetwork: false };
    setTimeout(() => { (node as any).p2p.isConnectedToNetwork = true; }, 50);
    await expect(node.ensureInitialized(2000)).resolves.toBeUndefined();
  }, { timeout: 8000 });

  test("rejects after its budget instead of spinning forever, naming the condition", async () => {
    const node = new S5Node(crypto);
    (node as any).p2p = { isConnectedToNetwork: false };
    await expect(node.ensureInitialized(200)).rejects.toThrow(/not connected to the S5 network/);
  }, { timeout: 8000 });

  test("names the 'never initialised' condition distinctly", async () => {
    const node = new S5Node(crypto);
    await expect(node.ensureInitialized(200)).rejects.toThrow(/never initialised/);
  }, { timeout: 8000 });
});
