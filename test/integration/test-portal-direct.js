// test-portal-direct.js
import { S5 } from "../../dist/src/index.js";
import { getPortalUrl, getInitialPeers, getSeedPhrase } from "../test-config.js";
import { webcrypto } from "crypto";
import { TextEncoder, TextDecoder } from "util";
import { ReadableStream, WritableStream, TransformStream } from "stream/web";
import { Blob, File } from "buffer";
import { fetch, Headers, Request, Response, FormData } from "undici";
import WebSocket from "ws";
import "fake-indexeddb/auto";

// Set up global polyfills
if (!global.crypto) global.crypto = webcrypto;
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
if (!global.ReadableStream) global.ReadableStream = ReadableStream;
if (!global.WritableStream) global.WritableStream = WritableStream;
if (!global.TransformStream) global.TransformStream = TransformStream;
if (!global.Blob) global.Blob = Blob;
if (!global.File) global.File = File;
if (!global.Headers) global.Headers = Headers;
if (!global.Request) global.Request = Request;
if (!global.Response) global.Response = Response;
if (!global.fetch) global.fetch = fetch;
if (!global.FormData) global.FormData = FormData;
if (!global.WebSocket) global.WebSocket = WebSocket;

async function testPortalDirect() {
  const portalUrl = getPortalUrl();
  const initialPeers = getInitialPeers();
  const configuredSeedPhrase = getSeedPhrase();

  console.log("🚀 Testing Direct Portal API...\n");
  console.log(`📡 Portal: ${portalUrl}`);
  console.log(`🔗 Peers: ${initialPeers[0]}...\n`);

  try {
    // Step 1: Create S5 instance and recover identity
    const s5 = await S5.create({ initialPeers });

    const seedPhrase = configuredSeedPhrase ||
      "physics observe friend coin name kick walk buck poor blood library spy affect care copy";
    await s5.recoverIdentityFromSeedPhrase(seedPhrase);
    console.log("✅ Identity recovered\n");

    // Step 2: Register on the new portal
    console.log(`🌐 Registering on ${portalUrl} portal...`);
    try {
      await s5.registerOnNewPortal(portalUrl);
      console.log("✅ Portal registration successful!\n");
    } catch (error) {
      if (error.message.includes("already has an account")) {
        console.log(
          "ℹ️  Account already exists, continuing with existing account\n"
        );
      } else {
        throw error;
      }
    }

    // Step 3: Get the auth token
    // We need to access the internal API to get the auth token
    if (s5.apiWithIdentity && s5.apiWithIdentity.accountConfigs) {
      const portalConfigs = Object.values(s5.apiWithIdentity.accountConfigs);
      if (portalConfigs.length > 0) {
        const portal = portalConfigs[0];
        const authHeader =
          portal.headers["Authorization"] || portal.headers["authorization"];

        if (authHeader) {
          console.log("🔑 Auth token found\n");

          // Step 4: Test direct blob upload
          console.log("📤 Testing direct blob upload...");
          const testData = "Hello from direct portal test!";
          const blob = new Blob([testData]);
          const file = new File([blob], "test.txt", { type: "text/plain" });

          const formData = new FormData();
          formData.append("file", file);

          const uploadUrl = `${portalUrl}/s5/upload`;
          console.log(`Uploading to: ${uploadUrl}`);

          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              Authorization: authHeader,
            },
            body: formData,
          });

          console.log(`Response status: ${response.status}`);
          const responseText = await response.text();
          console.log(`Response body: ${responseText}`);

          if (response.ok) {
            const result = JSON.parse(responseText);
            console.log("✅ Direct upload successful!");
            console.log(`CID: ${result.cid}`);
          } else {
            console.log("❌ Direct upload failed");
          }
        } else {
          console.log("❌ No auth token found");
        }
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Stack:", error.stack);
  }
}

testPortalDirect();
