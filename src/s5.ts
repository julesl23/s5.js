import { CryptoImplementation } from './api/crypto';
import { FS5 } from './fs/fs5';
import { IDBStore } from './kv/idb';
import { JSCryptoImplementation } from './api/crypto/js';
import { KeyValueStore } from './kv/kv';
import { S5APIInterface } from './api/s5';
import { S5Node } from './node/node';
import { S5UserIdentity } from './identity/identity';

export class S5 {
  private readonly node: S5Node;
  public get api(): S5APIInterface {
    // TODO only return node API directly if there is no identity
    return this.node;
  };
  private _authBox: KeyValueStore;
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
    authBox,
    identity,
  }: {
    node: S5Node;
    authBox: KeyValueStore;
    identity?: S5UserIdentity;
  }) {
    this.node = node;
    this._authBox = authBox;
    this.identity = identity;
  }

  static async create({
    initialPeers = [
      'wss://z2Das8aEF7oNoxkcrfvzerZ1iBPWfm6D7gy3hVE4ALGSpVB@node.sfive.net/s5/p2p',
      'wss://z2DdbxV4xyoqWck5pXXJdVzRnwQC6Gbv6o7xDvyZvzKUfuj@s5.vup.dev/s5/p2p',
      'wss://z2DWuWNZcdSyZLpXFK2uCU3haaWMXrDAgxzv17sDEMHstZb@s5.garden/s5/p2p',
      'wss://z2DezEfGjmwumVTtEM4G5pSo9mGwrach56nhEH6m1KRXMnL@node.fi.sfive.network/s5/p2p',
      'wss://s5.ninja/s5/p2p',
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

    // TODO Implement identity
    const authBox = await IDBStore.open("s5_auth");
    return new S5({
      node,
      authBox,
      identity: undefined,
    });
  }
}
