/**
 * Single-flight guard for the refresh-token endpoint.
 *
 * The backend rotates refresh tokens single-use: two requests presenting the
 * SAME raw refresh token concurrently means only one can win the conditional
 * revoke (`WHERE revoked_at IS NULL`); the loser is treated as token reuse and
 * the entire token family is revoked as a theft signal. A batch of parallel
 * uploads hitting a just-expired access token would otherwise fire several
 * refresh requests at once and log the merchant out mid-upload.
 *
 * Every refresh call site (the fetch-based `baseQueryWithReauth` and the
 * axios-based upload client) must route through this module so at most one
 * refresh request is ever in flight process-wide.
 */
let inFlight: Promise<boolean> | null = null;

export function withSingleFlightRefresh(
  attempt: () => Promise<boolean>,
): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = attempt().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
