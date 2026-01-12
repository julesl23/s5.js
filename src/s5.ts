import { CryptoImplementation } from './api/crypto.js';
import { FS5 } from './fs/fs5.js';
import { IDBStore } from './kv/idb.js';
import { JSCryptoImplementation } from './api/crypto/js.js';
import { KeyValueStore } from './kv/kv.js';
import { S5APIInterface } from './api/s5.js';
import { S5Node } from './node/node.js';
import { S5UserIdentity } from './identity/identity.js';
import { S5APIWithIdentity } from './identity/api.js';
import { generatePhrase } from './identity/seed_phrase/seed_phrase.js';
import { utf8ToBytes } from '@noble/ciphers/utils';
import { ConnectionStatus } from './node/p2p.js';

export class S5 {
  private readonly node: S5Node;
  public apiWithIdentity: S5APIWithIdentity | undefined;

  public get api(): S5APIInterface {
    if (this.hasIdentity) {
      return this.apiWithIdentity!;
    }
    return this.node;
  };
  private authStore: KeyValueStore;
  private identity?: S5UserIdentity;

  get crypto(): CryptoImplementation {
    return this.node.crypto;
  }

  get fs(): FS5 {
    return new FS5(this.api, this.identity);
  }

  get hasIdentity(): boolean {
    return this.identity !== undefined;
  }

  static initDataPath(path: string): void {
    // TODO Needed for native
  }

  private constructor({
    node,
    authStore,
    identity,
  }: {
    node: S5Node;
    authStore: KeyValueStore;
    identity?: S5UserIdentity;
  }) {
    this.node = node;
    this.authStore = authStore;
    this.identity = identity;
  }

  static async create({
    initialPeers = [
      'wss://z2Das8aEF7oNoxkcrfvzerZ1iBPWfm6D7gy3hVE4ALGSpVB@node.sfive.net/s5/p2p',
      'wss://z2DdbxV4xyoqWck5pXXJdVzRnwQC6Gbv6o7xDvyZvzKUfuj@s5.vup.dev/s5/p2p',
      'wss://z2DWuWNZcdSyZLpXFK2uCU3haaWMXrDAgxzv17sDEMHstZb@s5.garden/s5/p2p',
      'wss://z2DezEfGjmwumVTtEM4G5pSo9mGwrach56nhEH6m1KRXMnL@node.fi.sfive.network/s5/p2p',
      'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p',
    ],
    // TODO autoConnectToNewNodes = false,
  }: {
    initialPeers?: string[];
    // autoConnectToNewNodes?: boolean;
  }): Promise<S5> {
    const crypto = new JSCryptoImplementation();
    const node = new S5Node(crypto);
    await node.init((name: string) => IDBStore.open(name));
    for (const uri of initialPeers) {
      node.p2p.connectToNode(uri);
    }
    await node.ensureInitialized();

    const authStore = await IDBStore.open("auth");
    if (await authStore.contains(utf8ToBytes('identity_main'))) {
      const newIdentity = await S5UserIdentity.unpack(
        (await authStore.get(utf8ToBytes('identity_main'))) as Uint8Array,
        
      );
      const apiWithIdentity = new S5APIWithIdentity(
        node,
        newIdentity,
        authStore,
      );
      await apiWithIdentity.initStorageServices();
      const s5 = new S5({
        node,
        authStore,
        identity: newIdentity,
      });
      s5.apiWithIdentity = apiWithIdentity;
      return s5;
    }
    return new S5({
      node,
      authStore,
      identity: undefined,
    });
  }

  generateSeedPhrase(): string {
    return generatePhrase(this.crypto);
  }

  async recoverIdentityFromSeedPhrase(seedPhrase: string): Promise<void> {
    const newIdentity = await S5UserIdentity.fromSeedPhrase(
      seedPhrase,
      this.crypto,
    );
    this.authStore.put(utf8ToBytes('identity_main'), newIdentity.pack());
    const apiWithIdentity = new S5APIWithIdentity(
      this.node,
      newIdentity,
      this.authStore,
    );
    await apiWithIdentity.initStorageServices();
    this.apiWithIdentity = apiWithIdentity;
    this.identity = newIdentity;
  }

  async registerOnNewPortal(url: string, inviteCode?: string): Promise<void> {
    if (!this.hasIdentity) {
      throw new Error('No identity available');
    }
    await this.apiWithIdentity!.registerAccount(
      url,
      inviteCode,
    );
  }

  /**
   * Get the current connection status to the S5 network.
   * @returns 'connected' if at least one peer has completed handshake,
   *          'connecting' if at least one peer socket is open but handshake not complete,
   *          'disconnected' if no peers or all sockets closed
   */
  getConnectionStatus(): ConnectionStatus {
    return this.node.p2p.getConnectionStatus();
  }

  /**
   * Subscribe to connection status changes.
   * @param callback Called when connection status changes. Also called immediately with current status.
   * @returns Unsubscribe function
   */
  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    return this.node.p2p.onConnectionChange(callback);
  }

  /**
   * Force reconnection to the S5 network.
   * Closes all existing connections and re-establishes them.
   * @throws Error if reconnection fails after 10 second timeout
   */
  async reconnect(): Promise<void> {
    await this.node.p2p.reconnect();
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
   * @throws Error if no identity/portals configured, all portals fail, or hash verification fails
   *
   * @example
   * ```typescript
   * // User A: Upload and share
   * await fs5.put("home/public/photo.jpg", imageData);
   * const cid = await advanced.pathToCID("home/public/photo.jpg");
   * const cidString = formatCID(cid);
   * console.log("Share this CID:", cidString);
   *
   * // User B: Download by CID
   * const data = await s5.downloadByCID(cidString);
   * ```
   */
  async downloadByCID(cid: string | Uint8Array): Promise<Uint8Array> {
    if (!this.apiWithIdentity) {
      throw new Error('No identity configured. Call recoverIdentityFromSeedPhrase() and registerOnNewPortal() first.');
    }
    return this.apiWithIdentity.downloadByCID(cid);
  }
}
