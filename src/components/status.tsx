/**
 * How each status looks and reads. Emoji are decorative (aria-hidden);
 * the text label always carries the meaning.
 */

import type { LinkStatus } from '@/types/link';

export type ResultStatus = Exclude<LinkStatus, 'checking'>;

export const STATUS_ORDER: ResultStatus[] = ['ghost', 'zombie', 'lost', 'error', 'living'];

export const STATUS: Record<
  ResultStatus,
  {
    emoji: string;
    label: string;
    plural: string;
    blurb: string;
    /** Decorative line engraved on the card. */
    epitaph: string;
    text: string;
    border: string;
    bg: string;
    /** Eerie glow around the card, in the status colour. */
    glow: string;
  }
> = {
  ghost: {
    emoji: '👻',
    label: 'Ghost',
    plural: 'Ghosts',
    blurb: 'Dead, but the Internet Archive kept a copy. Necrolink can resurrect them.',
    epitaph: 'Departed, but not forgotten.',
    text: 'text-status-ghost',
    border: 'border-status-ghost/40',
    bg: 'bg-status-ghost/10',
    glow: 'hover:shadow-[0_0_32px_-6px_rgba(252,165,165,0.45)]',
  },
  zombie: {
    emoji: '🧟',
    label: 'Zombie',
    plural: 'Zombies',
    blurb: 'Still load, but no longer show what you cited.',
    epitaph: 'It walks again, but something is wrong.',
    text: 'text-status-zombie',
    border: 'border-status-zombie/40',
    bg: 'bg-status-zombie/10',
    glow: 'hover:shadow-[0_0_32px_-6px_rgba(252,211,77,0.45)]',
  },
  lost: {
    emoji: '🪦',
    label: 'Lost soul',
    plural: 'Lost souls',
    blurb: 'Dead, and no archived copy exists. Find another source.',
    epitaph: 'Here it lies. No copy survives.',
    text: 'text-status-lost',
    border: 'border-status-lost/40',
    bg: 'bg-status-lost/10',
    glow: 'hover:shadow-[0_0_32px_-6px_rgba(203,213,225,0.35)]',
  },
  error: {
    emoji: '⚠️',
    label: 'Not checked',
    plural: 'Not checked',
    blurb: 'Could not be checked this time. Try again later.',
    epitaph: 'The spirits would not answer.',
    text: 'text-status-error',
    border: 'border-status-error/40',
    bg: 'bg-status-error/10',
    glow: 'hover:shadow-[0_0_32px_-6px_rgba(253,186,116,0.4)]',
  },
  living: {
    emoji: '🕯️',
    label: 'Living',
    plural: 'Living',
    blurb: 'The page still loads. Nothing to fix.',
    epitaph: 'Still breathing.',
    text: 'text-status-living',
    border: 'border-status-living/40',
    bg: 'bg-status-living/10',
    glow: 'hover:shadow-[0_0_32px_-6px_rgba(110,231,183,0.4)]',
  },
};

export function StatusEmoji({ status }: { status: ResultStatus }) {
  return <span aria-hidden="true">{STATUS[status].emoji}</span>;
}
