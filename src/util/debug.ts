/**
 * Debug utility for S5.js using the standard 'debug' package
 *
 * Enable debug output with environment variable:
 *   DEBUG=s5js:* node app.js           # All debug output
 *   DEBUG=s5js:registry node app.js    # Only registry
 *   DEBUG=s5js:*,-s5js:cbor node app.js # All except cbor
 *
 * In browser, set localStorage.debug = 's5js:*' before loading
 */

import createDebug from 'debug';

// Create namespaced debuggers for different components
export const debug = {
  node: createDebug('s5js:node'),
  registry: createDebug('s5js:registry'),
  api: createDebug('s5js:api'),
  fs5: createDebug('s5js:fs5'),
  upload: createDebug('s5js:upload'),
  download: createDebug('s5js:download'),
  directory: createDebug('s5js:directory'),
  revision: createDebug('s5js:revision'),
  cbor: createDebug('s5js:cbor'),
  cache: createDebug('s5js:cache'),
  batch: createDebug('s5js:batch'),
  walker: createDebug('s5js:walker'),
  identity: createDebug('s5js:identity'),
  hidden_db: createDebug('s5js:hidden_db'),
};

type DebugCategory = keyof typeof debug;

/**
 * Debug log function compatible with existing dbg() calls
 * Maps category names to debug namespaces
 */
export function dbg(category: string, context: string, message: string, data?: any): void {
  const key = category.toLowerCase().replace(/_/g, '_') as DebugCategory;
  const debugFn = debug[key] || createDebug(`s5js:${key}`);

  if (data !== undefined) {
    debugFn('%s: %s %O', context, message, data);
  } else {
    debugFn('%s: %s', context, message);
  }
}

/**
 * Debug error log
 */
export function dbgError(category: string, context: string, message: string, error?: any): void {
  const key = category.toLowerCase().replace(/_/g, '_') as DebugCategory;
  const debugFn = debug[key] || createDebug(`s5js:${key}`);

  if (error) {
    debugFn('%s: %s %O', context, message, {
      message: error?.message || String(error),
      stack: error?.stack?.split?.('\n')?.slice(0, 3)?.join('\n'),
    });
  } else {
    debugFn('%s: %s', context, message);
  }
}
