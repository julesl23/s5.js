import { FS5 } from "../fs5.js";
import { FileRef, DirRef, ListOptions } from "../dirv1/types.js";
import { encodeS5, decodeS5 } from "../dirv1/cbor-config.js";

/**
 * Options for walking directories
 */
export interface WalkOptions {
  /** Whether to recursively walk subdirectories (default: true) */
  recursive?: boolean;
  /** Maximum depth to walk (default: Infinity) */
  maxDepth?: number;
  /** Whether to include files in results (default: true) */
  includeFiles?: boolean;
  /** Whether to include directories in results (default: true) */
  includeDirectories?: boolean;
  /** Filter function to include/exclude entries */
  filter?: (name: string, type: 'file' | 'directory') => boolean;
  /** Resume from a cursor position */
  cursor?: string;
}

/**
 * Result of walking an entry
 */
export interface WalkResult {
  /** Full path to the entry */
  path: string;
  /** Name of the entry (basename) */
  name: string;
  /** Type of entry */
  type: 'file' | 'directory';
  /** Size in bytes (for files) */
  size?: number;
  /** Depth from starting directory */
  depth: number;
  /** Cursor for resuming walk */
  cursor?: string;
}

/**
 * Statistics from walking a directory
 */
export interface WalkStats {
  /** Total number of files */
  files: number;
  /** Total number of directories */
  directories: number;
  /** Total size in bytes */
  totalSize: number;
}

/**
 * Internal cursor state for resuming walks
 */
interface WalkCursor {
  /** Current directory path */
  path: string;
  /** Depth in the tree */
  depth: number;
  /** Directory listing cursor */
  dirCursor?: string;
  /** Stack of pending directories to process */
  pendingStack: Array<{ path: string; depth: number }>;
}

/**
 * Directory walker for traversing FS5 directory structures
 */
export class DirectoryWalker {
  constructor(
    private fs: FS5,
    private basePath: string
  ) {}

  /**
   * Walk a directory tree, yielding entries as they are encountered
   * @param options Walk options
   */
  async *walk(options: WalkOptions = {}): AsyncIterableIterator<WalkResult> {
    const {
      recursive = true,
      maxDepth = Infinity,
      includeFiles = true,
      includeDirectories = true,
      filter,
      cursor
    } = options;

    // Initialize or restore cursor state
    let state: WalkCursor;
    if (cursor) {
      try {
        const decoded = decodeS5(new TextEncoder().encode(cursor));
        state = decoded as WalkCursor;
      } catch (err) {
        // If decoding fails, start fresh
        state = {
          path: this.basePath,
          depth: 0,
          dirCursor: undefined,
          pendingStack: []
        };
      }
    } else {
      state = {
        path: this.basePath,
        depth: 0,
        dirCursor: undefined,
        pendingStack: []
      };
    }

    // Process directories from the stack
    while (state.path || state.pendingStack.length > 0) {
      // Pop from stack if current path is done
      if (!state.path && state.pendingStack.length > 0) {
        const next = state.pendingStack.shift()!;
        state.path = next.path;
        state.depth = next.depth;
        state.dirCursor = undefined;
      }

      if (!state.path) break;

      try {
        // List directory entries
        const listOptions: ListOptions = {};
        if (state.dirCursor) {
          listOptions.cursor = state.dirCursor;
        }

        console.log('[Enhanced S5.js] DirectoryWalker: Traversing', {
          currentPath: state.path,
          depth: state.depth,
          pendingDirs: state.pendingStack.length,
          recursive: recursive,
          cursor: state.dirCursor ? 'resuming' : 'fresh'
        });

        let hasMore = false;
        for await (const result of this.fs.list(state.path, listOptions)) {
          const { name, type, cursor: nextCursor } = result;
          const entryPath = state.path === "/" ? `/${name}` : `${state.path}/${name}`;
          const isDirectory = type === 'directory';
          
          // Check if we should yield this entry
          let shouldYield = true;
          if (!includeFiles && type === 'file') shouldYield = false;
          if (!includeDirectories && type === 'directory') shouldYield = false;
          
          // Apply filter if we're going to yield
          if (shouldYield && filter && !filter(name, type)) shouldYield = false;

          // Yield the entry if it passes all checks
          if (shouldYield) {
            // Create cursor for this position
            const currentCursor = new TextDecoder().decode(encodeS5({
              path: state.path,
              depth: state.depth,
              dirCursor: nextCursor,
              pendingStack: [...state.pendingStack]
            }));

            yield {
              path: entryPath,
              name: name,
              type: type,
              size: result.size ? Number(result.size) : undefined,
              depth: state.depth,
              cursor: currentCursor
            };
          }

          // Queue subdirectories for recursive walking regardless of yielding
          // We need to traverse directories even if we don't yield them
          if (recursive && 
              state.depth + 1 < maxDepth && 
              isDirectory) {
            state.pendingStack.push({
              path: entryPath,
              depth: state.depth + 1
            });
          }

          state.dirCursor = nextCursor;
          hasMore = true;
        }

        // If we've finished this directory, clear the cursor
        if (!hasMore) {
          state.path = "";
          state.dirCursor = undefined;
        }

      } catch (error) {
        // Skip directories that can't be read
        console.warn(`Failed to read directory ${state.path}:`, error);
        state.path = "";
        state.dirCursor = undefined;
      }
    }
  }

  /**
   * Count the total number of entries in a directory tree
   * @param options Walk options (uses same filtering)
   */
  async count(options: WalkOptions = {}): Promise<WalkStats> {
    const stats: WalkStats = {
      files: 0,
      directories: 0,
      totalSize: 0
    };
    
    for await (const entry of this.walk(options)) {
      if (entry.type === 'file') {
        stats.files++;
        stats.totalSize += entry.size || 0;
      } else {
        stats.directories++;
      }
    }
    
    return stats;
  }

}