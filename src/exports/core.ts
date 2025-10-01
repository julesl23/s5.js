/**
 * Core S5.js exports without media processing
 * Lighter bundle for applications that don't need media features
 */

// Main S5 classes
export { S5 } from '../s5.js';
export { FS5 } from '../fs/fs5.js';
export { S5UserIdentity } from '../identity/identity.js';
export { S5Node } from '../node/node.js';
export { S5APIInterface } from '../api/s5.js';
export { CryptoImplementation } from '../api/crypto.js';
export { JSCryptoImplementation } from '../api/crypto/js.js';

// Export utility classes
export { DirectoryWalker } from '../fs/utils/walker.js';
export { BatchOperations } from '../fs/utils/batch.js';

// Export core types
export type {
  DirV1,
  FileRef,
  DirRef,
  DirLink,
  PutOptions,
  GetOptions,
  ListOptions,
  ListResult,
  CursorData
} from '../fs/dirv1/types.js';

// Export utility types
export type {
  WalkOptions,
  WalkResult,
  WalkStats
} from '../fs/utils/walker.js';

export type {
  BatchOptions,
  BatchProgress,
  BatchResult
} from '../fs/utils/batch.js';