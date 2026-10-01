/**
 * Typed registry errors.
 *
 * The S5 wire protocol has no negative registry reply: a peer that lacks an entry simply
 * stays silent. So an empty registry read normally means "absent" — EXCEPT when no peer could
 * be asked at all. That case is not an answer, and treating it as "absent" is how an offline
 * tab concludes "new identity" / "empty directory" and overwrites real data.
 */
export class S5RegistryUnavailableError extends Error {
  /** Always retryable: the network may answer once a peer is connected. */
  readonly retryable = true;

  /** Stable, bundle-independent discriminator (prefer over `instanceof`). */
  readonly code = "S5_REGISTRY_UNAVAILABLE";

  /** Hex registry public key (33 bytes, multicodec-prefixed) that could not be looked up. */
  readonly publicKey?: string;

  constructor(message?: string, opts: { publicKey?: string } = {}) {
    // Deliberately avoids "does not exist" / "not found" / "same name": consumers (and the
    // FS5 parent walk) read those phrases as certain absence or as a create race.
    super(
      message ??
        "S5 registry unavailable: no local entry for this key and no connected peer could be " +
          "asked for it. This says nothing about whether the entry exists — retry once connected."
    );
    this.name = "S5RegistryUnavailableError";
    if (opts.publicKey !== undefined) this.publicKey = opts.publicKey;
    Object.setPrototypeOf(this, S5RegistryUnavailableError.prototype);
  }
}

/** Type guard for the registry-unavailable error (bundle-safe). */
export function isS5RegistryUnavailableError(e: unknown): e is S5RegistryUnavailableError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "S5_REGISTRY_UNAVAILABLE"
  );
}
