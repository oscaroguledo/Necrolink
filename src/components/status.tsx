/**
 * How each status looks and reads. Emoji are decorative (aria-hidden);
 * the text label always carries the meaning.
 */

import type { LinkStatus } from '@/types/link';

export type ResultStatus = Exclude<LinkStatus, 'checking'>;

export const STATUS_ORDER: ResultStatus[] = ['ghost', 'zombie', 'lost', 'error', 'living'];

export const STATUS: Record<
  ResultStatus,
  { emoji: string; label: string; plural: string; blurb: string; text: string; border: string; bg: string }
> = {
  ghost: {
    emoji: '👻',
    label: 'Ghost',
    plural: 'Ghosts',
    blurb: 'Dead, but the Internet Archive kept a copy. Necrolink can resurrect them.',
    text: 'text-status-ghost',
    border: 'border-status-ghost/40',
    bg: 'bg-status-ghost/10',
  },
  zombie: {
    emoji: '🧟',
    label: 'Zombie',
    plural: 'Zombies',
    blurb: 'Still load, but no longer show what you cited.',
    text: 'text-status-zombie',
    border: 'border-status-zombie/40',
    bg: 'bg-status-zombie/10',
  },
  lost: {
    emoji: '🪦',
    label: 'Lost soul',
    plural: 'Lost souls',
    blurb: 'Dead, and no archived copy exists. Find another source.',
    text: 'text-status-lost',
    border: 'border-status-lost/40',
    bg: 'bg-status-lost/10',
  },
  error: {
    emoji: '⚠️',
    label: 'Not checked',
    plural: 'Not checked',
    blurb: 'Could not be checked this time. Try again later.',
    text: 'text-status-error',
    border: 'border-status-error/40',
    bg: 'bg-status-error/10',
  },
  living: {
    emoji: '🕯️',
    label: 'Living',
    plural: 'Living',
    blurb: 'The page still loads. Nothing to fix.',
    text: 'text-status-living',
    border: 'border-status-living/40',
    bg: 'bg-status-living/10',
  },
};

export function StatusEmoji({ status }: { status: ResultStatus }) {
  return <span aria-hidden="true">{STATUS[status].emoji}</span>;
}
