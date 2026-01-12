import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils";
import { portalAccountLogin } from "../account/login.js";
import { portalAccountRegister } from "../account/register.js";
import { S5Portal } from "../account/portal.js";
import { CryptoImplementation } from "../api/crypto.js";
import { S5APIInterface } from "../api/s5.js";
import { BlobIdentifier } from "../identifier/blob.js";
import { KeyValueStore } from "../kv/kv.js";
import { S5Node } from "../node/node.js";
import { RegistryEntry } from "../registry/entry.js";
import { StreamMessage } from "../stream/message.js";
import { base64UrlNoPaddingDecode, base64UrlNoPaddingEncode } from "../util/base64.js";
import { HiddenJSONResponse, TrustedHiddenDBProvider } from "./hidden_db.js";
import { S5UserIdentity } from "./identity.js";
import { MULTIHASH_BLAKE3 } from "../constants.js";
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
    private httpClientCache: { fetch: any, FormData: any } | null = null;

    constructor(node: S5Node, identity: S5UserIdentity, authStore: KeyValueStore) {
        this.node = node;
        this.identity = identity;
        this.authStore = authStore;
        this.hiddenDB = new TrustedHiddenDBProvider(identity.hiddenDBKey, this);
    }

    /**
     * Get HTTP client with environment-specific fetch and FormData.
     * Uses undici in Node.js (proven to work with S5 portals) and native APIs in browser.
     */
    private async getHttpClient() {
        if (this.httpClientCache) return this.httpClientCache;

        if (typeof window === 'undefined') {
            // Node.js environment - use undici for S5 portal compatibility
            const undici = await import('undici');
            this.httpClientCache = {
                fetch: undici.fetch,
                FormData: undici.FormData
            };
        } else {
            // Browser environment - use native web APIs (webpack/bundler compatible)
            this.httpClientCache = {
                fetch: globalThis.fetch,
                FormData: globalThis.FormData
            };
        }

        return this.httpClientCache;
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

        if (!(await this.authStore.contains(authTokenKey))) {
            // TODO Check if the auth token is valid/expired
            try {
                const portal: S5Portal = new S5Portal(
                    uri.protocol.replace(':', ''),
                    uri.hostname + (uri.port ? `:${uri.port}` : ''),
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
                await this.authStore.put(authTokenKey, utf8ToBytes(authToken));
            } catch (e) {
                console.error(e);
            }
        }

        const authToken = bytesToUtf8((await this.authStore.get(authTokenKey))!);

        const portalConfig = new S5Portal(uri.protocol.replace(':', ''),
            uri.hostname + (uri.port ? `:${uri.port}` : ''),
            {
                'Authorization': `Bearer ${authToken}`,
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
            uri.hostname + (uri.port ? `:${uri.port}` : ''),
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


        await this.authStore.put(
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
        console.log('[Enhanced S5.js] Portal: Starting upload', {
            blobSize: blob.size,
            portalsAvailable: portals.length,
            retriesPerPortal: 3,
            expectedHash: Array.from(blake3Hash.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')
        });

        for (const portal of portals.concat(portals, portals)) {
            try {
                // Get environment-appropriate HTTP client
                const { fetch, FormData } = await this.getHttpClient();
                
                // Use File directly from blob data
                const arrayBuffer = await blob.arrayBuffer();
                const file = new File([arrayBuffer], 'file', { type: 'application/octet-stream' });
                
                // Use environment-specific FormData (undici in Node.js, native in browser)
                const formData = new FormData();
                formData.append('file', file);
                
                const uploadUrl = portal.apiURL(portalUploadEndpoint);
                const authHeader = portal.headers['Authorization'] || portal.headers['authorization'] || '';
                
                // Use environment-specific fetch (undici in Node.js, native in browser)
                const res = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader
                    },
                    body: formData,
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    console.log(`[upload] Failed with status ${res.status}, response: ${errorText}`);
                    throw new Error(`HTTP ${res.status}: ${errorText}`);
                }
                const responseData = await res.json() as any;
                const bid = BlobIdentifier.decode(responseData.cid);
                if (bid.toHex() !== expectedBlobIdentifier.toHex()) {
                    throw `Integrity check for blob upload to ${portal.host} failed (got ${bid}, expected ${expectedBlobIdentifier})`;
                }
                console.log('[Enhanced S5.js] Portal: Upload successful', {
                    portal: portal.host,
                    status: res.status,
                    verified: true,
                    hash: bid.toHex().slice(0, 16) + '...'
                });
                return expectedBlobIdentifier;
            } catch (e) {
                console.log('[Enhanced S5.js] Portal: Upload retry', {
                    portal: portal.host,
                    error: (e as Error).message?.slice(0, 100) || String(e).slice(0, 100),
                    remainingAttempts: 'trying next portal'
                });
                console.error(`Failed to upload blob to ${portal.host}`, e);
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

    /**
     * Download content by CID from S5 portals
     *
     * This method provides public download functionality, allowing users to download
     * content that has been shared via CID. It tries each configured portal until
     * one succeeds, then verifies the downloaded data matches the CID hash.
     *
     * @param cid - The CID as string (53-char or 59-char format) or 32-byte Uint8Array
     * @returns The downloaded content as Uint8Array
     * @throws Error if no portals configured, all portals fail, or hash verification fails
     *
     * @example
     * ```typescript
     * // Download by CID string
     * const data = await api.downloadByCID('baaaa...');
     *
     * // Download by raw hash
     * const data = await api.downloadByCID(hash);
     * ```
     */
    async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array> {
        // Import CID utilities
        const { cidToDownloadFormat, cidStringToHash } = await import('../fs/cid-utils.js');

        // Check if portals are configured
        const portals = Object.values(this.accountConfigs);
        if (portals.length === 0) {
            throw new Error('No portals configured for download');
        }

        // Convert CID to download format and extract hash for verification
        let cidString: string;
        let expectedHash: Uint8Array;

        if (cid instanceof Uint8Array) {
            if (cid.length !== 32) {
                throw new Error(`Invalid CID size: expected 32 bytes, got ${cid.length} bytes`);
            }
            cidString = cidToDownloadFormat(cid);
            expectedHash = cid;
        } else if (typeof cid === 'string') {
            if (cid.length === 0) {
                throw new Error('CID string cannot be empty');
            }
            cidString = cidToDownloadFormat(cid);
            expectedHash = cidStringToHash(cid);
        } else {
            throw new Error('CID must be a string or Uint8Array');
        }

        // Get HTTP client
        const { fetch } = await this.getHttpClient();

        // Try each portal until success
        const errors: string[] = [];
        for (const portal of portals) {
            const downloadUrl = `${portal.protocol}://${portal.host}/${cidString}`;

            try {
                console.log('[Enhanced S5.js] Portal: Download attempt', {
                    portal: portal.host,
                    cid: cidString.slice(0, 20) + '...'
                });

                const res = await fetch(downloadUrl);

                if (!res.ok) {
                    const errorText = await res.text();
                    errors.push(`${portal.host}: HTTP ${res.status} - ${errorText.slice(0, 100)}`);
                    continue;
                }

                const data = new Uint8Array(await res.arrayBuffer());

                // Verify hash matches CID
                const computedHash = await this.crypto.hashBlake3(data);

                let hashMatches = true;
                if (computedHash.length !== expectedHash.length) {
                    hashMatches = false;
                } else {
                    for (let i = 0; i < expectedHash.length; i++) {
                        if (computedHash[i] !== expectedHash[i]) {
                            hashMatches = false;
                            break;
                        }
                    }
                }

                if (!hashMatches) {
                    errors.push(`${portal.host}: Hash verification failed - data integrity error`);
                    continue;
                }

                console.log('[Enhanced S5.js] Portal: Download successful', {
                    portal: portal.host,
                    size: data.length,
                    verified: true
                });

                return data;
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                errors.push(`${portal.host}: ${errorMsg.slice(0, 100)}`);
                console.error(`[Enhanced S5.js] Portal: Download failed from ${portal.host}`, e);
            }
        }

        throw new Error(`Failed to download CID from all portals:\n${errors.join('\n')}`);
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