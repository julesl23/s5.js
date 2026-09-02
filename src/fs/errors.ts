/**
 * Typed filesystem errors.
 *
 * The directory-load contract (added with the ensureIdentityInitialized
 * data-loss fix): a directory that *cannot be loaded right now* must be
 * clearly distinguishable from a directory that is *genuinely absent*.
 *
 * - Genuinely absent (no registry entry): reads return `undefined`, as before.
 * - Unavailable (registry entry exists, but the blob 404s / fails to download):
 *   throw `S5DirectoryLoadError` with `retryable === true`. Consumers MUST treat
 *   this as "retry with backoff", NEVER as "empty". Treating a transient 404 as
 *   an empty directory is what silently orphaned entire user subtrees — the
 *   root would re-publish `home`/`archive` as empty at a valid next revision.
 * - Structurally incomplete (e.g. a root that exists but is missing
 *   `home`/`archive`, with no transient failure involved): throw
 *   `S5DirectoryLoadError` with `retryable === false`. Retrying cannot fix this;
 *   it needs an explicit, opt-in repair (see `FS5.ensureIdentityInitialized`).
 */
export class S5DirectoryLoadError extends Error {
  /**
   * `true`  → transient/unavailable; retrying (with backoff) may succeed.
   * `false` → permanent/structural; retrying will not help, an explicit repair
   *           or human intervention is required.
   */
  readonly retryable: boolean;

  /**
   * Stable, bundle-independent discriminator. Prefer this over `instanceof`
   * in consumers, since `instanceof` is unreliable across duplicated module
   * instances / bundler boundaries.
   */
  readonly code = "S5_DIRECTORY_LOAD_ERROR";

  /**
   * Logical path of the directory that failed to load (e.g. `"home/fabstir/operators"`;
   * `""` for the filesystem root) — the DIRECTORY, not the path originally requested.
   *
   * This is what makes a path-scoped repair expressible: `fs.repairDirectory(err.path)`.
   * Best-effort: it is set wherever the failing call site knows the path (all directory
   * reads and writes on the identity's own tree). Sites that genuinely cannot know it —
   * HAMT-internal blobs, cross-identity public reads addressed only by public key —
   * leave it undefined rather than guess.
   */
  readonly path?: string;

  /**
   * Hex-encoded registry public key (33 bytes, multicodec-prefixed) of the failing
   * directory. Always set for directory-blob failures; useful for logs and for
   * correlating a failure with registry state. It is NOT sufficient to repair with —
   * writing needs the write key, which is derived from the path.
   */
  readonly publicKey?: string;

  constructor(
    message: string,
    opts: { retryable: boolean; cause?: unknown; path?: string; publicKey?: string }
  ) {
    super(message);
    this.name = "S5DirectoryLoadError";
    this.retryable = opts.retryable;
    if (opts.path !== undefined) this.path = opts.path;
    if (opts.publicKey !== undefined) this.publicKey = opts.publicKey;
    if (opts.cause !== undefined) {
      // Preserve a short description of the underlying cause WITHOUT holding a
      // reference to the original Error object: a nested Error in `cause` is a
      // structured-clone hazard across worker/IPC boundaries (it can crash the
      // host). A string is safe to serialise and enough for diagnostics.
      const c: any = opts.cause;
      (this as unknown as { cause?: unknown }).cause =
        c instanceof Error ? `${c.name}: ${c.message}` : String(c);
    }
    // Restore the prototype chain (TS downlevel / extends-Error caveat).
    Object.setPrototypeOf(this, S5DirectoryLoadError.prototype);
  }
}

/** Type guard for the directory-load error (bundle-safe). */
export function isS5DirectoryLoadError(e: unknown): e is S5DirectoryLoadError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "S5_DIRECTORY_LOAD_ERROR"
  );
}

/**
 * If `error` looks like a blob 404 / not-found, return a retryable
 * `S5DirectoryLoadError`; otherwise return it unchanged. Used to give HAMT
 * shard-root and internal-node blob downloads the SAME retryable contract as
 * `_fetchDirectoryMetadata`'s directory-blob 404 — so a transient 404 of a
 * *sharded* directory's blobs is never silently treated as empty by the
 * walker / batch / list consumers (which would drop large subtrees).
 */
export function as404DirLoadError(
  error: unknown,
  context = "directory blob",
  attribution?: { path?: string; publicKey?: string }
): unknown {
  if (isS5DirectoryLoadError(error)) return error; // already typed
  const msg = ((error as { message?: unknown })?.message?.toString() || "").toLowerCase();
  const status = (error as { status?: unknown })?.status;
  if (msg.includes("404") || msg.includes("not found") || status === 404) {
    return new S5DirectoryLoadError(
      `${context} is temporarily unavailable (404); likely a transient propagation ` +
        `failure — retry. Refusing to treat it as empty (that would drop data).`,
      { retryable: true, cause: error, ...attribution }
    );
  }
  return error;
}

/**
 * Outcome of `FS5.repairDirectory`.
 *
 * `repaired: false` always means **nothing was written**:
 * - `"loadable"`  — re-checked at repair time and the blob came back. This is the
 *   safety property of the reactive design: a 404 that was genuinely transient and
 *   has since resolved is a no-op, not a rebuild.
 * - `"absent"`    — no registry entry at this key; there is nothing to repair, and a
 *   normal write will create the directory through the usual guarded path.
 * - `"not-derivable"` — the parent links this name to a public key that does not match
 *   the one derived from the path (an externally-linked/mounted directory). Repair
 *   needs the derived write key, so it refuses rather than write to the wrong key.
 *
 * `repaired: true` republishes an EMPTY directory at `newRevision`. For a non-root
 * path this is LOSSY: the lost blob held the child names, so there is nothing to
 * enumerate. The subtree is not destroyed — child keys are derived from the parent
 * write key plus the name, so re-writing a known path re-links the surviving children.
 * For the root (`path: ""`) the repair is lossless: `home`/`archive` are conventional
 * and are re-linked in the same write (reported in `relinked`).
 */
export type RepairResult =
  | {
      repaired: false;
      reason: "loadable" | "absent" | "not-derivable";
      path: string;
      publicKey: string;
    }
  | {
      repaired: true;
      path: string;
      publicKey: string;
      previousRevision: number;
      newRevision: number;
      /** Names re-linked into the rebuilt directory (root repair only). */
      relinked?: string[];
    };
