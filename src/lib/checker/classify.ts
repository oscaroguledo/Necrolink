/**
 * Turn a fetch result into a verdict (spec 02, phase 2).
 *
 *   alive       → living
 *   dead        → ghost if the Wayback Machine has a copy, lost soul if not
 *   suspicious  → zombie candidate; spec 03 compares content to confirm
 *   unchecked   → could not be checked (blocked address, invalid URL, rate limited)
 */

import type { FetchResult, FetchErrorCode } from './safe-fetch';

export type Verdict = 'alive' | 'dead' | 'suspicious' | 'unchecked';

export interface Classification {
  verdict: Verdict;
  /** One plain-English sentence for the results screen. */
  reason: string;
}

const DEAD_ERRORS: Partial<Record<FetchErrorCode, string>> = {
  DNS_NOT_FOUND: 'The domain no longer exists',
  CONNECTION_REFUSED: 'The server refused the connection',
  CONNECTION_RESET: 'The server keeps dropping the connection',
  TIMEOUT: 'The server did not respond',
  TLS_ERROR: 'The site has a broken security certificate, so browsers will not open it',
  NETWORK_ERROR: 'The site could not be reached',
};

const UNCHECKED_ERRORS: Partial<Record<FetchErrorCode, string>> = {
  BLOCKED_ADDRESS: 'This link points to a private or internal address, so it was not checked',
  INVALID_URL: 'This is not a valid web address',
};

const LOGIN_PATH = /\/(log-?in|sign-?in|signon|auth|sso|account\/login|session\/new)(\/|$|\?)/i;

/** True for HTTP statuses that mean the page is gone (spec 02 isDeadStatus). */
export function isDeadStatus(status: number): boolean {
  if (status === 404 || status === 410) return true;
  if (status >= 500 && status <= 599) return true;
  // Other client errors (400, 405 after GET, 451, ...) except "can't see it" ones
  return status >= 400 && status < 500 && ![401, 403, 407, 429].includes(status);
}

/** Classify a link's fetch result. */
export function classify(result: FetchResult, requestedUrl: string): Classification {
  if (result.error === 'TOO_MANY_REDIRECTS') {
    return { verdict: 'suspicious', reason: 'The link redirects in a loop or too many times' };
  }
  if (result.error) {
    const unchecked = UNCHECKED_ERRORS[result.error];
    if (unchecked) return { verdict: 'unchecked', reason: unchecked };
    return { verdict: 'dead', reason: DEAD_ERRORS[result.error] ?? 'The site could not be reached' };
  }

  const status = result.status ?? 0;

  if (status === 429) {
    return { verdict: 'unchecked', reason: 'The site rate-limited the check; try again later' };
  }
  if (status === 401 || status === 407) {
    return { verdict: 'suspicious', reason: 'The page now requires a login' };
  }
  if (status === 403) {
    return { verdict: 'suspicious', reason: 'The site blocked access (403); it may be alive but restricted' };
  }
  if (isDeadStatus(status)) {
    const reason =
      status === 404
        ? 'Page not found (404)'
        : status === 410
          ? 'Page permanently removed (410)'
          : status >= 500
            ? `Server error (${status}); the site may be down`
            : `The site rejected the request (${status})`;
    return { verdict: 'dead', reason };
  }
  if (status < 200 || status >= 300) {
    return { verdict: 'unchecked', reason: `Unexpected response (${status})` };
  }

  const suspicion = redirectSuspicion(requestedUrl, result);
  if (suspicion) return { verdict: 'suspicious', reason: suspicion };

  return { verdict: 'alive', reason: 'The page loads' };
}

/** Why a successful response that went through redirects looks suspicious, if it does. */
export function redirectSuspicion(requestedUrl: string, result: FetchResult): string | undefined {
  if (result.redirects.length === 0) return undefined;

  let from: URL;
  let to: URL;
  try {
    from = new URL(requestedUrl);
    to = new URL(result.finalUrl);
  } catch {
    return undefined;
  }

  if (!sameSite(from.hostname, to.hostname)) {
    return `Redirects to a different site (${to.hostname})`;
  }
  if (LOGIN_PATH.test(to.pathname + to.search)) {
    return 'Redirects to a login page';
  }
  const deepLink = from.pathname.replace(/\/+$/, '') !== '';
  const landedOnHome = to.pathname.replace(/\/+$/, '') === '' && !to.search;
  if (deepLink && landedOnHome) {
    return "Redirects to the site's homepage; the original page is probably gone";
  }
  if (result.redirects.length > 2) {
    return `Long redirect chain (${result.redirects.length} redirects)`;
  }
  return undefined;
}

/** Same host, ignoring "www." and allowing one to be a subdomain of the other. */
export function sameSite(a: string, b: string): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  const x = strip(a);
  const y = strip(b);
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}
