'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ClientLink, ClientResult } from '@/lib/client/api';
import { STATUS, StatusEmoji, type ResultStatus } from './status';

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

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  // URLs come from documents and redirects: never render javascript:, data:, ...
  if (!/^https?:\/\//i.test(href)) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-1 underline-offset-2 hover:text-white">
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
  const fixable = status === 'ghost' || status === 'zombie' || status === 'lost';
  const zombie = result.zombie;
  const checkboxId = `fix-${link.id}`;

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`tombstone border bg-night-800/80 px-5 pb-4 pt-6 ${style.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wider ${style.text}`}>
            <StatusEmoji status={status} /> {style.label}
            {where(link) && <span className="ml-2 font-normal normal-case tracking-normal text-mist-faint">· {where(link)}</span>}
          </p>
          <h3 className="mt-1 break-words font-display text-lg text-mist">{link.text || link.originalUrl}</h3>
        </div>
        {fixable && (
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <input id={checkboxId} type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-emerald-300" />
            <label htmlFor={checkboxId} className="text-xs text-mist-muted">
              {status === 'ghost' ? 'Resurrect' : 'Flag'}
              <span className="sr-only"> {link.text || link.originalUrl} in the download</span>
            </label>
          </div>
        )}
      </div>

      <p className="mt-2 break-all font-mono text-xs text-mist-muted">
        {status === 'ghost' || status === 'lost' ? <s className="decoration-status-ghost/70">{link.originalUrl}</s> : link.originalUrl}
      </p>

      <p className="mt-3 text-sm text-mist">{result.reason}</p>

      {status === 'ghost' && result.archived && (
        <p className="mt-2 text-sm text-status-living">
          <span aria-hidden="true">⏮️ </span>
          <ExternalLink href={result.archived.url}>Archived copy from {date(result.archived.timestamp)}</ExternalLink>
        </p>
      )}

      {status === 'zombie' && (
        <div className="mt-3 space-y-1 rounded-lg bg-night-900/70 p-3 text-sm">
          {zombie?.archivedTitle && (
            <p>
              <span className="text-mist-faint">Then: </span>
              <span className="text-mist">{zombie.archivedTitle}</span>
            </p>
          )}
          {zombie?.currentTitle && (
            <p>
              <span className="text-mist-faint">Now: </span>
              <span className="text-status-zombie">{zombie.currentTitle}</span>
            </p>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-mist-muted">
            {zombie && (
              <span>
                {Math.round(zombie.confidence * 100)}% confident · {METHOD[zombie.method] ?? zombie.method}
              </span>
            )}
            {result.archived && <ExternalLink href={result.archived.url}>Cited version ({date(result.archived.timestamp)})</ExternalLink>}
            <ExternalLink href={result.finalUrl ?? link.originalUrl}>Current page</ExternalLink>
          </p>
        </div>
      )}

      {status === 'living' && result.finalUrl && (
        <p className="mt-1 break-all text-xs text-mist-faint">Now at {result.finalUrl}</p>
      )}
    </motion.li>
  );
}
