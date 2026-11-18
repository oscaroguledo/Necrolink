'use client';

import { useEffect, useState } from 'react';
import { STATUS, STATUS_ORDER, StatusEmoji, type ResultStatus } from './status';

interface Props {
  filename: string;
  total: number;
  counts: Record<ResultStatus, number>;
  checking: boolean;
  onCancel: () => void;
}

// Flavour text while checking. Decorative: screen readers get the count instead.
const INCANTATIONS = [
  'Knocking on every tombstone…',
  'Consulting the spirits of the Wayback Machine…',
  'Comparing what was with what is…',
  'Counting the restless…',
  'Listening for heartbeats…',
];

export function ScanProgress({ filename, total, counts, checking, onCancel }: Props) {
  const done = STATUS_ORDER.reduce((sum, s) => sum + counts[s], 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (!checking) return;
    const timer = setInterval(() => setLine((l) => (l + 1) % INCANTATIONS.length), 2800);
    return () => clearInterval(timer);
  }, [checking]);

  return (
    <section aria-labelledby="progress-heading" className="stone rounded-2xl border border-night-600 p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 id="progress-heading" className="font-spooky text-2xl tracking-wide text-mist sm:text-3xl">
          {checking ? 'Summoning the dead…' : 'The graveyard is ready'}
        </h2>
        <p className="min-w-0 truncate text-sm text-mist-muted" title={filename}>
          <span aria-hidden="true">📜 </span>
          {filename}
        </p>
      </div>

      <div className="relative mt-5 pt-3">
        {/* A ghost rides the leading edge of the bar */}
        <span
          aria-hidden="true"
          className="absolute -top-3 text-xl transition-[left] duration-500 sm:text-2xl"
          style={{ left: `clamp(0px, calc(${percent}% - 0.9rem), calc(100% - 1.6rem))` }}
        >
          <span className={`inline-block ${checking ? 'ghost-bob' : ''}`}>{checking ? '👻' : '🪦'}</span>
        </span>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Links checked"
          className="h-3 overflow-hidden rounded-full bg-night-900 ring-1 ring-night-600"
        >
          <div
            className={`ectoplasm h-full rounded-full transition-[width] duration-500 ${checking ? 'ectoplasm-flow' : ''}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm text-mist-muted">
        <span aria-live="polite">
          {done} of {total} links checked
        </span>
        {checking && (
          <span aria-hidden="true" className="font-display italic text-mist-faint">
            {INCANTATIONS[line]}
          </span>
        )}
      </p>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Results so far">
        {STATUS_ORDER.filter((s) => s !== 'error' || counts.error > 0).map((s) => (
          <li key={s}>
            <a
              href={`#section-${s}`}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition hover:brightness-125 ${STATUS[s].border} ${STATUS[s].bg} ${STATUS[s].text}`}
            >
              <StatusEmoji status={s} />
              <span key={counts[s]} className="count-pop inline-block font-semibold tabular-nums">
                {counts[s]}
              </span>
              <span>{counts[s] === 1 ? STATUS[s].label : STATUS[s].plural}</span>
            </a>
          </li>
        ))}
      </ul>

      {checking && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 min-h-11 w-full rounded-full border border-night-600 px-5 py-2 text-sm text-mist-muted hover:border-mist-muted hover:text-mist sm:w-auto"
        >
          Stop checking
        </button>
      )}
    </section>
  );
}
