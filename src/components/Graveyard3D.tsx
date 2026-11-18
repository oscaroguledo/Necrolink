'use client';

/**
 * Mounts the three.js graveyard behind the page once the browser is idle.
 * three.js is loaded as a separate chunk, so it never delays the first paint.
 * If WebGL is missing or the context is lost, the CSS graveyard
 * (Atmosphere.tsx) simply stays visible.
 */

import { useEffect, useRef, useState } from 'react';
import type { SceneHandle } from './three/graveyard-scene';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function Graveyard3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webglAvailable()) return;

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const lowPower =
      window.matchMedia('(max-width: 768px), (pointer: coarse)').matches ||
      (navigator.hardwareConcurrency ?? 8) <= 4;

    let scene: SceneHandle | undefined;
    let cancelled = false;
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    const root = document.documentElement;

    const onResize = () => scene?.resize(window.innerWidth, window.innerHeight);
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scene?.setScroll(max > 0 ? window.scrollY / max : 0);
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      scene?.setPointer(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1)
      );
    };
    const onVisibility = () => scene?.setRunning(!document.hidden);
    const onContextLost = (e: Event) => {
      e.preventDefault();
      scene?.setRunning(false);
      delete root.dataset.scene;
      setReady(false);
    };

    const start = async () => {
      try {
        const { createGraveyardScene } =
          await import('./three/graveyard-scene');
        if (cancelled) return;
        scene = createGraveyardScene(canvas, {
          reducedMotion,
          lowPower,
          onLightning: () => {
            setFlash((n) => n + 1);
            clearTimeout(flashTimer);
            flashTimer = setTimeout(() => setFlash(0), 700);
          },
        });
        onResize();
        onScroll();
        root.dataset.scene = '3d';
        setReady(true);
      } catch {
        // No 3D: the CSS graveyard stays
      }
    };

    // Wait until the page has settled so the scene never competes with it
    const idle =
      window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
    const idleId = idle(() => void start(), {
      timeout: 2000,
    } as IdleRequestOptions);

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onContextLost);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback && typeof idleId === 'number')
        window.cancelIdleCallback(idleId);
      clearTimeout(flashTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      delete root.dataset.scene;
      scene?.dispose();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      data-decor
      className="pointer-events-none fixed inset-0 -z-10"
    >
      <canvas
        ref={canvasRef}
        className={`block h-full w-full transition-opacity duration-[1500ms] ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Darken the middle so text stays readable over the scene */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,rgba(7,10,13,0.55),rgba(7,10,13,0.15)_70%,transparent)]" />
      {/* Lightning lights up the page too */}
      <div
        key={flash}
        className={`absolute inset-0 bg-slate-200 ${flash ? 'lightning' : 'opacity-0'}`}
      />
    </div>
  );
}
