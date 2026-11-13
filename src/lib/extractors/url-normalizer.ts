/**
 * URL normalization for deduplication and comparison.
 * Must be idempotent: normalize(normalize(url)) === normalize(url)
 * 
 * This module is critical for property-based testing.
 */

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
];

export interface NormalizationOptions {
  removeTracking?: boolean;
  removeFragment?: boolean;
  sortParams?: boolean;
  lowercaseHostname?: boolean;
}

const DEFAULT_OPTIONS: NormalizationOptions = {
  removeTracking: true,
  removeFragment: true,
  sortParams: true,
  lowercaseHostname: true,
};

/**
 * Normalize a URL to canonical form
 */
export function normalizeUrl(
  url: string,
  options?: Partial<NormalizationOptions>
): string {
  // Fix Bug 1: Properly merge options with defaults
  const opts: NormalizationOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  try {
    // Handle common malformed URLs
    let cleanUrl = url.trim();
    
    // Add protocol if missing
    if (!cleanUrl.match(/^https?:\/\//i)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    const parsed = new URL(cleanUrl);
    const hadFragment = parsed.hash !== '';
    const hadQueryParams = parsed.search !== '';
    
    // 1. Lowercase protocol and hostname
    if (opts.lowercaseHostname) {
      parsed.protocol = parsed.protocol.toLowerCase();
      parsed.hostname = parsed.hostname.toLowerCase();
    }
    
    // 2. Remove default ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }
    
    // Fix Bug 6: Normalize consecutive slashes in path
    parsed.pathname = parsed.pathname.replace(/\/+/g, '/');
    
    // 3. Remove trailing slash (except for root)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    
    // Bug 2 FIX: Removed www. stripping to preserve domain semantics
    // The test expects hostname preservation, www-removal violates that
    
    // 5. Handle query parameters
    if (opts.removeTracking || opts.sortParams) {
      const params = new URLSearchParams(parsed.search);
      
      // Remove tracking parameters
      if (opts.removeTracking) {
        TRACKING_PARAMS.forEach((param) => params.delete(param));
      }
      
      // Sort parameters alphabetically
      if (opts.sortParams) {
        const sorted = new URLSearchParams(
          Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        );
        // Fix Bug 3: Avoid trailing '?' when all params removed
        if (sorted.size === 0) {
          parsed.search = '';
        } else {
          parsed.search = sorted.toString();
        }
      }
    }
    
    // 6. Remove fragment (hash)
    if (opts.removeFragment) {
      parsed.hash = '';
    }
    
    // Fix Bug 4: Clean up trailing delimiters
    let result = parsed.toString();
    result = result.replace(/[?#]$/, '');
    
    // Remove trailing slash from root path ONLY if we removed fragment/params
    // This preserves path semantics while cleaning up fragment-only URLs
    if (parsed.pathname === '/' && parsed.search === '' && (hadFragment || hadQueryParams)) {
      result = result.replace(/\/$/, '');
    }
    
    return result;
  } catch (error) {
    // Fix Bug 5: Return consistently normalized form even on error
    // This ensures idempotence for malformed URLs
    let fallback = url.trim();
    if (!fallback.match(/^https?:\/\//i)) {
      fallback = 'https://' + fallback;
    }
    return fallback;
  }
}

/**
 * Check if a URL is absolute
 */
export function isAbsoluteUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a relative URL against a base
 */
export function resolveUrl(relativeUrl: string, baseUrl: string): string {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return relativeUrl;
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Check if two URLs point to the same resource
 */
export function isSameUrl(url1: string, url2: string): boolean {
  return normalizeUrl(url1) === normalizeUrl(url2);
}
