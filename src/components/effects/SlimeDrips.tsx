/** Green slime dripping from the bottom edge of the title. Decorative. */
const DRIPS = [
  { x: 8, h: 18, delay: '0s' },
  { x: 19, h: 30, delay: '1.2s' },
  { x: 33, h: 14, delay: '2.1s' },
  { x: 47, h: 30, delay: '0.6s' },
  { x: 58, h: 20, delay: '3s' },
  { x: 71, h: 26, delay: '1.8s' },
  { x: 86, h: 16, delay: '2.6s' },
];

export function SlimeDrips() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 44"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-[6%] top-[86%] h-[0.55em] w-[88%] overflow-visible"
    >
      <defs>
        <linearGradient id="slime" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9f99d" />
          <stop offset="1" stopColor="#84cc16" />
        </linearGradient>
      </defs>
      {DRIPS.map((d, i) => (
        <g key={i}>
          <path
            className="slime-drip"
            style={{ animationDelay: d.delay }}
            d={`M${d.x - 2.2} 0 Q${d.x - 2} ${d.h * 0.7} ${d.x} ${d.h} Q${d.x + 2} ${d.h * 0.7} ${d.x + 2.2} 0 Z`}
            fill="url(#slime)"
          />
          <circle
            className="slime-drop"
            style={{ animationDelay: d.delay }}
            cx={d.x}
            cy={d.h + 2}
            r="1.6"
            fill="#a3e635"
          />
        </g>
      ))}
    </svg>
  );
}
