import { CryptoImplementation } from '../api/crypto.js';
import { S5UserIdentity } from '../identity/identity.js';
import { base64UrlNoPaddingDecode, base64UrlNoPaddingEncode } from '../util/base64.js';
import { S5Portal } from './portal.js';
import { signChallenge, CHALLENGE_TYPE_REGISTER } from './sign_challenge.js';

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
        headers: authToken === undefined
            ? { 'Content-Type': 'application/json' }
            : {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
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
    
    // Try to get auth token from cookie header first (new portal behavior)
    const setCookieHeader = registerResponse.headers.get('set-cookie');
    if (setCookieHeader) {
        const match = setCookieHeader.match(/s5-auth-token=([^;]+)/);
        if (match) {
            return match[1];
        }
    }
    
    // Fall back to JSON body (old portal behavior)
    try {
        const responseText = await registerResponse.text();
        if (responseText) {
            const result = JSON.parse(responseText);
            return result.authToken;
        }
    } catch (e) {
        // If no JSON body and no cookie, throw error
        throw new Error('No auth token found in response (neither in cookie nor JSON body)');
    }
    
    throw new Error('No auth token found in response');
}
