/**
 * Debug utility for S5.js - easily toggleable debugging
 *
 * To disable all debug logging, set S5_DEBUG_ENABLED = false
 * To strip debug logs in production: search for "S5_DBG" and remove
 */

// Toggle this to enable/disable all debug logging
export const S5_DEBUG_ENABLED = false;

/**
 * Simple console.log wrapper that respects S5_DEBUG_ENABLED
 * Use this for [S5_DBG:*] and [Enhanced S5.js] logs
 */
export function debugLog(...args: any[]): void {
  if (S5_DEBUG_ENABLED) {
    console.log(...args);
  }
}

// Debug categories - toggle individual categories
export const S5_DEBUG_CATEGORIES = {
  FS5: true,           // File system operations
  IDENTITY: true,      // Identity/account operations
  HIDDEN_DB: true,     // Hidden database operations
  REGISTRY: true,      // Registry operations
  UPLOAD: true,        // Blob upload operations
  DOWNLOAD: true,      // Blob download operations
  DIRECTORY: true,     // Directory transactions
  REVISION: true,      // Revision tracking
};

type DebugCategory = keyof typeof S5_DEBUG_CATEGORIES;

/**
 * Debug log function - prefix all messages with S5_DBG for easy stripping
 * Usage: dbg('FS5', 'methodName', 'message', { data })
 */
export function dbg(category: DebugCategory, context: string, message: string, data?: any): void {
  if (!S5_DEBUG_ENABLED || !S5_DEBUG_CATEGORIES[category]) return;

  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = `[S5_DBG:${category}:${timestamp}]`;

  if (data !== undefined) {
    // Truncate large data for readability
    const dataStr = formatDebugData(data);
    console.log(`${prefix} ${context}: ${message}`, dataStr);
  } else {
    console.log(`${prefix} ${context}: ${message}`);
  }
}

/**
 * Debug error log
 */
export function dbgError(category: DebugCategory, context: string, message: string, error?: any): void {
  if (!S5_DEBUG_ENABLED || !S5_DEBUG_CATEGORIES[category]) return;

  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = `[S5_DBG:${category}:${timestamp}]`;

  if (error) {
    const errorInfo = {
      message: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
    };
    console.error(`${prefix} ${context}: ${message}`, errorInfo);
  } else {
    console.error(`${prefix} ${context}: ${message}`);
  }
}

/**
 * Format data for debug output - truncate large values
 */
function formatDebugData(data: any): any {
  if (data === null || data === undefined) return data;

  if (data instanceof Uint8Array) {
    if (data.length <= 16) {
      return `Uint8Array(${data.length})[${Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')}]`;
    }
    return `Uint8Array(${data.length})[${Array.from(data.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')}...]`;
  }

  if (typeof data === 'string' && data.length > 100) {
    return data.slice(0, 100) + '...';
  }

  if (Array.isArray(data)) {
    if (data.length > 10) {
      return `Array(${data.length})[${data.slice(0, 3).map(formatDebugData).join(', ')}...]`;
    }
    return data.map(formatDebugData);
  }

  if (typeof data === 'object') {
    const formatted: any = {};
    const keys = Object.keys(data);
    for (const key of keys.slice(0, 10)) {
      formatted[key] = formatDebugData(data[key]);
    }
    if (keys.length > 10) {
      formatted['...'] = `(${keys.length - 10} more keys)`;
    }
    return formatted;
  }

  return data;
}

/**
 * Debug wrapper for async functions - logs entry, exit, and errors
 */
export async function dbgWrap<T>(
  category: DebugCategory,
  context: string,
  fn: () => Promise<T>,
  inputData?: any
): Promise<T> {
  if (!S5_DEBUG_ENABLED || !S5_DEBUG_CATEGORIES[category]) {
    return fn();
  }

  dbg(category, context, 'ENTER', inputData);
  const startTime = Date.now();

  try {
    const result = await fn();
    const elapsed = Date.now() - startTime;
    dbg(category, context, `EXIT (${elapsed}ms)`, { resultType: typeof result });
    return result;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    dbgError(category, context, `ERROR (${elapsed}ms)`, error);
    throw error;
  }
}
