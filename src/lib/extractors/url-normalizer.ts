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
  options: NormalizationOptions = DEFAULT_OPTIONS
): string {
  try {
    // Handle common malformed URLs
    let cleanUrl = url.trim();
    
    // Add protocol if missing
    if (!cleanUrl.match(/^https?:\/\//i)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    
    const parsed = new URL(cleanUrl);
    
    // 1. Lowercase protocol and hostname
    if (options.lowercaseHostname) {
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
    
    // 3. Remove trailing slash (except for root)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    
    // 4. Remove www. prefix (controversial, but common)
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.substring(4);
    }
    
    // 5. Handle query parameters
    if (options.removeTracking || options.sortParams) {
      const params = new URLSearchParams(parsed.search);
      
      // Remove tracking parameters
      if (options.removeTracking) {
        TRACKING_PARAMS.forEach((param) => params.delete(param));
      }
      
      // Sort parameters alphabetically
      if (options.sortParams) {
        const sorted = new URLSearchParams(
          Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        );
        parsed.search = sorted.toString();
      }
    }
    
    // 6. Remove fragment (hash)
    if (options.removeFragment) {
      parsed.hash = '';
    }
    
    return parsed.toString();
  } catch (error) {
    // If parsing fails, return original URL
    // This prevents normalization from breaking on edge cases
    return url;
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
