import * as msgpackr from 'msgpackr';
import { CryptoImplementation } from '../api/crypto';
import { deriveHashInt } from '../util/derive_hash';
import { validatePhrase } from './seed_phrase/seed_phrase';

const authPayloadVersion1 = 0x01;

const mainIdentityTweak = 0;

// public
const publicIdentityTweak = 1;

const signingKeyPairTweak = 2;
const encryptionKeyPairTweak = 3;
const resolverLinksTweak = 4;
const publicReservedTweak1 = 5;
const publicReservedTweak2 = 6;

// private
const privateDataTweak = 64;

const storageServiceAccountsTweak = 65;
const hiddenDBTweak = 66;
const fileSystemTweak = 67;
const privateReservedTweak1 = 68;
const privateReservedTweak2 = 69;

const extensionTweak = 127;


export class S5UserIdentity {
    private seeds: Map<number, Uint8Array> = new Map();

    constructor(seeds: Map<number, Uint8Array>) {
        this.seeds = seeds;
    }

    static unpack(bytes: Uint8Array): S5UserIdentity {
        const data = msgpackr.unpack(new Uint8Array(
            [0x92, ...bytes]
        ));
        return new S5UserIdentity(data[1])
    }

    pack(): Uint8Array {
        return msgpackr.pack([
            authPayloadVersion1,
            this.seeds,
        ]).subarray(1);
    }

    static async fromSeedPhrase(
        seedPhrase: string,
        crypto: CryptoImplementation
    ): Promise<S5UserIdentity> {
        return new S5UserIdentity(
            await this.generateSeedMapFromSeedPhrase(seedPhrase, crypto)
        );
    }

    static async generateSeedMapFromSeedPhrase(
        seedPhrase: string,
        crypto: CryptoImplementation,
    ): Promise<Map<number, Uint8Array>> {
        const full = false;
        const seedEntropy = validatePhrase(seedPhrase, crypto);

        const seedBytes = crypto.hashBlake3Sync(seedEntropy[2]!);

        const mainIdentitySeed = deriveHashInt(
            seedBytes,
            mainIdentityTweak,
            crypto,
        );

        const publicIdentitySeed = deriveHashInt(
            mainIdentitySeed,
            publicIdentityTweak,
            crypto,
        );

        const keyRotationIndex = 0;

        const publicSubSeed = deriveHashInt(
            publicIdentitySeed,
            keyRotationIndex,
            crypto,
        );

        const privateDataSeed = deriveHashInt(
            mainIdentitySeed,
            privateDataTweak,
            crypto,
        );

        const privateSubSeed = deriveHashInt(
            privateDataSeed,
            keyRotationIndex,
            crypto,
        );

        const seeds: Map<number, Uint8Array> = new Map();

        seeds[signingKeyPairTweak] = deriveHashInt(
            publicSubSeed,
            signingKeyPairTweak,
            crypto,
        );
        seeds[encryptionKeyPairTweak] = deriveHashInt(
            publicSubSeed,
            encryptionKeyPairTweak,
            crypto,
        );
        seeds[resolverLinksTweak] = deriveHashInt(
            publicSubSeed,
            resolverLinksTweak,
            crypto,
        );
        seeds[publicReservedTweak1] = deriveHashInt(
            publicSubSeed,
            publicReservedTweak1,
            crypto,
        );
        seeds[publicReservedTweak2] = deriveHashInt(
            publicSubSeed,
            publicReservedTweak2,
            crypto,
        );
        seeds[storageServiceAccountsTweak] = deriveHashInt(
            privateSubSeed,
            storageServiceAccountsTweak,
            crypto,
        );
        seeds[hiddenDBTweak] = deriveHashInt(
            privateSubSeed,
            hiddenDBTweak,
            crypto,
        );
        seeds[fileSystemTweak] = deriveHashInt(
            privateSubSeed,
            fileSystemTweak,
            crypto,
        );
        seeds[privateReservedTweak1] = deriveHashInt(
            privateSubSeed,
            privateReservedTweak1,
            crypto,
        );
        seeds[privateReservedTweak2] = deriveHashInt(
            privateSubSeed,
            privateReservedTweak2,
            crypto,
        );
        seeds[extensionTweak] = deriveHashInt(
            privateSubSeed,
            extensionTweak,
            crypto,
        );

        if (full) {
            seeds[publicIdentityTweak] = publicIdentitySeed;
        }

        return seeds;
    }

    get fsRootKey(): Uint8Array {
        return this.seeds[fileSystemTweak]!;
    }
    get hiddenDBKey(): Uint8Array {
        return this.seeds[hiddenDBTweak]!;
    }
    get portalAccountSeed(): Uint8Array {
        return this.seeds[storageServiceAccountsTweak]!;
    }
}