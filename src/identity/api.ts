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
import { areArraysEqual } from "../util/arrays.js";
import { base64UrlNoPaddingDecode, base64UrlNoPaddingEncode } from "../util/base64.js";
import { HiddenJSONResponse, TrustedHiddenDBProvider } from "./hidden_db.js";
import { S5UserIdentity } from "./identity.js";
import { MULTIHASH_BLAKE3 } from "../constants.js";
import { concatBytes } from "@noble/hashes/utils";
import { dbg, dbgError } from "../util/debug.js";

const portalUploadEndpoint = 'upload';

const hiddenStorageServiceAccountsPath = 'accounts.json';

// Blob cache entry with timestamp for TTL
interface BlobCacheEntry {
    data: Uint8Array;
    timestamp: number;
}

// Blob cache TTL: 5 minutes - blobs are immutable so cache is safe
const BLOB_CACHE_TTL_MS = 300000;

export class S5APIWithIdentity implements S5APIInterface {
    private readonly node: S5Node;
    private readonly identity: S5UserIdentity;
    private readonly authStore: KeyValueStore;

    private accountsRes: HiddenJSONResponse | undefined;
    private accounts: any = {};
    private accountConfigs: { [key: string]: S5Portal } = {};

    private readonly hiddenDB: TrustedHiddenDBProvider;
    private httpClientCache: { fetch: any, FormData: any } | null = null;

    // In-memory blob cache for read-your-writes consistency
    // Prevents 404s when P2P network hasn't propagated new blob URLs yet
    private blobCache: Map<string, BlobCacheEntry> = new Map();

    constructor(node: S5Node, identity: S5UserIdentity, authStore: KeyValueStore) {
        this.node = node;
        this.identity = identity;
        this.authStore = authStore;
        this.hiddenDB = new TrustedHiddenDBProvider(identity.hiddenDBKey, this);
        console.log('[S5_DBG:API] S5APIWithIdentity initialized (beta.29 with z-prefix CID fallback)');
    }

    /**
     * Get blob from in-memory cache if present and not expired
     */
    private getBlobFromCache(hashKey: string): Uint8Array | undefined {
        const cached = this.blobCache.get(hashKey);
        if (cached && (Date.now() - cached.timestamp) < BLOB_CACHE_TTL_MS) {
            console.log(`[S5_DBG:BLOB_CACHE] Cache hit for ${hashKey.slice(0, 16)}..., size=${cached.data.length}`);
            return cached.data;
        }
        return undefined;
    }

    /**
     * Store blob in in-memory cache
     */
    private setBlobInCache(hashKey: string, data: Uint8Array): void {
        console.log(`[S5_DBG:BLOB_CACHE] Cache set for ${hashKey.slice(0, 16)}..., size=${data.length}`);
        this.blobCache.set(hashKey, {
            data,
            timestamp: Date.now()
        });

        // Cleanup old entries periodically (every 50 writes)
        if (this.blobCache.size > 50) {
            this.cleanupBlobCache();
        }
    }

    /**
     * Remove expired entries from the blob cache
     */
    private cleanupBlobCache(): void {
        const now = Date.now();
        for (const [key, cached] of this.blobCache) {
            if (now - cached.timestamp >= BLOB_CACHE_TTL_MS) {
                this.blobCache.delete(key);
            }
        }
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
        dbg('IDENTITY', 'ensureInitialized', 'ENTER');
        await this.node.ensureInitialized();
        await this.initStorageServices();
        dbg('IDENTITY', 'ensureInitialized', 'SUCCESS');
    }
    async initStorageServices(): Promise<void> {
        dbg('IDENTITY', 'initStorageServices', 'ENTER');
        dbg('HIDDEN_DB', 'initStorageServices', 'Fetching accounts.json...');
        const res = await this.hiddenDB.getJSON(hiddenStorageServiceAccountsPath);
        dbg('HIDDEN_DB', 'initStorageServices', 'Got accounts.json', {
            hasData: !!res.data,
            revision: res.revision
        });

        this.accountsRes = res;
        this.accounts = res.data ?? {
            'accounts': {},
            'active': [] as string[],
            'uploadOrder': { 'default': [] }
        };
        dbg('IDENTITY', 'initStorageServices', 'Accounts loaded', {
            activeCount: this.accounts['active']?.length || 0,
            accountIds: Object.keys(this.accounts['accounts'] || {})
        });

        for (const id of this.accounts['active']) {
            if (!Object.hasOwn(this.accountConfigs, id)) {
                dbg('IDENTITY', 'initStorageServices', 'Setting up account', { id });
                await this.setupAccount(id);
            }
        }
        dbg('IDENTITY', 'initStorageServices', 'SUCCESS');
    }

