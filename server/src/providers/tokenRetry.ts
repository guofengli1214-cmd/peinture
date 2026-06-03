/**
 * Server-side token rotation for the generation proxy.
 *
 * Unlike the browser version (which tracked daily exhaustion in a store), this
 * takes the user's token list explicitly and rotates through it on quota errors
 * within a single request. Exhaustion is not persisted — the next request starts
 * fresh, which is fine for a proxy (upstream quotas reset on their own schedule).
 */

const QUOTA_MARKERS = [
  "429",
  "exceeded your free GPU quota",
  "insufficient_quota",
  "quota",
  "credit",
  "Arrearage",
  "Resource exhausted",
];

export function isQuotaError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e?.status === 429) return true;
  const msg = e?.message ?? "";
  return QUOTA_MARKERS.some((m) => msg.includes(m));
}

export interface TokenRetryOptions {
  /** When true (HuggingFace), run once with a null token if none are configured. */
  optional?: boolean;
  /** Error thrown when a required provider has no tokens configured. */
  requiredError?: string;
  /** Error thrown when every configured token is exhausted. */
  exhaustedError?: string;
}

/**
 * Run `operation` with each token until one succeeds or all are exhausted.
 * Non-quota errors abort immediately (they won't be fixed by another token).
 */
export async function runWithTokenRetry<T>(
  tokens: string[],
  options: TokenRetryOptions,
  operation: (token: string | null) => Promise<T>,
): Promise<T> {
  const {
    optional = false,
    requiredError = "error_token_required",
    exhaustedError = "error_quota_exhausted",
  } = options;

  if (tokens.length === 0) {
    if (optional) return operation(null);
    throw new Error(requiredError);
  }

  let lastError: unknown;
  for (const token of tokens) {
    try {
      return await operation(token);
    } catch (err) {
      lastError = err;
      if ((err as Error)?.name === "AbortError") throw err;
      if (isQuotaError(err)) continue; // try the next token
      throw err; // non-quota error — stop
    }
  }

  // Every token hit a quota error.
  throw lastError instanceof Error ? new Error(exhaustedError) : new Error(exhaustedError);
}
