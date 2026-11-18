'use client';

/**
 * A trail of will-o'-the-wisps that follows the mouse. Only for a fine
 * pointer and when motion is welcome; never intercepts clicks.
 */

import { useEffect, useRef } from 'react';

const TRAIL = 7;

export function SpiritCursor() {
  const dots = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || still) return;

    const target = { x: -100, y: -100 };
    const points = Array.from({ length: TRAIL }, () => ({ x: -100, y: -100 }));
    let frame = 0;
    let lastMove = 0;

    const tick = () => {
      let px = target.x;
      let py = target.y;
      points.forEach((p, i) => {
        p.x += (px - p.x) * (i === 0 ? 0.35 : 0.3);
        p.y += (py - p.y) * (i === 0 ? 0.35 : 0.3);
        px = p.x;
        py = p.y;
        const el = dots.current[i];
        if (el)
          el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${1 - i / (TRAIL + 2)})`;
      });
      // Sleep once the trail has caught up
      frame =
        performance.now() - lastMove < 1500 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      target.x = e.clientX;
      target.y = e.clientY;
      lastMove = performance.now();
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      data-decor
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {Array.from({ length: TRAIL }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            dots.current[i] = el;
          }}
          className="spirit-dot absolute -left-1.5 -top-1.5 size-3 rounded-full"
          style={{
            opacity: 0.85 - i * 0.1,
            transform: 'translate3d(-100px,-100px,0)',
          }}
        />
      ))}
    </div>
  );
}
