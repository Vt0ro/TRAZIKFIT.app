import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BrandSlogan, BrandWordmark } from './BrandMark';

interface SplashScreenProps {
  visible: boolean;
  progress?: number;
}

const LOGO_SRC = '/brand/logo/trazikfit-mark.png';

export function SplashScreen({ visible, progress = 100 }: SplashScreenProps) {
  const [visualPct, setVisualPct] = useState(0);
  const targetRef = useRef(progress);
  targetRef.current = Math.max(0, Math.min(100, progress));
  const shouldReduceMotion = useReducedMotion();

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

  const clampedPct = Math.max(0, Math.min(100, visualPct));
  const clipTop = Math.max(0, 100 - clampedPct);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="tf-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.05 : 0.34, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-between px-6 py-14 bg-[#0A051A] text-[#F7F3FF] overflow-hidden select-none"
        >
      {/* Static Ambient Surface (never animated) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(56% 38% at 50% 45%, rgba(50, 28, 106, 0.44) 0%, rgba(10, 5, 26, 0) 70%)',
        }}
      />

      <div aria-hidden="true" className="h-8" />

      {/* Center Stage: Only the Official Logo animates (3D depth stack + 2D masked fill & specular sweep) */}
      <div className="relative flex flex-col items-center text-center">
        <div
          className="relative mb-7 w-36 sm:w-44"
          style={{ perspective: '1100px' }}
        >
          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 0, rotateX: 22, rotateY: -22, scale: 0.88 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : {
                    opacity: 1,
                    rotateX: [0, 5, -3, 0],
                    rotateY: [0, -7, 7, 0],
                    scale: 1,
                  }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0.2 }
                : {
                    opacity: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
                    scale: { duration: 0.72, ease: [0.16, 1, 0.3, 1] },
                    rotateX: {
                      duration: 4.8,
                      ease: 'easeInOut',
                      repeat: Infinity,
                      repeatType: 'mirror',
                    },
                    rotateY: {
                      duration: 5.4,
                      ease: 'easeInOut',
                      repeat: Infinity,
                      repeatType: 'mirror',
                    },
                  }
            }
            style={{ transformStyle: 'preserve-3d' }}
            className="relative w-full"
          >
            {/* 3D Extruded Back-Planes (pure obsidian-violet architectural thickness) */}
            <img
              src={LOGO_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute inset-0 w-full h-full object-contain brightness-0 opacity-50 select-none"
              style={{ transform: 'translateZ(-16px) scale(0.985)' }}
            />
            <img
              src={LOGO_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute inset-0 w-full h-full object-contain grayscale brightness-50 opacity-25 select-none"
              style={{ transform: 'translateZ(-8px) scale(0.992)' }}
            />

            {/* 2D Unfilled Etched Base */}
            <img
              src={LOGO_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="relative w-full h-auto object-contain grayscale opacity-20 brightness-125 contrast-125 select-none"
              style={{ transform: 'translateZ(0px)' }}
            />

            {/* 2D Precision Color Reveal (fills cleanly bottom-to-top) */}
            <img
              src={LOGO_SRC}
              alt="TrazikFit"
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain select-none"
              style={{
                transform: 'translateZ(2px)',
                clipPath: `inset(${clipTop.toFixed(2)}% 0% 0% 0%)`,
                WebkitClipPath: `inset(${clipTop.toFixed(2)}% 0% 0% 0%)`,
                filter: `drop-shadow(0 14px 28px rgba(109, 40, 217, ${(
                  0.18 +
                  (clampedPct / 100) * 0.28
                ).toFixed(2)}))`,
              }}
            />

            {/* Masked Architectural Specular Sweep (strictly clipped inside logo silhouette) */}
            {!shouldReduceMotion && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden"
                style={{
                  transform: 'translateZ(4px)',
                  maskImage: `url(${LOGO_SRC})`,
                  WebkitMaskImage: `url(${LOGO_SRC})`,
                  maskSize: 'contain',
                  WebkitMaskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  WebkitMaskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  WebkitMaskPosition: 'center',
                }}
              >
                <motion.div
                  initial={{ x: '-135%', opacity: 0 }}
                  animate={{ x: '135%', opacity: [0, 0.85, 0] }}
                  transition={{
                    duration: 1.9,
                    repeat: Infinity,
                    repeatDelay: 0.7,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="absolute inset-y-[-20%] w-[58%] rotate-[18deg]"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(224, 200, 255, 0.38) 48%, rgba(255, 255, 255, 0.65) 52%, transparent 100%)',
                  }}
                />

                {/* Minimalist 1.5px liquid frontier inside logo mask */}
                {clampedPct > 2 && clampedPct < 99 && (
                  <div
                    className="absolute left-0 right-0 h-[1.5px]"
                    style={{
                      top: `${clipTop.toFixed(2)}%`,
                      background:
                        'linear-gradient(90deg, rgba(162,89,255,0.2) 0%, rgba(247,243,255,0.92) 50%, rgba(162,89,255,0.2) 100%)',
                    }}
                  />
                )}
              </div>
            )}
          </motion.div>
        </div>

        <BrandWordmark className="text-[36px] sm:text-[42px] leading-none tracking-tight" />

        <div className="mt-3">
          <BrandSlogan className="text-[10.5px] sm:text-[11.5px] text-[#CFC8DD]/80 tracking-[0.24em]" />
        </div>
      </div>

      {/* Ultra-minimalist progress readout + hairline scaleX bar */}
      <div className="relative flex flex-col items-center gap-2.5 pb-4">
        <div className="w-28 h-[2px] rounded-full bg-[#321C6A]/55 overflow-hidden">
          <div
            className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#A259FF] to-[#E0C8FF]"
            style={{ transform: `scaleX(${(clampedPct / 100).toFixed(4)})` }}
          />
        </div>
        <span className="text-xs font-medium tabular-nums tracking-[0.14em] text-[#CFC8DD]/85">
          {Math.round(clampedPct)}%
        </span>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
