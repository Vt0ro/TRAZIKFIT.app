import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { haptic } from '../lib/audioHaptics';
import type { ResolvedOS } from '../types/trazik';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  os: ResolvedOS;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  os,
  maxWidthClass = 'max-w-2xl',
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ y: number; x: number; t: number; grab: boolean; active: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    setDragging(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !sheetRef.current) return;
    const t = e.touches[0];
    const rect = sheetRef.current.getBoundingClientRect();
    const grab = t.clientY - rect.top < 56;
    dragStart.current = { y: t.clientY, x: t.clientX, t: Date.now(), grab, active: false };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const st = dragStart.current;
    const el = sheetRef.current;
    if (!st || !el || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dy = t.clientY - st.y;
    const dx = t.clientX - st.x;
    if (!st.active) {
      if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.4 && (st.grab || el.scrollTop <= 0)) {
        st.active = true;
        setDragging(true);
      } else if (Math.abs(dx) > 10 || dy < -6) {
        dragStart.current = null;
        return;
      } else {
        return;
      }
    }
    setDragY(Math.max(0, dy));
  };

  const handleTouchEnd = () => {
    const st = dragStart.current;
    dragStart.current = null;
    if (!st || !st.active) {
      setDragging(false);
      setDragY(0);
      return;
    }
    const velocity = dragY / Math.max(1, Date.now() - st.t);
    setDragging(false);
    if (dragY > 115 || velocity > 0.55) {
      haptic('light');
      setDragY(0);
      onClose();
    } else {
      setDragY(0);
    }
  };

  const backdropFactor = dragging
    ? Math.max(0.25, 1 - dragY / ((sheetRef.current?.offsetHeight || 500) * 1.1))
    : 1;

  const sheetTransition =
    os === 'ios'
      ? { type: 'spring' as const, stiffness: 390, damping: 36, mass: 0.9 }
      : { duration: 0.24, ease: [0.2, 0, 0, 1] as const };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="bottom-sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: backdropFactor }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={sheetRef}
            key="bottom-sheet-panel"
            initial={{ y: 48, opacity: 0, scale: 0.985 }}
            animate={{ y: dragY, opacity: 1, scale: 1 }}
            exit={{ y: 44, opacity: 0, scale: 0.985 }}
            transition={dragging ? { duration: 0 } : sheetTransition}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className={`w-full ${maxWidthClass} max-h-[94dvh] md:max-h-[88vh] overflow-y-auto overscroll-contain border border-[var(--line)] shadow-2xl ${
              os === 'ios'
                ? 'rounded-t-[28px] md:rounded-[28px]'
                : 'rounded-t-[24px] md:rounded-[24px]'
            } bg-[var(--bg)] px-4 pt-2 pb-[calc(22px+env(safe-area-inset-bottom,0px))]`}
          >
            <div className="flex justify-center py-1.5 mb-1.5 cursor-grab" aria-hidden="true">
              <div className="w-10 h-1.5 rounded-full bg-[var(--mut)]/35" />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
