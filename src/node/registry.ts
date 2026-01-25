import { base64UrlNoPaddingEncode } from "../util/base64.js";
import { deserializeRegistryEntry, RegistryEntry, serializeRegistryEntry, verifyRegistryEntry } from "../registry/entry.js";
import { KeyValueStore } from "../kv/kv.js";
import { mkeyEd25519 } from "../constants.js";
import { P2P } from "./p2p.js";
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
        console.log('[S5_DBG:REGISTRY] S5RegistryService initialized (beta.29 with in-memory cache)');
    }

    /**
     * Check the in-memory cache for a recent write
     * Returns the entry if found and not expired, undefined otherwise
     */
    private getFromCache(key: string): RegistryEntry | undefined {
        const cached = this.recentWrites.get(key);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            console.log(`[S5_DBG:REGISTRY] Cache hit for ${key.slice(0, 16)}..., revision=${cached.entry.revision}`);
            return cached.entry;
        }
        return undefined;
    }

    /**
     * Store an entry in the in-memory cache
     */
    private setInCache(key: string, entry: RegistryEntry): void {
        console.log(`[S5_DBG:REGISTRY] Cache set for ${key.slice(0, 16)}..., revision=${entry.revision}`);
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
        console.log(`[S5_DBG:REGISTRY] put() called, key=${key.slice(0, 16)}..., revision=${entry.revision}, trusted=${trusted}`);

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

        // Check in-memory cache first for the most recent revision
        const cachedEntry = this.getFromCache(key);
        const existingEntry = cachedEntry ?? await this.getFromDB(entry.pk);

        if (existingEntry) {
            console.log(`[S5_DBG:REGISTRY] put() existing revision=${existingEntry.revision}, new revision=${entry.revision}`);
            /* if (receivedFrom) {
                if (existingEntry.revision === sre.revision) {
                    return;
                } else if (existingEntry.revision > sre.revision) {
                    const updateMessage = existingEntry.serialize();
                    receivedFrom.sendMessage(updateMessage);
                    return;
                }
            } */

            if (existingEntry.revision >= entry.revision) {
                console.log(`[S5_DBG:REGISTRY] put() REJECTED - revision too low`);
                throw new Error('Revision number too low');
            }
        }

        if (this.streams.has(key)) {
            this.streams.get(key)!.next(entry);
        }

        // Write to persistent storage
        await this.db.put(entry.pk, serializeRegistryEntry(entry));

        // CRITICAL: Also write to in-memory cache to ensure immediate visibility
        // This prevents P2P race conditions where old entries might be returned
        this.setInCache(key, entry);

        console.log(`[S5_DBG:REGISTRY] put() SUCCESS - stored revision=${entry.revision}`);

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

    private sendRegistryRequest(pk: Uint8Array): void {
        const req = this.createRegistryQuery(pk);

        for (const peer of this.p2p.peers.values()) {
            if (peer.isConnected) {
                peer.send(req);
            }
        }
    }

    private createRegistryQuery(pk: Uint8Array): Uint8Array {
        return msgpackr.pack([
            protocolMethodRegistryQuery,
            pk,
        ]).subarray(1);
    }

    async get(pk: Uint8Array): Promise<RegistryEntry | undefined> {
        const key = base64UrlNoPaddingEncode(pk);
        console.log(`[S5_DBG:REGISTRY] get() called, key=${key.slice(0, 16)}...`);

        // CRITICAL: Check in-memory cache FIRST for recent writes
        // This ensures read-your-writes consistency and prevents P2P race conditions
        const cachedEntry = this.getFromCache(key);
        if (cachedEntry) {
            console.log(`[S5_DBG:REGISTRY] get() returning cached entry, revision=${cachedEntry.revision}`);
            return cachedEntry;
        }

        if (this.cachedOnlyMode) {
            const entry = await this.getFromDB(pk);
            console.log(`[S5_DBG:REGISTRY] get() cachedOnlyMode, revision=${entry?.revision ?? 'none'}`);
            return entry;
        }

        if (this.subs.has(key)) {
            // Already subscribed - check DB directly
            const res = await this.getFromDB(pk);
            if (res) {
                console.log(`[S5_DBG:REGISTRY] get() from DB (subscribed), revision=${res.revision}`);
                return res;
            }
            // Not in DB, request from P2P
            console.log(`[S5_DBG:REGISTRY] get() not in DB, requesting from P2P...`);
            this.sendRegistryRequest(pk);
            await this.delay(250);
            const dbEntry = await this.getFromDB(pk);
            console.log(`[S5_DBG:REGISTRY] get() after P2P wait, revision=${dbEntry?.revision ?? 'none'}`);
            return dbEntry;
        } else {
            // First access - send P2P request and wait
            console.log(`[S5_DBG:REGISTRY] get() first access, sending P2P request...`);
            this.sendRegistryRequest(pk);
            this.subs.add(key);

            if (!this.streams.has(key)) {
                this.streams.set(key, new Subject<RegistryEntry>());
            }

            if ((await this.getFromDB(pk)) === undefined) {
                // No local entry, wait for P2P response
                console.log(`[S5_DBG:REGISTRY] get() no local entry, waiting for P2P...`);
                for (let i = 0; i < 500; i++) {
                    await this.delay(5);
                    if (await this.getFromDB(pk)) break;
                }
            } else {
                // Have local entry, wait briefly for potentially newer P2P entries
                console.log(`[S5_DBG:REGISTRY] get() have local entry, waiting 250ms for P2P updates...`);
                await this.delay(250);
            }

            const finalEntry = await this.getFromDB(pk);
            console.log(`[S5_DBG:REGISTRY] get() returning final entry, revision=${finalEntry?.revision ?? 'none'}`);
            return finalEntry;
        }
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
        if (await this.db.contains(pk)) {
            return deserializeRegistryEntry((await this.db.get(pk))!);
        }
        return undefined;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}