    async setupAccount(id: string): Promise<void> {
        dbg('IDENTITY', 'setupAccount', 'ENTER', { id });

        const config = this.accounts['accounts'][id]!;
        const uri = new URL(config['url']);
        dbg('IDENTITY', 'setupAccount', 'Account config', { url: config['url'] });

        const authTokenKey = this.getAuthTokenKey(id);

        if (!(await this.authStore.contains(authTokenKey))) {
            dbg('IDENTITY', 'setupAccount', 'No cached auth token, logging in...');
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

                dbg('IDENTITY', 'setupAccount', 'Calling portalAccountLogin...');
                const authToken = await portalAccountLogin(
                    portal,
                    this.identity,
                    seed,
                    's5.js',
                    this.node.crypto,
                );
                await this.authStore.put(authTokenKey, utf8ToBytes(authToken));
                dbg('IDENTITY', 'setupAccount', 'Auth token saved');
            } catch (e: any) {
                dbgError('IDENTITY', 'setupAccount', 'Login failed', e);
            }
        } else {
            dbg('IDENTITY', 'setupAccount', 'Using cached auth token');
        }

        const authToken = bytesToUtf8((await this.authStore.get(authTokenKey))!);

        const portalConfig = new S5Portal(uri.protocol.replace(':', ''),
            uri.hostname + (uri.port ? `:${uri.port}` : ''),
            {
                'Authorization': `Bearer ${authToken}`,
            },);

        this.accountConfigs[id] = portalConfig;
        dbg('IDENTITY', 'setupAccount', 'SUCCESS', { id, host: portalConfig.host });

