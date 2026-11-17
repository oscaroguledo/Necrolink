'use client';

import type { ClientLink, ClientResult } from '@/lib/client/api';
import { LinkCard } from './LinkCard';
import { STATUS, STATUS_ORDER, StatusEmoji, type ResultStatus } from './status';

interface Props {
  links: ClientLink[];
  results: Map<string, ClientResult>;
  selected: ReadonlySet<string>;
  onToggle: (linkId: string) => void;
}

export function Graveyard({ links, results, selected, onToggle }: Props) {
  const groups = new Map<ResultStatus, Array<{ link: ClientLink; result: ClientResult }>>();
  for (const link of links) {
    const result = results.get(link.id);
    if (!result) continue;
    const status = result.status as ResultStatus;
    groups.set(status, [...(groups.get(status) ?? []), { link, result }]);
  }

  return (
    <div className="space-y-10">
      {STATUS_ORDER.map((status) => {
        const items = groups.get(status) ?? [];
        if (items.length === 0) return null;
        const style = STATUS[status];
        const heading = (
          <span className="flex items-baseline gap-2">
            <StatusEmoji status={status} />
            <span className={`font-display text-2xl ${style.text}`}>{style.plural}</span>
            <span className="text-base text-mist-muted tabular-nums">({items.length})</span>
          </span>
        );
        const cards = (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {items.map(({ link, result }) => (
              <LinkCard
                key={link.id}
                link={link}
                result={result}
                selected={selected.has(link.id)}
                onToggle={() => onToggle(link.id)}
              />
            ))}
          </ul>
        );

        return (
          <section key={status} id={`section-${status}`} aria-label={style.plural} className="scroll-mt-6">
            {status === 'living' ? (
              // Healthy links matter least; keep them out of the way
              <details>
                <summary className="cursor-pointer list-none">
                  {heading}
                  <span className="mt-1 block text-sm text-mist-muted">{style.blurb} Show them.</span>
                </summary>
                {cards}
              </details>
            ) : (
              <>
                <h2>{heading}</h2>
                <p className="mt-1 text-sm text-mist-muted">{style.blurb}</p>
                {cards}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
