/**
 * The graveyard behind every screen: moon, drifting fog, bats, will-o'-the-
 * wisps and a skyline of tombstones, a dead tree and an iron fence.
 *
 * Purely decorative (aria-hidden, no pointer events). Every animation is
 * motion-safe only, so people who ask for reduced motion get a still scene.
 * Positions are fixed numbers, not random, so server and client render alike.
 */

const WISPS = [
  { left: '8%', bottom: '14%', delay: '0s', duration: '9s' },
  { left: '22%', bottom: '9%', delay: '3s', duration: '11s' },
  { left: '41%', bottom: '16%', delay: '6s', duration: '10s' },
  { left: '63%', bottom: '11%', delay: '1.5s', duration: '12s' },
  { left: '78%', bottom: '18%', delay: '4.5s', duration: '9.5s' },
  { left: '91%', bottom: '8%', delay: '7s', duration: '10.5s' },
];

const BATS = [
  { top: '12%', delay: '2s', duration: '19s', scale: 1 },
  { top: '20%', delay: '9s', duration: '23s', scale: 0.7 },
  { top: '8%', delay: '15s', duration: '27s', scale: 0.55 },
];

function Bat() {
  return (
    <svg viewBox="0 0 64 28" className="bat-wings h-full w-full" fill="currentColor">
      <path d="M32 9c-1.6-3.2-4.6-4.6-7.6-4 1.4 1.8 1.4 4 .1 5.6C21.8 8 16.6 7.2 12 8.6c3 1.6 4.8 4.6 5 8 2.8-2.2 6.8-2.8 10-1.4 1.6-1.6 3.2-2.4 5-2.4s3.4.8 5 2.4c3.2-1.4 7.2-.8 10 1.4.2-3.4 2-6.4 5-8-4.6-1.4-9.8-.6-12.5 2-1.3-1.6-1.3-3.8.1-5.6-3-.6-6 .8-7.6 4z" />
    </svg>
  );
}

export function Atmosphere() {
  return (
    <div aria-hidden="true" data-decor className="css-atmosphere pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Moon */}
      <div className="moon absolute right-[3%] top-[0.5%] size-10 rounded-full opacity-70 sm:right-[3%] sm:top-[2%] sm:size-16 sm:opacity-80 lg:right-[6%] lg:top-[5%] lg:size-28 xl:size-32" />

      {/* Fog banks drifting across the ground */}
      <div className="fog fog-a absolute -left-1/4 bottom-[6%] h-[30vh] w-[150%]" />
      <div className="fog fog-b absolute -left-1/4 bottom-0 h-[22vh] w-[150%]" />

      {/* Bats */}
      {BATS.map((bat, i) => (
        <div
          key={i}
          className="bat absolute -left-16 h-5 w-11 text-black/80 sm:h-7 sm:w-16"
          style={{ top: bat.top, animationDelay: bat.delay, animationDuration: bat.duration, scale: String(bat.scale) }}
        >
          <Bat />
        </div>
      ))}

      {/* Will-o'-the-wisps */}
      {WISPS.map((wisp, i) => (
        <span
          key={i}
          className="wisp absolute size-1.5 rounded-full sm:size-2"
          style={{ left: wisp.left, bottom: wisp.bottom, animationDelay: wisp.delay, animationDuration: wisp.duration }}
        />
      ))}

      {/* Graveyard skyline */}
      <svg
        viewBox="0 0 1440 220"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-[clamp(5rem,20vh,13rem)] w-full"
      >
        <defs>
          <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a0f0d" />
            <stop offset="1" stopColor="#040605" />
          </linearGradient>
        </defs>
        <g fill="#080b0a">
          {/* Dead tree */}
          <path d="M1180 220V120c-6-18-22-30-40-36 14 0 28 6 38 16-2-22-16-40-34-52 20 8 34 24 40 44 4-20 2-40-8-58 14 14 20 34 18 56 10-16 26-26 44-30-16 10-28 26-32 44 14-8 30-10 46-6-18 2-34 12-44 26-4 10-6 22-6 34v62z" />
          {/* Iron fence */}
          <g>
            <rect x="0" y="150" width="420" height="4" />
            <rect x="0" y="176" width="420" height="3" />
            {Array.from({ length: 22 }, (_, i) => (
              <path key={i} d={`M${8 + i * 19} 220V146l3-8 3 8v74z`} />
            ))}
          </g>
          {/* Tombstones and a cross */}
          <path d="M520 220v-62c0-16 12-28 28-28s28 12 28 28v62z" />
          <path d="M612 220v-40c0-12 9-20 20-20s20 8 20 20v40z" />
          <path d="M700 220v-78h-16v-14h16v-16h14v16h16v14h-16v78z" />
          <path d="M790 220v-54c0-20 16-34 34-34s34 14 34 34v54z" />
          <rect x="900" y="172" width="40" height="48" rx="4" />
          <path d="M980 220v-46c0-14 10-24 24-24s24 10 24 24v46z" transform="rotate(-6 1004 200)" />
          <path d="M1290 220v-58c0-16 12-28 28-28s28 12 28 28v58z" />
          <path d="M1380 220v-36c0-10 8-18 18-18s18 8 18 18v36z" />
        </g>
        <path d="M0 196c120-10 240 8 360 0s240-14 360-4 240 10 360 2 240-8 360 0v26H0z" fill="url(#ground)" />
      </svg>
    </div>
  );
}
