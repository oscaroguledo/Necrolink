'use client';

import type { ClientLink, ClientResult } from '@/lib/client/api';
import { LinkCard } from './LinkCard';
import { STATUS, STATUS_ORDER, type ResultStatus } from './status';

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
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span aria-hidden="true" className={`text-2xl sm:text-3xl ${status === 'living' ? 'flicker inline-block' : ''}`}>
              {style.emoji}
            </span>
            <span className={`font-spooky text-3xl tracking-wide sm:text-4xl ${style.text}`}>{style.plural}</span>
            <span className="font-display text-lg text-mist-muted tabular-nums">({items.length})</span>
          </span>
        );
        const cards = (
          <ul className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                <summary className="cursor-pointer list-none rounded-xl py-1 [&::-webkit-details-marker]:hidden">
                  {heading}
                  <span className="mt-1 block text-sm text-mist-muted">
                    {style.blurb} <span className="underline underline-offset-4">Show them.</span>
                  </span>
                </summary>
                {cards}
              </details>
            ) : (
              <>
                <h2>{heading}</h2>
                <p className="mt-1 max-w-2xl text-pretty text-sm text-mist-muted">{style.blurb}</p>
                {cards}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
