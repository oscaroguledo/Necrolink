/** A spider that lowers itself on a thread and climbs back up. Decorative. */
export function Spider({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-decor
      className={`pointer-events-none fixed top-0 z-20 ${className}`}
    >
      <div className="spider-drop flex flex-col items-center">
        <div className="h-28 w-px bg-gradient-to-b from-transparent via-slate-400/50 to-slate-300/70" />
        <svg
          viewBox="0 0 60 50"
          className="spider-legs -mt-1 h-9 w-11 text-black drop-shadow-[0_0_6px_rgba(0,0,0,0.9)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <g className="legs-left">
            <path d="M25 22 Q14 12 6 16" />
            <path d="M24 26 Q12 22 3 28" />
            <path d="M24 30 Q12 32 5 40" />
            <path d="M26 33 Q18 40 12 48" />
          </g>
          <g className="legs-right">
            <path d="M35 22 Q46 12 54 16" />
            <path d="M36 26 Q48 22 57 28" />
            <path d="M36 30 Q48 32 55 40" />
            <path d="M34 33 Q42 40 48 48" />
          </g>
          <ellipse
            cx="30"
            cy="22"
            rx="6"
            ry="5"
            fill="currentColor"
            stroke="none"
          />
          <ellipse
            cx="30"
            cy="32"
            rx="8.5"
            ry="10"
            fill="currentColor"
            stroke="none"
          />
          <circle cx="27.5" cy="21" r="1.4" fill="#f87171" stroke="none" />
          <circle cx="32.5" cy="21" r="1.4" fill="#f87171" stroke="none" />
        </svg>
      </div>
    </div>
  );
}
