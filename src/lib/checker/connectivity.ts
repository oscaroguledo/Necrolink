/**
 * Is this server online? Asked before declaring a link dead because of a
 * network-level failure: when the server's own DNS or network is down, every
 * link fails the same way, and "the domain no longer exists" would be a lie.
 * (Found when a local DNS outage turned example.com into a "ghost".)
 */

import dns from 'node:dns';

const CANARY_HOSTS = ['www.google.com', 'web.archive.org', 'en.wikipedia.org'];
const CACHE_MS = 30_000;
const TIMEOUT_MS = 3000;

let cached: { online: boolean; at: number } | undefined;
let inFlight: Promise<boolean> | undefined;

function resolves(host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    dns.lookup(host, (err) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    });
  });
}

/** True as soon as one host resolves; false once all have failed. */
function anyResolves(hosts: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let failures = 0;
    for (const host of hosts) {
      resolves(host).then(
        () => resolve(true),
        () => {
          if (++failures === hosts.length) resolve(false);
        }
      );
    }
  });
}

/** True if any well-known host resolves. Cached for 30 s; concurrent callers share one check. */
export async function isOnline(now: number = Date.now()): Promise<boolean> {
  if (cached && now - cached.at < CACHE_MS) return cached.online;
  if (!inFlight) {
    inFlight = anyResolves(CANARY_HOSTS).then((online) => {
      cached = { online, at: Date.now() };
      inFlight = undefined;
      return online;
    });
  }
  return inFlight;
}
