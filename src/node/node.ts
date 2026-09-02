import { CryptoImplementation } from "../api/crypto.js";
import { S5APIInterface } from "../api/s5.js";
import { BlobIdentifier } from "../identifier/blob.js";
import { KeyValueStore } from "../kv/kv.js";
import { RegistryEntry } from "../registry/entry.js";
import { StreamMessage } from "../stream/message.js";
import { areArraysEqual } from "../util/arrays.js";
import { base64UrlNoPaddingEncode } from "../util/base64.js";
import { debug } from "../util/debug.js";
import { abortable } from "../util/abortable.js";
import { P2P } from "./p2p.js";
import { S5RegistryService } from "./registry.js";

type OpenKeyValueStoreFunction = (name: string) => Promise<KeyValueStore>;

export class S5Node implements S5APIInterface {
    readonly crypto: CryptoImplementation;
    p2p!: P2P;
    registry!: S5RegistryService;
    private blobDB!: KeyValueStore;

    constructor(crypto: CryptoImplementation) {
        this.crypto = crypto;
    }

    async init(openKeyValueStore: OpenKeyValueStoreFunction): Promise<void> {
        debug.node('S5Node.init() - s5.js beta.36');
        const p2p = await P2P.create(this.crypto);
        this.blobDB = await openKeyValueStore("s5_blob");
        const registryDB = await openKeyValueStore("s5_registry");
        this.p2p = p2p;
        this.registry = new S5RegistryService(p2p, registryDB);
        p2p.registry = this.registry;
    }

