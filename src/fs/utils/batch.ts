import { FS5 } from "../fs5.js";
import { DirectoryWalker, WalkOptions } from "./walker.js";
import { FileRef, DirRef, PutOptions } from "../dirv1/types.js";
import { encodeS5, decodeS5 } from "../dirv1/cbor-config.js";

/**
 * Options for batch operations
 */
export interface BatchOptions {
  /** Whether to operate recursively (default: true) */
  recursive?: boolean;
  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void;
  /** Error handling mode */
  onError?: "stop" | "continue" | ((error: Error, path: string) => "stop" | "continue");
  /** Resume from cursor */
  cursor?: string;
  /** Whether to preserve metadata (timestamps, etc) */
  preserveMetadata?: boolean;
}

/**
 * Progress information for batch operations
 */
export interface BatchProgress {
  /** Operation being performed */
  operation: "copy" | "delete";
  /** Total items to process (if known) */
  total?: number;
  /** Items processed so far */
  processed: number;
  /** Current item being processed */
  currentPath: string;
  /** Cursor for resuming */
  cursor?: string;
}

/**
 * Result of a batch operation
 */
export interface BatchResult {
  /** Number of items successfully processed */
  success: number;
  /** Number of items that failed */
  failed: number;
  /** Errors encountered (if onError was "continue") */
  errors: Array<{ path: string; error: Error }>;
  /** Cursor for resuming (if operation was interrupted) */
  cursor?: string;
}

/**
 * Internal state for batch operations
 */
interface BatchState {
  success: number;
  failed: number;
  errors: Array<{ path: string; error: Error }>;
  lastCursor?: string;
}

/**
 * Batch operations for FS5 directories
 */
export class BatchOperations {
  private walker: DirectoryWalker;

  constructor(private fs: FS5) {
    this.walker = new DirectoryWalker(fs, '/');
  }

  /**
   * Copy a directory and all its contents to a new location
   * @param sourcePath Source directory path
   * @param destPath Destination directory path
   * @param options Batch operation options
   */
  async copyDirectory(
    sourcePath: string, 
    destPath: string, 
    options: BatchOptions = {}
  ): Promise<BatchResult> {
    const state: BatchState = {
      success: 0,
      failed: 0,
      errors: []
    };

    const { 
      recursive = true, 
      onProgress, 
      onError = "stop",
      cursor,
      preserveMetadata = true
    } = options;

    try {
      // Ensure destination directory exists
      await this._ensureDirectory(destPath);

      // Walk source directory
      const walkOptions: WalkOptions = {
        recursive,
        cursor
      };

      // Create walker for source path
      const sourceWalker = new DirectoryWalker(this.fs, sourcePath);
      for await (const { path, name, type, size, depth, cursor: walkCursor } of sourceWalker.walk(walkOptions)) {
        const relativePath = path.substring(sourcePath.length);
        const targetPath = destPath + relativePath;

        state.lastCursor = walkCursor;

        try {
          if (type === 'directory') {
            // It's a directory - create it
            await this._ensureDirectory(targetPath);
          } else {
            // It's a file - copy it
            const fileData = await this.fs.get(path);
            if (!fileData) continue;

            const putOptions: PutOptions = {};
            if (preserveMetadata) {
              // Get metadata to preserve media type
              const metadata = await this.fs.getMetadata(path);
              if (metadata?.mediaType) {
                putOptions.mediaType = metadata.mediaType;
              }
            }

            await this.fs.put(targetPath, fileData, putOptions);
          }

          state.success++;

          // Report progress
          if (onProgress) {
            onProgress({
              operation: "copy",
              processed: state.success + state.failed,
              currentPath: path,
              cursor: state.lastCursor
            });
          }

        } catch (error) {
          state.failed++;
          const err = error as Error;
          state.errors.push({ path, error: err });

          // Handle error based on mode
          const errorAction = typeof onError === "function" 
            ? onError(err, path) 
            : onError;

          if (errorAction === "stop") {
            throw new Error(`Copy failed at ${path}: ${err.message}`);
          }
        }
      }

    } catch (error) {
      // Operation was interrupted
      return {
        ...state,
        cursor: state.lastCursor
      };
    }

    return state;
  }

