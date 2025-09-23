import { webcrypto } from 'node:crypto';

// Set NODE_ENV for test environment
process.env.NODE_ENV = 'test';

// Polyfill Web Crypto API for Node.js
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: false,
    configurable: true,
  });
}

// Ensure crypto.subtle is available
if (typeof globalThis.crypto.subtle === 'undefined') {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    value: webcrypto.subtle,
    writable: false,
    configurable: true,
  });
}
