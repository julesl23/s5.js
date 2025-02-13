import { base64UrlNoPaddingEncode } from "../util/base64";
import { deserializeRegistryEntry, RegistryEntry, serializeRegistryEntry, verifyRegistryEntry } from "../registry/entry";
import { KeyValueStore } from "../kv/kv";
import { mkeyEd25519 } from "../constants";
import { P2P } from "./p2p";
import { Subject } from "rxjs";
import * as msgpackr from 'msgpackr';

const protocolMethodRegistryQuery = 13;

export class S5RegistryService {
    p2p: P2P;
    private db: KeyValueStore;

    private streams: Map<string, Subject<RegistryEntry>> = new Map();
    private subs: Set<string> = new Set();
    private cachedOnlyMode: boolean = false;


    constructor(p2p: P2P, registryDB: KeyValueStore) {
        this.p2p = p2p;
        this.db = registryDB;
    }

    async put(entry: RegistryEntry, trusted: boolean = false): Promise<void> {
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

        const existingEntry = await this.getFromDB(entry.pk);

        if (existingEntry) {
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
                throw new Error('Revision number too low');
            }
        }

        const key = base64UrlNoPaddingEncode(entry.pk);

        if (this.streams.has(key)) {
            this.streams.get(key)!.next(entry);
        }

        this.db.put(entry.pk, serializeRegistryEntry(entry));
        // TODO this.broadcastEntry(entry, receivedFrom);
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

        if (this.cachedOnlyMode) {
            return this.getFromDB(pk);
        }

        if (this.subs.has(key)) {
            console.debug(`[registry] get (subbed) ${key}`);
            const res = this.getFromDB(pk);
            if (res) {
                return res;
            }
            this.sendRegistryRequest(pk);
            await this.delay(250);
            return this.getFromDB(pk);
        } else {
            this.sendRegistryRequest(pk);
            this.subs.add(key);

            if (!this.streams.has(key)) {
                this.streams.set(key, new Subject<RegistryEntry>());
            }

            if ((await this.getFromDB(pk)) === undefined) {
                console.debug(`[registry] get (clean) ${key}`);
                for (let i = 0; i < 500; i++) {
                    await this.delay(5);
                    if (await this.getFromDB(pk)) break;
                }
            } else {
                console.debug(`[registry] get (cached) ${key}`);
                await this.delay(250);
            }

            return this.getFromDB(pk);
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