  /**
   * Delete a directory and optionally all its contents
   * @param path Directory path to delete
   * @param options Batch operation options
   */
  async deleteDirectory(
    path: string, 
    options: BatchOptions = {}
  ): Promise<BatchResult> {
    const state: BatchState = {
      success: 0,
      failed: 0,
      errors: []
    };

    const { 
      recursive = true, 
      onProgress, 
      onError = "stop",
      cursor
    } = options;

    try {
      if (recursive) {
        // First, collect all paths to delete (bottom-up order)
        const pathsToDelete: Array<{ path: string; isDir: boolean }> = [];
        
        const walkOptions: WalkOptions = {
          recursive: true,
          cursor
        };

        // Create walker for path to delete
        const deleteWalker = new DirectoryWalker(this.fs, path);
        for await (const { path: entryPath, type, cursor: walkCursor } of deleteWalker.walk(walkOptions)) {
          state.lastCursor = walkCursor;
          pathsToDelete.push({
            path: entryPath,
            isDir: type === 'directory'
          });
        }

        // Sort paths by depth (deepest first) to delete bottom-up
        pathsToDelete.sort((a, b) => {
          const depthA = a.path.split('/').length;
          const depthB = b.path.split('/').length;
          return depthB - depthA;
        });

        // Delete all collected paths
        for (const { path: entryPath, isDir } of pathsToDelete) {
          try {
            await this.fs.delete(entryPath);
            state.success++;

            if (onProgress) {
              onProgress({
                operation: "delete",
                total: pathsToDelete.length,
                processed: state.success + state.failed,
                currentPath: entryPath,
                cursor: state.lastCursor
              });
            }

          } catch (error) {
            state.failed++;
            const err = error as Error;
            state.errors.push({ path: entryPath, error: err });

            const errorAction = typeof onError === "function" 
              ? onError(err, entryPath) 
              : onError;

            if (errorAction === "stop") {
              throw new Error(`Delete failed at ${entryPath}: ${err.message}`);
            }
          }
        }

        // Finally, delete the directory itself
        try {
          await this.fs.delete(path);
          state.success++;
        } catch (error) {
          state.failed++;
          const err = error as Error;
          state.errors.push({ path, error: err });
          
          if (onError === "stop") {
            throw err;
          }
        }

      } else {
        // Non-recursive delete - only delete if empty
        const entries = [];
        for await (const entry of this.fs.list(path, { limit: 1 })) {
          entries.push(entry);
        }

        if (entries.length > 0) {
          throw new Error(`Directory ${path} is not empty`);
        }

        await this.fs.delete(path);
        state.success++;

        if (onProgress) {
          onProgress({
            operation: "delete",
            processed: 1,
            currentPath: path
          });
        }
      }

    } catch (error) {
      // Operation was interrupted
      return {
        ...state,
        cursor: state.lastCursor
      };
    }

    return state;
  }

  /**
   * Ensure a directory exists, creating it and any parent directories if needed
   * @param path Directory path to ensure exists
   */
  async _ensureDirectory(path: string): Promise<void> {
    if (path === "/" || path === "") {
      return; // Root always exists
    }

    try {
      // Check if directory already exists
      const metadata = await this.fs.getMetadata(path);
      if (metadata && metadata.type === "directory") {
        return; // Already exists
      }
      
      // If it's a file, throw error
      if (metadata && metadata.type === "file") {
        throw new Error(`Path ${path} exists but is a file, not a directory`);
      }
    } catch (error) {
      // Directory doesn't exist, need to create it
    }

    // Ensure parent directory exists first
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
    if (parentPath !== path) {
      await this._ensureDirectory(parentPath);
    }

    // Create this directory
    try {
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      const dirName = path.substring(path.lastIndexOf('/') + 1);
      await this.fs.createDirectory(parentPath, dirName);
    } catch (error) {
      // Might have been created concurrently, check again
      const metadata = await this.fs.getMetadata(path);
      if (!metadata || metadata.type !== "directory") {
        throw error;
      }
    }
  }
}