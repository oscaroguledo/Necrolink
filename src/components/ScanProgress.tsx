'use client';

import { STATUS, STATUS_ORDER, StatusEmoji, type ResultStatus } from './status';

interface Props {
  filename: string;
  total: number;
  counts: Record<ResultStatus, number>;
  checking: boolean;
  onCancel: () => void;
}

export function ScanProgress({ filename, total, counts, checking, onCancel }: Props) {
  const done = STATUS_ORDER.reduce((sum, s) => sum + counts[s], 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section aria-labelledby="progress-heading" className="rounded-2xl border border-night-600 bg-night-800/70 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="progress-heading" className="font-display text-xl text-mist">
          {checking ? 'Summoning the dead…' : 'The graveyard is ready'}
        </h2>
        <p className="truncate text-sm text-mist-muted" title={filename}>
          <span aria-hidden="true">📄 </span>
          {filename}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Links checked"
        className="mt-4 h-2 overflow-hidden rounded-full bg-night-700"
      >
        <div className="h-full rounded-full bg-status-living transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm text-mist-muted" aria-live="polite">
        {done} of {total} links checked
      </p>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Results so far">
        {STATUS_ORDER.filter((s) => s !== 'error' || counts.error > 0).map((s) => (
          <li key={s}>
            <a
              href={`#section-${s}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${STATUS[s].border} ${STATUS[s].bg} ${STATUS[s].text}`}
            >
              <StatusEmoji status={s} />
              <span className="font-semibold tabular-nums">{counts[s]}</span>
              <span>{counts[s] === 1 ? STATUS[s].label : STATUS[s].plural}</span>
            </a>
          </li>
        ))}
      </ul>

      {checking && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 rounded-full border border-night-600 px-4 py-1.5 text-sm text-mist-muted hover:border-mist-muted hover:text-mist"
        >
          Cancel
        </button>
      )}
    </section>
  );
}
