import { CryptoImplementation } from '../api/crypto';
import { S5UserIdentity } from '../identity/identity';
import { base64UrlNoPaddingDecode, base64UrlNoPaddingEncode } from '../util/base64';
import { S5Portal } from './portal';
import { signChallenge, CHALLENGE_TYPE_REGISTER } from './sign_challenge';

const portalAccountRegisterEndpoint = "account/register";

export async function portalAccountRegister(
    portal: S5Portal,
    identity: S5UserIdentity,
    seed: Uint8Array,
    label: string,
    crypto: CryptoImplementation,
    authToken?: string,
): Promise<string> {
    const portalAccountsSeed: Uint8Array = identity.portalAccountSeed;

    const portalAccountKey = await crypto.hashBlake3(
        new Uint8Array(
            [...portalAccountsSeed, ...seed],
        ),
    );

    const portalAccountKeyPair = await crypto.newKeyPairEd25519(portalAccountKey);

    const publicKey = base64UrlNoPaddingEncode(portalAccountKeyPair.publicKey);

    const registerRequestResponse = await fetch(portal.apiURL(portalAccountRegisterEndpoint, { pubKey: publicKey }), {
        headers: authToken === undefined ? {} : {
            'Authorization': `Bearer ${authToken}`,
        }
    });

    if (!registerRequestResponse.ok) {
        throw new Error(`HTTP ${registerRequestResponse.status}: ${registerRequestResponse.body}`);
    }

    const challenge = base64UrlNoPaddingDecode((await registerRequestResponse.json()).challenge);

    const challengeResponse = await signChallenge(
        portalAccountKeyPair,
        challenge,
        CHALLENGE_TYPE_REGISTER,
        portal.host,
        crypto,
    );
    const registerResponse = await fetch(portal.apiURL(portalAccountRegisterEndpoint), {
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

    if (!registerResponse.ok) {
        throw new Error(`HTTP ${registerResponse.status}: ${registerResponse.body}`);
    }
    return registerResponse.headers.getSetCookie()[0].split("=")[1].split(';')[0];
}
