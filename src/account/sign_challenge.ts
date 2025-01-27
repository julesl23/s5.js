import { CryptoImplementation, KeyPairEd25519 } from '../api/crypto';

const CHALLENGE_SIZE = 32;

const CHALLENGE_TYPE_REGISTER = 1;
const CHALLENGE_TYPE_LOGIN = 2;

async function signChallenge(
    keyPair: KeyPairEd25519,
    challenge: Uint8Array,
    challengeType: number,
    serviceAuthority: string,
    crypto: CryptoImplementation,
): Promise<AccountChallengeResponse> {
    if (challenge.length != CHALLENGE_SIZE) {
        throw 'Invalid challenge: wrong length';
    }

    const serviceBytes = await crypto.hashBlake3(
        new TextEncoder().encode(serviceAuthority),
    );

    const message = new Uint8Array(
        [challengeType, ...challenge, ...serviceBytes],
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
