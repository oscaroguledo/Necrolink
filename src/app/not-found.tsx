import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-4 pb-[clamp(7rem,24vh,15rem)] pt-12 text-center">
      <div className="tombstone stone mossy w-full max-w-sm border border-night-600 px-6 pb-10 pt-12">
        <p aria-hidden="true" className="engraved font-display text-sm tracking-[0.5em] text-mist-faint">
          R · I · P
        </p>
        <h1 className="spooky-title mt-4 font-spooky text-7xl leading-none sm:text-8xl">404</h1>
        <p className="engraved mt-4 font-display text-2xl text-mist">This page has passed on</p>
        <p className="mt-2 font-display italic text-mist-muted">Gone, and not even the Internet Archive kept a copy.</p>
      </div>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-11 items-center rounded-full border border-status-living/60 px-6 py-2.5 font-semibold text-status-living transition hover:bg-status-living/10"
      >
        <span aria-hidden="true" className="flicker mr-2 inline-block">
          🕯️
        </span>
        Back to the living
      </Link>
    </main>
  );
}
