import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from 'motion/react';
import {
  ArrowUp,
  BarChart3,
  Calendar,
  ClipboardList,
  Clock,
  Timer,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { haptic } from '../lib/audioHaptics';
import { capWord, fm, getLabels } from '../lib/metrics';
import { BrandMark } from './BrandMark';
import type { ActiveView, AppState, ResolvedOS } from '../types/trazik';

interface NavigationProps {
  S: AppState;
  os: ResolvedOS;
  isAdmin: boolean;
  hasPendingInvites: boolean;
  unreadNotifications: number;
  intervalMiniLeft: number | null;
  restMiniLeft: number | null;
  restMiniPhase?: 'work' | 'rest';
  activeSessionMini: { id: string; elapsed: number } | null;
  onNavigate: (view: ActiveView) => void;
  onOpenProfileSheet: () => void;
  onResumeActiveSession: (id: string) => void;
  children: React.ReactNode;
}

const pageVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 52 : dir < 0 ? -52 : 0,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : dir < 0 ? 40 : 0,
    opacity: 0,
  }),
};

export function NavigationShell({
  S,
  os,
  hasPendingInvites,
  unreadNotifications,
  intervalMiniLeft,
  restMiniLeft,
  restMiniPhase = 'rest',
  activeSessionMini,
  onNavigate,
  onOpenProfileSheet,
  onResumeActiveSession,
  children,
}: NavigationProps) {
  const labels = getLabels(S.lbl);
  const isCoach = S.role === 'coach';

  const tabs: { key: ActiveView; label: string; icon: typeof Calendar }[] = isCoach
    ? [
        { key: 'team', label: capWord(labels.plu), icon: Users },
        { key: 'month', label: 'Calendario', icon: Calendar },
        { key: 'plan', label: 'Plan', icon: ClipboardList },
        { key: 'prog', label: 'Progreso', icon: BarChart3 },
        { key: 'pr', label: 'PR', icon: Trophy },
        { key: 'int', label: 'Intervalos', icon: Timer },
      ]
    : [
        { key: 'month', label: 'Calendario', icon: Calendar },
        { key: 'plan', label: 'Programa', icon: ClipboardList },
        { key: 'prog', label: 'Progreso', icon: BarChart3 },
        { key: 'pr', label: 'PR', icon: Trophy },
        { key: 'int', label: 'Intervalos', icon: Timer },
      ];

  const getTabIndex = (view: ActiveView): number => {
    const normalized = view === 'week' || view === 'year' ? 'month' : view;
    return tabs.findIndex((t) => t.key === normalized);
  };

  const curTabIdx = getTabIndex(S.view);
  const lastMainViewRef = useRef<ActiveView>(isCoach ? 'team' : 'month');
  if (curTabIdx !== -1) {
    lastMainViewRef.current = S.view;
  }

  const prevViewRef = useRef<ActiveView>(S.view);
  const slideDirRef = useRef<number>(0);

  if (prevViewRef.current !== S.view) {
    const prevIdx = getTabIndex(prevViewRef.current);
    if (prevIdx !== -1 && curTabIdx !== -1) {
      if (curTabIdx !== prevIdx) {
        slideDirRef.current = curTabIdx > prevIdx ? 1 : -1;
      } else {
        slideDirRef.current = 0;
      }
    } else if (curTabIdx === -1 && prevIdx !== -1) {
      slideDirRef.current = 1;
    } else if (prevIdx === -1 && curTabIdx !== -1) {
      slideDirRef.current = -1;
    } else {
      slideDirRef.current = 0;
    }
    prevViewRef.current = S.view;
  }

  const slideDir = slideDirRef.current;

  const mainRef = useRef<HTMLElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Reset vertical scroll when switching tabs & track vertical scroll position for quick jump-to-top
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [S.view]);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 360);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const dragX = useMotionValue(0);
  const opacityDrag = useTransform(dragX, [-160, 0, 160], [0.76, 1, 0.76]);
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    startTime: number;
    lock: 'h' | 'v' | null;
  } | null>(null);

  const canStartHorizontalSwipe = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [data-no-swipe="true"]'
      )
    ) {
      return false;
    }
    let node: HTMLElement | null = target;
    while (node && node !== mainRef.current) {
      const style = window.getComputedStyle(node);
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        node.scrollWidth > node.clientWidth + 2
      ) {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  };

  const resolveSwipeTarget = (dir: -1 | 1): ActiveView | null => {
    // dir = 1 means swipe left (advance to next tab); dir = -1 means swipe right (back to prev tab)
    if (curTabIdx === -1) {
      return dir === -1 ? lastMainViewRef.current : null;
    }
    const nextIdx = curTabIdx + dir;
    if (nextIdx >= 0 && nextIdx < tabs.length) {
      return tabs[nextIdx].key;
    }
    return null;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    if (!canStartHorizontalSwipe(e.target)) {
      gestureRef.current = null;
      return;
    }
    const t = e.touches[0];
    gestureRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      lastX: t.clientX,
      startTime: Date.now(),
      lock: null,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const g = gestureRef.current;
    if (!g || e.touches.length !== 1) return;
    const t = e.touches[0];
    g.lastX = t.clientX;
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;

    if (g.lock === null) {
      if (Math.abs(dy) > 7 && Math.abs(dy) >= Math.abs(dx) * 0.85) {
        g.lock = 'v';
        dragX.set(0);
        return;
      }
      if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        g.lock = 'h';
      } else {
        return;
      }
    }

    if (g.lock === 'h') {
      const target = resolveSwipeTarget(dx < 0 ? 1 : -1);
      if (target) {
        dragX.set(Math.max(-130, Math.min(130, dx * 0.5)));
      } else {
        dragX.set(Math.max(-34, Math.min(34, dx * 0.16)));
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || g.lock !== 'h') {
      if (dragX.get() !== 0) {
        animate(dragX, 0, { type: 'spring', stiffness: 460, damping: 36 });
      }
      return;
    }

    const endX = e.changedTouches[0]?.clientX ?? g.lastX;
    const dx = endX - g.startX;
    const elapsed = Math.max(1, Date.now() - g.startTime);
    const vx = dx / elapsed;

    const triggered =
      Math.abs(dx) > 52 || (Math.abs(vx) > 0.34 && Math.abs(dx) > 22);

    if (triggered) {
      const target = resolveSwipeTarget(dx < 0 ? 1 : -1);
      if (target) {
        haptic('light');
        dragX.set(0);
        onNavigate(target);
        return;
      }
    }

    animate(dragX, 0, { type: 'spring', stiffness: 460, damping: 36 });
  };

  const handleTouchCancel = () => {
    gestureRef.current = null;
    if (dragX.get() !== 0) {
      animate(dragX, 0, { type: 'spring', stiffness: 460, damping: 36 });
    }
  };

  const isCalendarActive = S.view === 'month' || S.view === 'week' || S.view === 'year';

  const handleTabClick = (key: ActiveView) => {
    haptic('light');
    onNavigate(key);
  };

  const showLiveSessionPill =
    (restMiniLeft !== null || activeSessionMini !== null) && S.view !== 'int';

  const isSecondaryView = S.view === 'perfil' || S.view === 'admin';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Compact Top Bar across all screen sizes (no sidebar) */}
      <header className="sticky top-0 z-30 bg-[var(--bg)]/88 backdrop-blur-xl border-b border-[var(--line)]/70">
        <div className="w-full max-w-5xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
          <div className="flex items-center shrink-0">
            <BrandMark className="w-10 h-8 shrink-0 drop-shadow-[0_4px_12px_rgba(162,89,255,0.38)]" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {intervalMiniLeft !== null && S.view !== 'int' && (
              <button
                type="button"
                onClick={() => handleTabClick('int')}
                className="tf-tap min-h-[38px] px-3 rounded-xl bg-[var(--ac)]/25 border border-[var(--ac2)]/45 text-xs font-mono-num font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Timer className="w-3.5 h-3.5 text-[var(--ac2)]" />
                {fm(intervalMiniLeft)}
              </button>
            )}

            {showLiveSessionPill && activeSessionMini && intervalMiniLeft === null && (
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  onResumeActiveSession(activeSessionMini.id);
                }}
                className={`tf-tap min-h-[38px] px-3 rounded-xl border text-xs font-mono-num font-semibold flex items-center gap-1.5 cursor-pointer ${
                  restMiniLeft !== null && restMiniPhase === 'work'
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                    : 'bg-[var(--surface)] border-[var(--ac2)]/45'
                }`}
              >
                <Clock
                  className={`w-3.5 h-3.5 ${
                    restMiniLeft !== null && restMiniPhase === 'work'
                      ? 'text-emerald-300'
                      : 'text-[var(--ac2)]'
                  }`}
                />
                {restMiniLeft !== null ? fm(restMiniLeft) : fm(activeSessionMini.elapsed)}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                haptic('light');
                onOpenProfileSheet();
              }}
              aria-label="Mi perfil"
              className={`tf-tap relative w-10 h-10 flex items-center justify-center border cursor-pointer ${
                isSecondaryView
                  ? 'border-[var(--ac2)]/65 bg-[var(--ac)]/20 text-[var(--ac2)]'
                  : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ac2)]'
              } ${os === 'ios' ? 'rounded-[14px]' : 'rounded-full'}`}
            >
              <User className="w-5 h-5" />
              {(hasPendingInvites || unreadNotifications > 0) && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-pink-500 border-2 border-[var(--bg)]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Swipeable Viewport */}
      <main
        ref={mainRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-3.5 pb-[calc(94px+env(safe-area-inset-bottom,0px))] overflow-x-clip touch-pan-y"
      >
        {isCoach && ['month', 'week', 'year', 'plan', 'prog', 'pr'].includes(S.view) && (
          <button
            type="button"
            onClick={() => handleTabClick('team')}
            className="tf-tap inline-flex items-center gap-1.5 text-sm text-[var(--mut)] mb-2.5 py-1 cursor-pointer"
          >
            <span className="capitalize">{labels.sing}:</span>
            <b className="text-[var(--ac2)] font-semibold">{S.user} ⇄</b>
          </button>
        )}

        <motion.div style={{ x: dragX, opacity: opacityDrag }} className="relative w-full">
          <AnimatePresence mode="popLayout" initial={false} custom={slideDir}>
            <motion.div
              key={S.view}
              custom={slideDir}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', stiffness: 420, damping: 36, mass: 0.85 },
                opacity: { duration: 0.15, ease: 'easeOut' },
              }}
              className="w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </main>

      {/* Quick Vertical Scroll-to-Top Button when scrolled down */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 8 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={() => {
              haptic('light');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="Subir arriba"
            className="tf-tap fixed right-4 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-30 w-10 h-10 rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)]/90 backdrop-blur-xl text-[var(--ac2)] shadow-lg flex items-center justify-center cursor-pointer"
          >
            <ArrowUp className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar across all screen sizes (iOS Floating Dock vs Android Material 3 Bar) */}
      {os === 'ios' ? (
        <nav
          aria-label="Navegación principal"
          className="fixed left-3 right-3 bottom-[calc(10px+env(safe-area-inset-bottom,0px))] z-40 max-w-xl mx-auto flex items-center gap-1 p-1.5 rounded-[26px] border border-[var(--line)] bg-[var(--surface)]/84 backdrop-blur-2xl shadow-xl"
        >
          {tabs.map((tab) => {
            const active = tab.key === 'month' ? isCalendarActive : S.view === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabClick(tab.key)}
                className={`tf-tap relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-[20px] min-h-[50px] transition-colors cursor-pointer ${
                  active ? 'text-[var(--ac2)]' : 'text-[var(--mut)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="ios-dock-pill"
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className="absolute inset-0 rounded-[20px] bg-[var(--ac)]/22 shadow-[inset_0_0_0_1px_rgba(224,200,255,0.28)] -z-10"
                  />
                )}
                <Icon className="w-[21px] h-[21px] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                <span className="text-[10px] font-semibold tracking-tight truncate max-w-full">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      ) : (
        <nav
          aria-label="Navegación principal"
          className="fixed left-0 right-0 bottom-0 z-40 bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--line)] px-1 pb-[env(safe-area-inset-bottom,0px)]"
        >
          <div className="w-full max-w-2xl mx-auto flex items-center h-[64px]">
            {tabs.map((tab) => {
              const active = tab.key === 'month' ? isCalendarActive : S.view === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabClick(tab.key)}
                  className="tf-tap flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-1 cursor-pointer"
                >
                  <span className="relative flex items-center justify-center w-12 h-7 rounded-full">
                    {active && (
                      <motion.span
                        layoutId="m3-nav-pill"
                        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                        className="absolute inset-0 rounded-full bg-[var(--ac)]/28 -z-10"
                      />
                    )}
                    <Icon
                      className={`w-5 h-5 ${active ? 'text-[var(--ac2)]' : 'text-[var(--mut)]'}`}
                      strokeWidth={active ? 2.25 : 1.8}
                    />
                  </span>
                  <span
                    className={`text-[10.5px] font-medium truncate max-w-full px-0.5 ${
                      active ? 'text-[var(--tx)] font-semibold' : 'text-[var(--mut)]'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
