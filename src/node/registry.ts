import { base64UrlNoPaddingEncode } from "../util/base64.js";
import { debug } from "../util/debug.js";
import { deserializeRegistryEntry, RegistryEntry, serializeRegistryEntry, verifyRegistryEntry } from "../registry/entry.js";
import { KeyValueStore } from "../kv/kv.js";
import { mkeyEd25519 } from "../constants.js";
import { P2P } from "./p2p.js";
import { S5RegistryUnavailableError } from "./errors.js";
import { bytesToHex } from "@noble/hashes/utils";
import { Subject } from "rxjs";
import * as msgpackr from 'msgpackr';

const protocolMethodRegistryQuery = 13;

// In-memory cache entry with timestamp
interface CachedEntry {
    entry: RegistryEntry;
    timestamp: number;
}

// Cache TTL: 60 seconds - entries are considered fresh within this window
const CACHE_TTL_MS = 60000;

/** The higher revision wins; a tie keeps `a` (this tab's own entry). */
function newer(a: RegistryEntry, b: RegistryEntry | undefined): RegistryEntry {
    return b !== undefined && b.revision > a.revision ? b : a;
}

export class S5RegistryService {
    p2p: P2P;
    private db: KeyValueStore;

    private streams: Map<string, Subject<RegistryEntry>> = new Map();
    private subs: Set<string> = new Set();
    private cachedOnlyMode: boolean = false;

    // In-memory cache for recent writes to ensure immediate read-your-writes consistency
    // This bypasses any IDB timing issues or P2P race conditions
    private recentWrites: Map<string, CachedEntry> = new Map();

    constructor(p2p: P2P, registryDB: KeyValueStore) {
        this.p2p = p2p;
        this.db = registryDB;
        debug.registry(' S5RegistryService initialized (beta.36 with in-memory cache)');
    }

