/**
 * Test configuration module
 * Loads configuration from .env file for integration tests
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the directory of this config file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// Default portal URL if not set in .env
const DEFAULT_PORTAL_URL = 'https://s5.vup.cx';

// Default initial peers for P2P connections
const DEFAULT_INITIAL_PEERS = [
  'wss://z2Das8aEF7oNoxkcrfvzerZ1iBPWfm6D7gy3hVE4ALGSpVB@node.sfive.net/s5/p2p',
  'wss://z2DdbxV4xyoqWck5pXXJdVzRnwQC6Gbv6o7xDvyZvzKUfuj@s5.vup.dev/s5/p2p',
  'wss://z2DWuWNZcdSyZLpXFK2uCU3haaWMXrDAgxzv17sDEMHstZb@s5.garden/s5/p2p',
];

/**
 * Get portal URL from environment or use default
 */
export function getPortalUrl() {
  return process.env.S5_PORTAL_URL || DEFAULT_PORTAL_URL;
}

/**
 * Get seed phrase from environment (for authenticated tests)
 */
export function getSeedPhrase() {
  return process.env.S5_SEED_PHRASE || null;
}

/**
 * Get initial peers for P2P connections
 * Can be overridden via S5_INITIAL_PEERS env var (comma-separated)
 */
export function getInitialPeers() {
  if (process.env.S5_INITIAL_PEERS) {
    return process.env.S5_INITIAL_PEERS.split(',').map(p => p.trim());
  }
  return DEFAULT_INITIAL_PEERS;
}

/**
 * Get test server port
 */
export function getServerPort() {
  return parseInt(process.env.PORT || '5522', 10);
}

/**
 * Check if running in real mode (vs mocked)
 */
export function isRealMode() {
  return process.env.S5_MODE === 'real';
}

// Export configuration object for convenience
export const config = {
  portalUrl: getPortalUrl(),
  seedPhrase: getSeedPhrase(),
  initialPeers: getInitialPeers(),
  serverPort: getServerPort(),
  isRealMode: isRealMode(),
};

export default config;