    /**
     * Block until the node is connected to the S5 network.
     *
     * Bounded: this used to spin forever, so a consumer whose network never came up hung
     * at `S5.create()` with no error to act on (`src/server.ts` already worked around it
     * with its own `Promise.race`). The message distinguishes "never initialised" from
     * "initialised but no peers" so a bridge log says which one happened.
     */
    async ensureInitialized(timeoutMs: number = 30000): Promise<void> {
        const start = Date.now();
        while (this.p2p === undefined || !this.p2p.isConnectedToNetwork) {
            if (Date.now() - start > timeoutMs) {
                throw new Error(
                    this.p2p === undefined
                        ? `S5 node was never initialised (p2p is undefined) after ${timeoutMs}ms — call init() first`
                        : `S5 node is not connected to the S5 network after ${timeoutMs}ms`
                );
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    /**
     * Download a blob from any P2P-advertised location.
     *
     * Every network wait here is bounded. Previously the global budget was evaluated only
     * BETWEEN `while` iterations while the `fetch` inside the `for` loop carried no signal,
     * so one advertised location that accepted the connection and never responded parked
     * the await forever: the function neither returned nor threw, which made the portal
     * fallback in `identity/api.ts` — and every retry/repair path above it — unreachable.
     *
     * Timeouts are split connect/read on purpose (see IMPLEMENTATION_NODE_TIMEOUTS.md, R2):
     * a single per-attempt signal stays armed after the headers arrive and would abort the
     * BODY too, cutting off a slow-but-alive peer mid-transfer and never retrying it. So:
     *
     * @param timeoutMs        budget for the discovery LOOP only — an in-flight transfer is
     *                         never killed by it, exactly as before.
     * @param headersTimeoutMs per attempt, request → response headers. The reported failure
     *                         mode is "accepts the connection but never responds".
     * @param bodyTimeoutMs    per attempt, armed only once headers have arrived. Bounds a
     *                         stalled stream without policing throughput.
     * @param exhaustedGraceMs how long to keep waiting after EVERY known location has been
     *                         tried and failed. Such a blob used to spin on `sleep(10)` for
     *                         the whole `timeoutMs` even though the loop could make no
     *                         progress — with a directory fanning out to many children that
     *                         cost minutes. New locations can still arrive from P2P, so this
     *                         is a short grace rather than an immediate give-up, and it
     *                         resets whenever an untried location appears. Safe to keep
     *                         short: a failure falls through to the portal fallback in
     *                         `identity/api.ts`, measured by the reporter at 0.2s.
     */
    async downloadBlobAsBytes(
        hash: Uint8Array,
        timeoutMs: number = 10000,
        headersTimeoutMs: number = 3000,
        bodyTimeoutMs: number = 60000,
        exhaustedGraceMs: number = 1000
    ): Promise<Uint8Array> {
        hash[0] = 0x1f;
        this.p2p.sendHashRequest(hash, [3, 5]);
        const hashStr = base64UrlNoPaddingEncode(hash);

        debug.download('Download requested %O', {
            hash: hashStr.slice(0, 16) + '...',
            network: 'P2P',
            discovering: true
        });

        const startTime = Date.now();
        let urlsAlreadyTried: Set<string> = new Set([]);
        let lastError: string | null = null;
        // Set once every known location has been tried and failed (null = not exhausted).
        let exhaustedSince: number | null = null;

        while (true) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Blob not found: ${lastError || 'timeout'} (hash: ${hashStr.slice(0, 16)}...)`);
            }

            for (const location of this.p2p.blobLocations.get(hashStr) ?? []) {
                // Re-check the global budget BEFORE each attempt, not just between `while`
                // iterations — this is the actual fix to the hang: a stale location can no
                // longer consume the whole loop.
                if (Date.now() - startTime > timeoutMs) {
                    throw new Error(`Blob not found: ${lastError || 'timeout'} (hash: ${hashStr.slice(0, 16)}...)`);
                }
                const url = location.parts[0];
                if (!urlsAlreadyTried.has(url)) {
                    urlsAlreadyTried.add(url);
                    // One controller per attempt, driven by two timers: the headers timer is
                    // cleared the instant `fetch` resolves, then the body timer is armed.
                    const controller = new AbortController();
                    let headersTimer: ReturnType<typeof setTimeout> | undefined;
                    let bodyTimer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        headersTimer = setTimeout(
                            () => controller.abort(new Error(`headers timeout after ${headersTimeoutMs}ms`)),
                            headersTimeoutMs
                        );
                        // `abortable` wraps the fetch as well as the body read: passing the
                        // signal asks the runtime to abort the socket, but it does not
                        // GUARANTEE this call returns — a non-cooperative fetch (or a runtime
                        // with a partial AbortSignal implementation) would still park here.
                        // Bounding both is the whole point; nothing below may depend on
                        // someone else's cooperation.
                        const res = await abortable(
                            fetch(url, { signal: controller.signal }),
                            controller.signal
                        );
                        clearTimeout(headersTimer);
                        headersTimer = undefined;

                        if (res.status === 404) {
                            lastError = '404 not found';
                            console.debug(`[S5] 404 from ${url}`);
                            continue;
                        }
                        if (res.status >= 200 && res.status < 300) {
                            bodyTimer = setTimeout(
                                () => controller.abort(new Error(`body timeout after ${bodyTimeoutMs}ms`)),
                                bodyTimeoutMs
                            );
                            // `abortable` makes the return OURS rather than depending on the
                            // runtime aborting an in-flight body stream for us.
                            const bytes = new Uint8Array(
                                await abortable(res.arrayBuffer(), controller.signal)
                            );
                            const bytesHash = await this.crypto.hashBlake3(bytes);
                            if (areArraysEqual(bytesHash, hash.subarray(1))) {
                                debug.download('Download complete %O', {
                                    url: url,
                                    size: bytes.length,
                                    verified: true,
                                    hashMatch: 'blake3'
                                });
                                return bytes;
                            }
                        }
                    } catch (e) {
                        // Record it: the thrown message below is a consumer's only diagnostic,
                        // and it must keep containing "not found" so the FS layer still types
                        // this as a retryable S5DirectoryLoadError.
                        lastError = (e as Error)?.message || String(e);
                        console.debug('downloadBlobAsBytes', hash, e);
                    } finally {
                        clearTimeout(headersTimer);
                        clearTimeout(bodyTimer);
                    }
                }
            }

            // "Still discovering" and "every known location has failed" are different states
            // and deserve different waits. Re-read the map here rather than reusing the array
            // the `for` iterated: a location may have arrived during the pass.
            const known = this.p2p.blobLocations.get(hashStr) ?? [];
            const allTried =
                known.length > 0 && known.every((l) => urlsAlreadyTried.has(l.parts[0]));
            if (allTried) {
                if (exhaustedSince === null) {
                    exhaustedSince = Date.now();
                } else if (Date.now() - exhaustedSince > exhaustedGraceMs) {
                    throw new Error(
                        `Blob not found: all ${known.length} known location(s) failed ` +
                        `(last: ${lastError || 'unknown'}) (hash: ${hashStr.slice(0, 16)}...)`
                    );
                }
            } else {
                // Zero known locations is NOT exhaustion — that is the discovery case, which
                // keeps the full budget so a blob whose locations have not propagated yet is
                // never abandoned early. An untried location appearing also resets the grace.
                exhaustedSince = null;
            }

            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    registryGet(pk: Uint8Array): Promise<RegistryEntry | undefined> {
        return this.registry.get(pk);
    }

    registryListen(pk: Uint8Array): AsyncIterator<RegistryEntry> {
        throw new Error("Method not implemented.");
    }
    registrySet(entry: RegistryEntry): Promise<void> {
        return this.registry.put(entry, true);
    }
    uploadBlob(blob: Blob): Promise<BlobIdentifier> {
        throw new Error("Method not implemented.");
    }
    pinHash(hash: Uint8Array): Promise<void> {
        throw new Error("Method not implemented.");
    }
    unpinHash(hash: Uint8Array): Promise<void> {
        throw new Error("Method not implemented.");
    }
    streamSubscribe(pk: Uint8Array, afterTimestamp?: number, beforeTimestamp?: number): AsyncIterator<StreamMessage> {
        throw new Error("Method not implemented.");
    }
    streamPublish(msg: StreamMessage): Promise<void> {
        throw new Error("Method not implemented.");
    }
}