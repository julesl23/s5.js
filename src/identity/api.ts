import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils";
import { portalAccountLogin } from "../account/login";
import { portalAccountRegister } from "../account/register";
import { S5Portal } from "../account/portal";
import { CryptoImplementation } from "../api/crypto";
import { S5APIInterface } from "../api/s5";
import { BlobIdentifier } from "../identifier/blob";
import { KeyValueStore } from "../kv/kv";
import { S5Node } from "../node/node";
import { RegistryEntry } from "../registry/entry";
import { StreamMessage } from "../stream/message";
import { base64UrlNoPaddingDecode, base64UrlNoPaddingEncode } from "../util/base64";
import { HiddenJSONResponse, TrustedHiddenDBProvider } from "./hidden_db";
import { S5UserIdentity } from "./identity";
import { MULTIHASH_BLAKE3 } from "../constants";
import { concatBytes } from "@noble/hashes/utils";

const portalUploadEndpoint = 'upload';

const hiddenStorageServiceAccountsPath = 'accounts.json';

export class S5APIWithIdentity implements S5APIInterface {
    private readonly node: S5Node;
    private readonly identity: S5UserIdentity;
    private readonly authStore: KeyValueStore;

    private accountsRes: HiddenJSONResponse | undefined;
    private accounts: any = {};
    private accountConfigs: { [key: string]: S5Portal } = {};

    private readonly hiddenDB: TrustedHiddenDBProvider;

    constructor(node: S5Node, identity: S5UserIdentity, authStore: KeyValueStore) {
        this.node = node;
        this.identity = identity;
        this.authStore = authStore;
        this.hiddenDB = new TrustedHiddenDBProvider(identity.hiddenDBKey, this);
    }

    async ensureInitialized(): Promise<void> {
        await this.node.ensureInitialized();
        await this.initStorageServices();
    }
    async initStorageServices(): Promise<void> {
        const res = await this.hiddenDB.getJSON(hiddenStorageServiceAccountsPath);
        this.accountsRes = res;
        this.accounts = res.data ?? {
            'accounts': {},
            'active': [] as string[],
            'uploadOrder': { 'default': [] }
        };

        for (const id of this.accounts['active']) {
            if (!Object.hasOwn(this.accountConfigs, id)) {
                await this.setupAccount(id);
            }
        }
    }

    async setupAccount(id: string): Promise<void> {
        console.info(`[account] setup ${id}`);

        const config = this.accounts['accounts'][id]!;
        const uri = new URL(config['url']);

        const authTokenKey = this.getAuthTokenKey(id);

        if (!this.authStore.contains(authTokenKey)) {
            // TODO Check if the auth token is valid/expired
            try {
                const portal: S5Portal = new S5Portal(
                    uri.protocol.replace(':', ''),
                    uri.host + (uri.port ? `:${uri.port}` : ''),
                    {},
                );
                const seed = base64UrlNoPaddingDecode(
                    config['seed']
                );

                const authToken = await portalAccountLogin(
                    portal,
                    this.identity,
                    seed,
                    's5.js',
                    this.node.crypto,
                );
                this.authStore.put(authTokenKey, utf8ToBytes(authToken));
            } catch (e) {
                console.error(e);
            }
        }

        const authToken = bytesToUtf8((await this.authStore.get(authTokenKey))!);

        const portalConfig = new S5Portal(uri.protocol.replace(':', ''),
            uri.host + (uri.port ? `:${uri.port}` : ''),
            {
                'authorization': `Bearer ${authToken}`,
            },);

        this.accountConfigs[id] = portalConfig;

        // TODO this.connectToPortalNodes(portalConfig);
    }

    async saveStorageServices(): Promise<void> {
        await this.hiddenDB.setJSON(
            hiddenStorageServiceAccountsPath,
            this.accounts,
            (this.accountsRes?.revision ?? 0) + 1
        );
    }

