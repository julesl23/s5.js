/**
 * Advanced S5.js API - CID-aware operations for power users
 *
 * This module includes all core functionality plus CID (Content Identifier)
 * operations for advanced developers who need content-addressed storage capabilities.
 *
 * @example
 * ```typescript
 * import { S5, FS5Advanced, formatCID, parseCID, DirectoryWalker } from 's5/advanced';
 *
 * const s5 = await S5.create();
 * await s5.recoverIdentityFromSeedPhrase(seedPhrase);
 *
 * // Create advanced API instance
 * const advanced = new FS5Advanced(s5.fs);
 *
 * // Extract CID from path
 * const cid = await advanced.pathToCID('home/data.txt');
 *
 * // Format CID for display
 * const formatted = formatCID(cid, 'base32');
 * console.log(formatted);
 *
 * // Parse CID from string
 * const parsed = parseCID(formatted);
 *
 * // Retrieve data by CID
 * const data = await advanced.getByCID(cid);
 * ```
 */

// Re-export all core functionality (S5, FS5, DirectoryWalker, BatchOperations, etc.)
export * from './core.js';

// Advanced API class for CID-aware operations
export { FS5Advanced } from '../fs/fs5-advanced.js';

// CID utility functions
export {
  formatCID,
  parseCID,
  verifyCID,
  cidToString,
  detectCIDFormat,
  cidStringToHash,
  cidToDownloadFormat,
} from '../fs/cid-utils.js';

// CID types
export type { CIDFormat } from '../fs/cid-utils.js';

// Additional types for advanced users (not in core)
export type {
  BlobLocation,
  HAMTShardingConfig,
} from '../fs/dirv1/types.js';
