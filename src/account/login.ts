import { CryptoImplementation } from '../api/crypto.js';
import { S5UserIdentity } from '../identity/identity.js';
import { base64UrlNoPaddingDecode, base64UrlNoPaddingEncode } from '../util/base64.js';
import { S5Portal } from './portal.js';
import { signChallenge, CHALLENGE_TYPE_LOGIN } from './sign_challenge.js';

const portalAccountLoginEndpoint = "account/login";

export async function portalAccountLogin(
    portal: S5Portal,
    identity: S5UserIdentity,
    seed: Uint8Array,
    label: string,
    crypto: CryptoImplementation,
): Promise<string> {
    const portalAccountsSeed: Uint8Array = identity.portalAccountSeed;

    const portalAccountKey = await crypto.hashBlake3(
        new Uint8Array(
            [...portalAccountsSeed, ...seed],
        ),
    );

    const portalAccountKeyPair = await crypto.newKeyPairEd25519(portalAccountKey);

    const publicKey = base64UrlNoPaddingEncode(portalAccountKeyPair.publicKey);

    const loginRequestResponse = await fetch(portal.apiURL(portalAccountLoginEndpoint, { pubKey: publicKey }));

    if (!loginRequestResponse.ok) {
        throw new Error(`HTTP ${loginRequestResponse.status}: ${loginRequestResponse.body}`);
    }

    const challenge = base64UrlNoPaddingDecode((await loginRequestResponse.json()).challenge);

    const challengeResponse = await signChallenge(
        portalAccountKeyPair,
        challenge,
        CHALLENGE_TYPE_LOGIN,
        portal.host,
        crypto,
    );
    const loginResponse = await fetch(portal.apiURL(portalAccountLoginEndpoint), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            'pubKey': publicKey,
            'response': base64UrlNoPaddingEncode(challengeResponse.response),
            'signature': base64UrlNoPaddingEncode(challengeResponse.signature),
            'label': label,
        })
    });

    if (!loginResponse.ok) {
        throw new Error(`HTTP ${loginResponse.status}: ${loginResponse.body}`);
    }
    return (await loginResponse.json()).authToken;
}