    async registerAccount(url: string, inviteCode?: string): Promise<void> {
        await this.initStorageServices();

        const uri = new URL(url);

        for (const id of Object.keys(this.accountConfigs)) {
            if (id.startsWith(`${uri.host}:`)) {
                throw new Error('User already has an account on this service!');
            }
        }

        const portalConfig = new S5Portal(
            uri.protocol.replace(':', ''),
            uri.host + (uri.port ? `:${uri.port}` : ''),
            {},
        );

        const seed = this.crypto.generateSecureRandomBytes(32);

        const authToken = await portalAccountRegister(
            portalConfig,
            this.identity,
            seed,
            's5.js',
            this.node.crypto,
            inviteCode,
        );

        const id = `${uri.host}:${base64UrlNoPaddingEncode(seed.slice(0, 12))}`;

        this.accounts['accounts'][id] = {
            'url': `${uri.protocol}//${uri.host}`,
            'seed': base64UrlNoPaddingEncode(seed),
            'createdAt': new Date().toISOString(),
        };

        this.accounts['active'].push(id);
        this.accounts['uploadOrder']['default'].push(id);


        this.authStore.put(
            this.getAuthTokenKey(id),
            new TextEncoder().encode(authToken)
        );
        await this.setupAccount(id);
        await this.saveStorageServices();

        // TODO updateQuota();
    }

    getAuthTokenKey(id: string): Uint8Array {
        return utf8ToBytes(`identity_main_account_${id}_auth_token`);
    }


    async uploadBlob(blob: Blob): Promise<BlobIdentifier> {
        if (Object.keys(this.accountConfigs).length == 0) {
            throw new Error("No portals available for upload");
        }
        const blake3Hash = await this.crypto.hashBlake3Blob(blob);
        const expectedBlobIdentifier = new BlobIdentifier(concatBytes(new Uint8Array([MULTIHASH_BLAKE3]), blake3Hash), blob.size);

        const portals = Object.values(this.accountConfigs);
        for (const portal of portals.concat(portals, portals)) {
            try {
                const formData = new FormData();
                formData.append('file', blob);
                const res = await fetch(portal.apiURL(portalUploadEndpoint), {
                    method: 'POST',
                    headers: portal.headers,
                    body: formData,
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.body}`);
                }
                const bid = BlobIdentifier.decode((await res.json()).cid);
                if (bid.toHex() !== expectedBlobIdentifier.toHex()) {
                    throw `Integrity check for blob upload to ${portal.host} failed (got ${bid}, expected ${expectedBlobIdentifier})`;
                }
                return expectedBlobIdentifier;
            } catch (e) {
                console.debug(`Failed to upload blob to ${portal.host}`, e);
            }
        }
        throw new Error("Failed to upload blob with 3 tries for each available portal");
    }

    pinHash(hash: Uint8Array): Promise<void> {
        throw new Error("Method not implemented.");
    }
    async unpinHash(hash: Uint8Array): Promise<void> {
        // TODO Implement method
        return;
    }

    downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
        return this.node.downloadBlobAsBytes(hash);
    }
    registryGet(pk: Uint8Array): Promise<RegistryEntry | undefined> {
        return this.node.registryGet(pk);
    }
    registryListen(pk: Uint8Array): AsyncIterator<RegistryEntry> {
        return this.node.registryListen(pk);
    }
    registrySet(entry: RegistryEntry): Promise<void> {
        return this.node.registrySet(entry);
    }
    streamSubscribe(pk: Uint8Array, afterTimestamp?: number, beforeTimestamp?: number): AsyncIterator<StreamMessage> {
        return this.node.streamSubscribe(pk, afterTimestamp, beforeTimestamp);
    }
    streamPublish(msg: StreamMessage): Promise<void> {
        return this.node.streamPublish(msg);
    }
    get crypto(): CryptoImplementation {
        return this.node.crypto;
    }
}