        // TODO this.connectToPortalNodes(portalConfig);
    }

    async saveStorageServices(): Promise<void> {
        dbg('IDENTITY', 'saveStorageServices', 'ENTER');
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const revisionToUse = (this.accountsRes?.revision ?? 0) + 1;
            dbg('REVISION', 'saveStorageServices', `Attempt ${attempt}/${maxRetries}`, {
                currentRevision: this.accountsRes?.revision ?? 'none',
                willUseRevision: revisionToUse
            });

            try {
                dbg('HIDDEN_DB', 'saveStorageServices', 'Saving accounts.json...');
                await this.hiddenDB.setJSON(
                    hiddenStorageServiceAccountsPath,
                    this.accounts,
                    revisionToUse
                );
                dbg('IDENTITY', 'saveStorageServices', 'SUCCESS');
                return;
            } catch (e: any) {
                const message = e?.message?.toLowerCase() || '';
                const isRevisionError = message.includes('revision') && message.includes('low');

                dbgError('IDENTITY', 'saveStorageServices', `Error on attempt ${attempt}`, {
                    error: e?.message,
                    isRevisionError,
                    attemptedRevision: revisionToUse
                });

                if (isRevisionError && attempt < maxRetries) {
                    dbg('REVISION', 'saveStorageServices', 'Revision conflict - re-fetching...');
                    // Re-fetch current state from registry to get correct revision
                    const res = await this.hiddenDB.getJSON(hiddenStorageServiceAccountsPath);
                    dbg('HIDDEN_DB', 'saveStorageServices', 'Re-fetched accounts.json', {
                        newRevision: res.revision,
                        hasData: !!res.data
                    });
                    this.accountsRes = res;
                    // Merge any remote changes with our local changes
                    if (res.data) {
                        // Keep our local account additions but update revision
                        this.accounts = {
                            ...res.data,
                            accounts: { ...res.data.accounts, ...this.accounts.accounts },
                            active: [...new Set([...(res.data.active || []), ...this.accounts.active])],
                        };
                    }
                    await new Promise(r => setTimeout(r, 50 * attempt));
                    continue;
                }
                dbgError('IDENTITY', 'saveStorageServices', 'FAILED - max retries exceeded or non-revision error');
                throw e;
            }
        }
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

        // Get blob bytes for caching after successful upload
        const blobBytes = new Uint8Array(await blob.arrayBuffer());

        for (const portal of portals.concat(portals, portals)) {
            try {
                // Get environment-appropriate HTTP client
                const { fetch, FormData } = await this.getHttpClient();

                // Use File directly from blob data
                const file = new File([blobBytes], 'file', { type: 'application/octet-stream' });

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

                // CRITICAL: Cache the blob content for immediate read-your-writes consistency
                // This prevents 404s when P2P network hasn't propagated the new blob yet
                const hashKey = base64UrlNoPaddingEncode(expectedBlobIdentifier.hash);
                this.setBlobInCache(hashKey, blobBytes);

                console.log('[Enhanced S5.js] Portal: Upload successful', {
                    portal: portal.host,
                    status: res.status,
                    verified: true,
                    cached: true,
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

    async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
        // CRITICAL: Check blob cache FIRST for read-your-writes consistency
        // This handles the case where we just uploaded a blob but P2P doesn't know about it yet
        const hashKey = base64UrlNoPaddingEncode(hash);
        const cached = this.getBlobFromCache(hashKey);
        if (cached) {
            console.log('[S5_DBG:BLOB_CACHE] Serving from cache, skipping P2P', {
                hash: hashKey.slice(0, 16) + '...',
                size: cached.length
            });
            return cached;
        }

        // Try P2P download first
        try {
            return await this.node.downloadBlobAsBytes(hash);
        } catch (p2pError) {
            const errorMsg = (p2pError as Error).message || '';
            console.log('[S5_DBG:DOWNLOAD] P2P failed, trying portal fallback', {
                hash: hashKey.slice(0, 16) + '...',
                error: errorMsg.slice(0, 50)
            });

            // PORTAL FALLBACK: When P2P fails (e.g., 404), try direct portal download
            // The portal we uploaded to should still have the blob
            const portals = Object.values(this.accountConfigs);
            if (portals.length === 0) {
                throw p2pError; // No portals configured, re-throw original error
            }

            // Use z-prefixed (base58btc) BlobIdentifier CID format
            // Portal confirmed: u-prefix causes 500 errors due to base64 padding issues
            const bid = new BlobIdentifier(hash, 0);
            const cid = bid.toBase58();  // z-prefixed base58btc format

            for (const portal of portals) {
                const downloadUrl = `${portal.protocol}://${portal.host}/s5/blob/${cid}`;
                console.log('[S5_DBG:DOWNLOAD] Trying portal fallback', {
                    portal: portal.host,
                    cid: cid.slice(0, 20) + '...',
                    cidLength: cid.length
                });

                try {
                    const { fetch } = await this.getHttpClient();
                    const res = await fetch(downloadUrl, {
                        headers: portal.headers
                    });

                    if (res.ok) {
                        const bytes = new Uint8Array(await res.arrayBuffer());
                        // Verify hash matches
                        const downloadedHash = await this.crypto.hashBlake3(bytes);
                        if (areArraysEqual(downloadedHash, hash.subarray(1))) {
                            console.log('[S5_DBG:DOWNLOAD] Portal fallback SUCCESS', {
                                portal: portal.host,
                                size: bytes.length,
                                verified: true
                            });
                            // Cache the blob for future reads
                            this.setBlobInCache(hashKey, bytes);
                            return bytes;
                        } else {
                            console.log('[S5_DBG:DOWNLOAD] Portal fallback hash mismatch', {
                                portal: portal.host
                            });
                        }
                    } else {
                        console.log('[S5_DBG:DOWNLOAD] Portal fallback failed', {
                            portal: portal.host,
                            status: res.status
                        });
                    }
                } catch (portalError) {
                    console.log('[S5_DBG:DOWNLOAD] Portal fallback error', {
                        portal: portal.host,
                        error: ((portalError as Error).message || '').slice(0, 50)
                    });
                }
            }

            // All portals failed, throw original P2P error
            throw p2pError;
        }
    }

    /**
     * Download content by CID from S5 network
     *
     * This method allows downloading public content using only a CID (Content Identifier).
     * It uses the P2P network to discover download URLs (like signed Cloudflare R2 URLs)
     * and verifies the downloaded data matches the CID hash.
     *
     * @param cid - The CID as string (53-char raw hash or 59-char BlobIdentifier) or 32-byte Uint8Array
     * @returns The downloaded content as Uint8Array
     * @throws Error if download fails or hash verification fails
     *
     * @example
     * ```typescript
     * // Download by BlobIdentifier CID string
     * const data = await api.downloadByCID('blobb4qvvwvlw3o7y...');
     *
     * // Download by raw hash CID
     * const data = await api.downloadByCID('bik23kv3nxp4...');
     *
     * // Download by raw hash bytes
     * const data = await api.downloadByCID(hash);
     * ```
     */
    async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array> {
        // Import CID utilities and constants
        const { cidStringToHash } = await import('../fs/cid-utils.js');
        const { MULTIHASH_BLAKE3 } = await import('../constants.js');

        // Extract raw 32-byte hash from CID
        let rawHash: Uint8Array;

        if (cid instanceof Uint8Array) {
            if (cid.length !== 32) {
                throw new Error(`Invalid CID size: expected 32 bytes, got ${cid.length} bytes`);
            }
            rawHash = cid;
        } else if (typeof cid === 'string') {
            if (cid.length === 0) {
                throw new Error('CID string cannot be empty');
            }
            rawHash = cidStringToHash(cid);
        } else {
            throw new Error('CID must be a string or Uint8Array');
        }

        // Create hash with MULTIHASH prefix for downloadBlobAsBytes
        const hashWithPrefix = new Uint8Array(33);
        hashWithPrefix[0] = MULTIHASH_BLAKE3;
        hashWithPrefix.set(rawHash, 1);

        console.log('[Enhanced S5.js] downloadByCID: Starting P2P download', {
            cidType: cid instanceof Uint8Array ? 'Uint8Array' : 'string',
            hashPrefix: Array.from(rawHash.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('')
        });

        // Use P2P-based download (discovers signed URLs via network)
        const data = await this.downloadBlobAsBytes(hashWithPrefix);

        console.log('[Enhanced S5.js] downloadByCID: Download complete', {
            size: data.length,
            verified: true
        });

        return data;
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