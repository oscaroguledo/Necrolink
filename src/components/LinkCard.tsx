'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ClientLink, ClientResult } from '@/lib/client/api';
import { STATUS, StatusEmoji, type ResultStatus } from './status';
import { Tilt } from './effects/Tilt';

/** A crack across a lost soul's headstone. */
function Crack() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 80 60"
      className="pointer-events-none absolute right-6 top-3 h-14 w-20 text-black/50"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M78 2 L60 14 L64 22 L48 30 L52 38 L36 46 L40 52 L28 58" />
      <path d="M60 14 L70 22" />
      <path d="M48 30 L42 24" />
    </svg>
  );
}

interface Props {
  link: ClientLink;
  result: ClientResult;
  selected: boolean;
  onToggle: () => void;
}

const date = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const METHOD: Record<string, string> = {
  heuristic: 'compared page text',
  ai: 'compared by AI',
  unverified: 'not verified: could not compare',
};

function where(link: ClientLink): string | undefined {
  if (link.position.page) return `page ${link.position.page}`;
  if (link.position.line) return `line ${link.position.line}`;
  return undefined;
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  // URLs come from documents and redirects: never render javascript:, data:, ...
  if (!/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-block py-1 underline decoration-1 underline-offset-2 hover:text-white"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

export function LinkCard({ link, result, selected, onToggle }: Props) {
  const status = result.status as ResultStatus;
  const style = STATUS[status];
  const reduceMotion = useReducedMotion();
  const fixable =
    status === 'ghost' || status === 'zombie' || status === 'lost';
  const zombie = result.zombie;
  const checkboxId = `fix-${link.id}`;

  return (
    // Rises out of the ground, hinged at its base like a headstone being raised
    <motion.li
      layout={!reduceMotion}
      initial={
        reduceMotion ? false : { opacity: 0, y: 70, rotateX: -80, scale: 0.92 }
      }
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 90, damping: 13, mass: 0.9 }}
      style={{ transformPerspective: 900, originY: 1 }}
      data-card
      className="list-none"
    >
      <Tilt
        max={6}
        className={`tombstone stone mossy flex h-full flex-col border px-4 pb-6 pt-6 transition-shadow duration-300 sm:px-6 sm:pt-7 ${style.border} ${style.glow} ${
          status === 'ghost'
            ? 'resurrect-burst'
            : status === 'zombie'
              ? 'twitch'
              : ''
        }`}
      >
        {status === 'lost' && <Crack />}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <p
            className={`pt-1 text-xs font-semibold uppercase tracking-[0.18em] ${style.text}`}
          >
            <StatusEmoji status={status} /> {style.label}
            {where(link) && (
              <span className="ml-2 font-normal normal-case tracking-normal text-mist-faint">
                · {where(link)}
              </span>
            )}
          </p>
          {fixable && (
            <label
              htmlFor={checkboxId}
              className={`-my-1 inline-flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                selected
                  ? `${style.border} ${style.bg} ${style.text}`
                  : 'border-night-600 text-mist-muted hover:text-mist'
              }`}
            >
              <input
                id={checkboxId}
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                className="size-4 accent-emerald-300"
              />
              {status === 'ghost' ? 'Resurrect' : 'Flag'}
              <span className="sr-only">
                {' '}
                {link.text || link.originalUrl} in the download
              </span>
            </label>
          )}
        </div>
        <h3 className="engraved mt-2 wrap-break-word font-display text-xl leading-snug text-mist">
          {link.text || link.originalUrl}
        </h3>
        <p
          aria-hidden="true"
          className="mt-0.5 font-display text-sm italic text-mist-faint"
        >
          {style.epitaph}
        </p>

        <p className="mt-3 break-all font-mono text-xs text-mist-muted">
          {status === 'ghost' || status === 'lost' ? (
            <s className="decoration-status-ghost/70">{link.originalUrl}</s>
          ) : (
            link.originalUrl
          )}
        </p>

        <p className="mt-3 text-sm text-mist">{result.reason}</p>

        {status === 'ghost' && result.archived && (
          <p className="mt-2 text-sm text-status-living">
            <span aria-hidden="true">⏮️ </span>
            <ExternalLink href={result.archived.url}>
              Archived copy from {date(result.archived.timestamp)}
            </ExternalLink>
          </p>
        )}

        {status === 'zombie' && (
          <div className="mt-3 space-y-1 rounded-lg border border-status-zombie/15 bg-night-900/70 p-3 text-sm">
            {zombie?.archivedTitle && (
              <p>
                <span className="text-mist-faint">Then: </span>
                <span className="text-mist">{zombie.archivedTitle}</span>
              </p>
            )}
            {zombie?.currentTitle && (
              <p>
                <span className="text-mist-faint">Now: </span>
                <span className="text-status-zombie">
                  {zombie.currentTitle}
                </span>
              </p>
            )}
            <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-mist-muted">
              {zombie && (
                <span>
                  {Math.round(zombie.confidence * 100)}% confident ·{' '}
                  {METHOD[zombie.method] ?? zombie.method}
                </span>
              )}
              {result.archived && (
                <ExternalLink href={result.archived.url}>
                  Cited version ({date(result.archived.timestamp)})
                </ExternalLink>
              )}
              <ExternalLink href={result.finalUrl ?? link.originalUrl}>
                Current page
              </ExternalLink>
            </p>
          </div>
        )}

        {status === 'living' && result.finalUrl && (
          <p className="mt-1 break-all text-xs text-mist-faint">
            Now at {result.finalUrl}
          </p>
        )}
      </Tilt>
    </motion.li>
  );
}
