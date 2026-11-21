import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BrandSlogan, BrandWordmark } from './BrandMark';

interface SplashScreenProps {
  visible: boolean;
  progress?: number;
}

export function SplashScreen({ visible, progress = 100 }: SplashScreenProps) {
  const [visualPct, setVisualPct] = useState(0);
  const targetRef = useRef(progress);
  targetRef.current = Math.max(0, Math.min(100, progress));

  useEffect(() => {
    if (!visible) return;
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.008, (now - lastTime) / 1000));
      lastTime = now;

      setVisualPct((cur) => {
        const target = targetRef.current;
        if (cur >= target) return cur;
        const speed = target >= 100 ? 115 : 58;
        const next = Math.min(
          target,
          cur + Math.max(18 * dt, (target - cur) * 4.2 * dt + speed * dt * 0.25)
        );
        return next >= 99.6 && target >= 100 ? 100 : next;
      });

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [visible]);

  if (!visible) return null;

  const clampedPct = Math.max(0, Math.min(100, visualPct));
  const clipTop = Math.max(0, 100 - clampedPct);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between px-6 py-14 bg-[#0A051A] text-[#F7F3FF] overflow-hidden select-none">
      {/* Static Ambient Background (never animated) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 42% at 50% 44%, rgba(50, 28, 106, 0.58) 0%, rgba(10, 5, 26, 0) 72%)',
        }}
      />

      <div aria-hidden="true" className="h-8" />

      {/* Center Stage: Only the Official Logo animates (3D depth + 2D color fill) */}
      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-6 w-40 sm:w-48" style={{ perspective: '900px' }}>
          <motion.div
            initial={{ opacity: 0.45, rotateX: 28, rotateY: -24, scale: 0.86 }}
            animate={{ opacity: 1, rotateX: 0, rotateY: 0, scale: 1 }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformStyle: 'preserve-3d' }}
            className="relative w-full"
          >
            {/* Subtle 3D extruded shadow silhouette behind emblem */}
            <img
              src="/brand/logo/trazikfit-mark.png"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain grayscale brightness-0 opacity-45 blur-[2px] translate-y-2 scale-[0.99] select-none pointer-events-none"
              style={{ transform: 'translateZ(-18px)' }}
            />

            {/* Unfilled 2D base silhouette */}
            <img
              src="/brand/logo/trazikfit-mark.png"
              alt=""
              aria-hidden="true"
              draggable={false}
              className="relative w-full h-auto object-contain grayscale opacity-20 brightness-75 select-none"
            />

            {/* Full-color 2D emblem filling smoothly from bottom to top */}
            <img
              src="/brand/logo/trazikfit-mark.png"
              alt="TrazikFit"
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain select-none"
              style={{
                clipPath: `inset(${clipTop.toFixed(2)}% 0% 0% 0%)`,
                WebkitClipPath: `inset(${clipTop.toFixed(2)}% 0% 0% 0%)`,
                filter: `drop-shadow(0 12px 34px rgba(162, 89, 255, ${(
                  0.22 +
                  (clampedPct / 100) * 0.32
                ).toFixed(2)}))`,
              }}
            />

            {/* 2D luminous fill edge line */}
            {clampedPct > 2 && clampedPct < 99 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-2 right-2 h-[2px] rounded-full bg-[#E0C8FF]/85 blur-[1px]"
                style={{ top: `${clipTop.toFixed(2)}%` }}
              />
            )}
          </motion.div>
        </div>

        <BrandWordmark className="text-[38px] sm:text-[44px] leading-none" />

        <div className="mt-3.5">
          <BrandSlogan className="text-[11px] sm:text-xs text-[#CFC8DD] tracking-[0.22em]" />
        </div>
      </div>

      {/* Static progress text (no spinner) */}
      <div className="relative flex flex-col items-center gap-1 pb-4">
        <span className="text-sm font-semibold tabular-nums text-[#E0C8FF]">
          {Math.round(clampedPct)}%
        </span>
        <span className="text-[11px] font-medium tracking-wider uppercase text-[#CFC8DD]/70">
          Cargando
        </span>
      </div>
    </div>
  );
}