    /**
     * Check the in-memory cache for a recent write
     * Returns the entry if found and not expired, undefined otherwise
     */
    private getFromCache(key: string): RegistryEntry | undefined {
        const cached = this.recentWrites.get(key);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            debug.registry(` Cache hit for ${key.slice(0, 16)}..., revision=${cached.entry.revision}`);
            return cached.entry;
        }
        return undefined;
    }

    /**
     * Store an entry in the in-memory cache
     */
    private setInCache(key: string, entry: RegistryEntry): void {
        debug.registry(` Cache set for ${key.slice(0, 16)}..., revision=${entry.revision}`);
        this.recentWrites.set(key, {
            entry,
            timestamp: Date.now()
        });

        // Cleanup old entries periodically (every 100 writes)
        if (this.recentWrites.size > 100) {
            this.cleanupCache();
        }
    }

    /**
     * Remove expired entries from the cache
     */
    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, cached] of this.recentWrites) {
            if (now - cached.timestamp >= CACHE_TTL_MS) {
                this.recentWrites.delete(key);
            }
        }
    }

    async put(entry: RegistryEntry, trusted: boolean = false): Promise<void> {
        const key = base64UrlNoPaddingEncode(entry.pk);
        debug.registry(` put() called, key=${key.slice(0, 16)}..., revision=${entry.revision}, trusted=${trusted}`);

        if (trusted !== true) {
            if (entry.pk.length !== 33) {
                throw new Error("Invalid public key size");
            }
            if (entry.pk[0] !== mkeyEd25519) {
                throw new Error("Invalid public key type");
            }
            if (entry.revision < 0 || entry.revision > 281474976710656) {
                throw new Error("Invalid revision");
            }
            if (entry.data.length > 64) {
                throw new Error("Data too long");
            }
            const isValid = await verifyRegistryEntry(entry, this.p2p.crypto);
            if (isValid !== true) {
                throw new Error("Invalid signature");
            }
        }

        // Cheap fast-reject: this tab already holds something at least as new. The cache is
        // only ever set after the store accepted an entry, so it is never ahead of the DB —
        // but it can be BEHIND it (another tab of the origin wrote since), so it can only
        // refuse here, never approve.
        const cachedEntry = this.getFromCache(key);
        if (cachedEntry && cachedEntry.revision >= entry.revision) {
            debug.registry(` put() REJECTED by cache - revision too low (cached=${cachedEntry.revision})`);
            throw new Error('Revision number too low');
        }

        // The authoritative check and the write are ONE step. The registry DB is shared by
        // every tab of the origin; checking in one transaction and writing in another lets
        // two tabs both pass and the later write silently replace the earlier (lost update).
        const stored = await this.putIfNewer(entry);
        if (!stored) {
            debug.registry(` put() REJECTED by store - revision too low`);
            throw new Error('Revision number too low');
        }

        // Announce only what the store accepted: a refused put must never reach listeners.
        if (this.streams.has(key)) {
            this.streams.get(key)!.next(entry);
        }

        // Read-your-writes: lets this tab's next get() skip the P2P wait for this key.
        this.setInCache(key, entry);

        debug.registry(` put() SUCCESS - stored revision=${entry.revision}`);

        if (trusted) {
            this.broadcastEntry(entry);
        }
    }
    private broadcastEntry(entry: RegistryEntry): void {
        const message = serializeRegistryEntry(entry);
        for (const peer of this.p2p.peers.values()) {
            if (peer.isConnected) {
                peer.send(message);
            }
        }
    }

    /** Ask every connected peer; returns how many were asked (0 = nobody could answer). */
    private sendRegistryRequest(pk: Uint8Array): number {
        const req = this.createRegistryQuery(pk);

        let reached = 0;
        for (const peer of this.p2p.peers.values()) {
            if (peer.isConnected) {
                peer.send(req);
                reached++;
            }
        }
        return reached;
    }

    private createRegistryQuery(pk: Uint8Array): Uint8Array {
        return msgpackr.pack([
            protocolMethodRegistryQuery,
            pk,
        ]).subarray(1);
    }

    /**
     * Read a registry entry: this tab's recent write (as a floor), the shared DB, and the
     * network.
     *
     * The protocol has no negative reply — a peer without the entry stays silent — so
     * `undefined` means "no peer we asked has it". With `requireAnswer`, a read that could not
     * ask ANY peer (none connected) and has no local entry rejects with a retryable
     * `S5RegistryUnavailableError` instead, because that `undefined` would be a guess.
     */
    async get(pk: Uint8Array, opts?: { requireAnswer?: boolean }): Promise<RegistryEntry | undefined> {
        const key = base64UrlNoPaddingEncode(pk);
        debug.registry(` get() called, key=${key.slice(0, 16)}...`);

        // A recent write of this tab is a FLOOR, never an override: another tab of the origin
        // may have committed a newer entry to the shared DB since. The cache still lets us
        // skip the P2P wait below for a key this tab just wrote.
        const cachedEntry = this.getFromCache(key);
        if (cachedEntry) {
            const result = newer(cachedEntry, await this.getFromDB(pk));
            debug.registry(` get() cache floor revision=${cachedEntry.revision}, returning revision=${result.revision}`);
            return result;
        }

        if (this.cachedOnlyMode) {
            const entry = await this.getFromDB(pk);
            debug.registry(` get() cachedOnlyMode, revision=${entry?.revision ?? 'none'}`);
            return entry;
        }

        if (this.subs.has(key)) {
            // Already subscribed - check DB directly
            const res = await this.getFromDB(pk);
            if (res) {
                debug.registry(` get() from DB (subscribed), revision=${res.revision}`);
                return res;
            }
            // Not in DB, request from P2P
            debug.registry(` get() not in DB, requesting from P2P...`);
            const reached = this.sendRegistryRequest(pk);
            if (reached === 0 && opts?.requireAnswer) {
                // No peer can answer: waiting would only delay the error (and a caller
                // retrying under a directory lock would hold the lock for every wait).
                return this.answerOrUnavailable(await this.getFromDB(pk), reached, pk, opts);
            }
            await this.delay(250);
            const dbEntry = await this.getFromDB(pk);
            debug.registry(` get() after P2P wait, revision=${dbEntry?.revision ?? 'none'}`);
            return this.answerOrUnavailable(dbEntry, reached, pk, opts);
        } else {
            // First access - send P2P request and wait
            debug.registry(` get() first access, sending P2P request...`);
            const reached = this.sendRegistryRequest(pk);
            // Only a key some peer was actually asked about counts as subscribed: the
            // subscribed path trusts the DB without asking again, which is wrong for a key
            // no peer has ever been asked about (first read while offline).
            if (reached > 0) this.subs.add(key);

            if (!this.streams.has(key)) {
                this.streams.set(key, new Subject<RegistryEntry>());
            }

            if (reached === 0 && opts?.requireAnswer) {
                // No peer can answer: return a local entry now, or fail fast.
                return this.answerOrUnavailable(await this.getFromDB(pk), reached, pk, opts);
            }

            if ((await this.getFromDB(pk)) === undefined) {
                // No local entry, wait for P2P response
                debug.registry(` get() no local entry, waiting for P2P...`);
                for (let i = 0; i < 500; i++) {
                    await this.delay(5);
                    if (await this.getFromDB(pk)) break;
                }
            } else {
                // Have local entry, wait briefly for potentially newer P2P entries
                debug.registry(` get() have local entry, waiting 250ms for P2P updates...`);
                await this.delay(250);
            }

            const finalEntry = await this.getFromDB(pk);
            debug.registry(` get() returning final entry, revision=${finalEntry?.revision ?? 'none'}`);
            return this.answerOrUnavailable(finalEntry, reached, pk, opts);
        }
    }

    private answerOrUnavailable(
        entry: RegistryEntry | undefined,
        reached: number,
        pk: Uint8Array,
        opts?: { requireAnswer?: boolean }
    ): RegistryEntry | undefined {
        if (entry === undefined && reached === 0 && opts?.requireAnswer) {
            debug.registry(` get() no local entry and no peer to ask - unavailable`);
            throw new S5RegistryUnavailableError(undefined, { publicKey: bytesToHex(pk) });
        }
        return entry;
    }

    listen(pk: Uint8Array): Subject<RegistryEntry> {
        const key = base64UrlNoPaddingEncode(pk);

        if (!this.streams.has(key)) {
            this.streams.set(key, new Subject<RegistryEntry>());
            this.sendRegistryRequest(pk);
        }

        return this.streams.get(key)!;
    }

    private async getFromDB(pk: Uint8Array): Promise<RegistryEntry | undefined> {
        const raw = await this.db.get(pk);
        return raw === undefined ? undefined : deserializeRegistryEntry(raw);
    }

    /** Store `entry` iff it is newer than what the store holds, atomically when the store can. */
    private async putIfNewer(entry: RegistryEntry): Promise<boolean> {
        const value = serializeRegistryEntry(entry);
        // Synchronous: in IDBStore this runs inside the readwrite transaction.
        const isNewer = (existing: Uint8Array | undefined) =>
            existing === undefined || deserializeRegistryEntry(existing).revision < entry.revision;

        if (this.db.putIfNewer) {
            return this.db.putIfNewer(entry.pk, value, isNewer);
        }
        // Caller-supplied store without compare-and-put: best effort, NOT atomic across
        // writers sharing the store (the pre-beta.56 behaviour).
        if (!isNewer(await this.db.get(entry.pk))) return false;
        await this.db.put(entry.pk, value);
        return true;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}