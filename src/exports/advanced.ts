/**
 * Advanced S5.js API - CID-aware operations for power users
 *
 * This module provides low-level CID (Content Identifier) operations for advanced
 * developers who need content-addressed storage capabilities.
 *
 * @example
 * ```typescript
 * import { S5 } from 's5';
 * import { FS5Advanced, formatCID, parseCID } from 's5/advanced';
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

// Core advanced API class
export { FS5Advanced } from '../fs/fs5-advanced.js';
export type { PutWithCIDResult, MetadataWithCIDResult } from '../fs/fs5-advanced.js';

// CID utility functions
export {
  formatCID,
  parseCID,
  verifyCID,
  cidToString,
} from '../fs/cid-utils.js';

// DirV1 types for advanced users
export type {
  DirV1,
  FileRef,
  DirRef,
  DirLink,
  BlobLocation,
  HAMTShardingConfig,
  PutOptions,
  ListOptions,
  GetOptions,
  ListResult,
} from '../fs/dirv1/types.js';

// Re-export core S5 for convenience
export { S5 } from '../s5.js';
export { FS5 } from '../fs/fs5.js';
