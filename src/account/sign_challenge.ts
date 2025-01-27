import { CryptoImplementation, KeyPairEd25519 } from '../api/crypto';

const CHALLENGE_SIZE = 32;

export const CHALLENGE_TYPE_REGISTER = 1;
export const CHALLENGE_TYPE_LOGIN = 2;

export async function signChallenge(
    keyPair: KeyPairEd25519,
    challenge: Uint8Array,
    challengeType: number,
    portalHost: string,
    crypto: CryptoImplementation,
): Promise<AccountChallengeResponse> {
    if (challenge.length != CHALLENGE_SIZE) {
        throw 'Invalid challenge: wrong length';
    }

    const portalHostHash = await crypto.hashBlake3(
        new TextEncoder().encode(portalHost),
    );

    const message = new Uint8Array(
        [challengeType, ...challenge, ...portalHostHash],
    );

    const signatureBytes = await crypto.signEd25519(
        keyPair,
        message,
    );

    return { response: message, signature: signatureBytes };
}

interface AccountChallengeResponse {
    readonly response: Uint8Array;
    readonly signature: Uint8Array;
}
