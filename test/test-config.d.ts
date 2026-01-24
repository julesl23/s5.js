/**
 * Type declarations for test-config.js
 */

export function getPortalUrl(): string;
export function getSeedPhrase(): string | null;
export function getInitialPeers(): string[];
export function getServerPort(): number;
export function isRealMode(): boolean;

export interface Config {
  portalUrl: string;
  seedPhrase: string | null;
  initialPeers: string[];
  serverPort: number;
  isRealMode: boolean;
}

export const config: Config;
export default config;
