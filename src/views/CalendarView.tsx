import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  Maximize2,
  Play,
} from 'lucide-react';
import { BarChart } from '../components/Charts';
import { haptic } from '../lib/audioHaptics';
import {
  DN,
  MET,
  MN,
  UN,
  add,
  fdateShort,
  fmt,
  iso,
  mon,
  onRange,
  pd,
  smoothScrollItemIntoView,
  todayStr,
  tot,
  val,
} from '../lib/metrics';
import {
  formatNotifTime,
  formatRelativeDayLabel,
  isSessionFullyDone,
} from '../lib/notifications';
import type {
  ActiveView,
  AppNotification,
  AppState,
  MetricKey,
  NotifPermissionState,
} from '../types/trazik';

interface CalendarViewProps {
  S: AppState;
  notifications?: AppNotification[];
  unreadNotifCount?: number;
  notifPermission?: NotifPermissionState;
  onChangeView: (view: ActiveView) => void;
  onNavigatePeriod: (dir: -1 | 1) => void;
  onJumpToDate: (date: string) => void;
  onChangeMetric: (m: MetricKey) => void;
  onOpenSession: (id: string) => void;
  onDayTap: (date: string) => void;
  onClearSessions: (scope: 'month' | 'all') => void;
  onOpenNotifications?: () => void;
  onRequestNotificationPermission?: () => void;
}

const CAL_BAR_STORAGE_KEY = 'plan_v1_cal_bar_open';

export function CalendarView({
  S,
  notifications = [],
  unreadNotifCount = 0,
  notifPermission = 'default',
  onChangeView,
  onNavigatePeriod,
  onJumpToDate,
  onChangeMetric,
  onOpenSession,
  onDayTap,
  onClearSessions,
  onOpenNotifications,
  onRequestNotificationPermission,
}: CalendarViewProps) {
  const [confirmClear, setConfirmClear] = useState<'month' | 'all' | ''>('');
  const [barExpanded, setBarExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(CAL_BAR_STORAGE_KEY);
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });
  const today = todayStr();
  const A = pd(S.anchor);
  const L = S.sessions.filter((s) => s.sport === S.sport && s.user === S.user);

  const toggleBarExpanded = () => {
    haptic('light');
    setBarExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CAL_BAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const sessionOverview = useMemo(() => {
    const completed = L.filter(
      (s) =>
        isSessionFullyDone(s) ||
        (s.date < today && s.exercises.some((e) => e.sets.some((st) => st.done)))
    ).sort((a, b) => b.date.localeCompare(a.date));
    const lastCompleted = completed[0] || null;
    const recent30Cutoff = iso(add(new Date(), -30));
    const recent30Count = completed.filter((s) => s.date >= recent30Cutoff).length;
    let totalTon = 0;
    let totalSeries = 0;
    completed.forEach((s) => {
      const t = tot(S, s);
      totalTon += t.ton;
      totalSeries += t.series;
    });

    const upcoming = L.filter((s) => s.date >= today && !isSessionFullyDone(s)).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const nextSession = upcoming[0] || null;
    const latestNotif = notifications.find((n) => !n.read) || notifications[0] || null;

    return {
      completedCount: completed.length,
      recent30Count,
      totalTon,
      totalSeries,
      lastCompleted,
      nextSession,
      latestNotif,
    };
  }, [L, S, today, notifications]);

  const periodData = (() => {
    if (S.view === 'week') {
      const m = mon(A);
      return {
        label: `${m.getDate()} ${MN[m.getMonth()]} – ${add(m, 6).getDate()} ${MN[add(m, 6).getMonth()]}`,
        labels: DN,
        vals: DN.map((_, i) => {
          const d = iso(add(m, i));
          return val(S, onRange(L, d, d), S.metric);
        }),
      };
    }
    if (S.view === 'month') {
      const f = new Date(A.getFullYear(), A.getMonth(), 1);
      const l = new Date(A.getFullYear(), A.getMonth() + 1, 0);
      const labels: string[] = [];
      const vals: number[] = [];
      let m = mon(f);
      let i = 1;
      while (m <= l) {
        labels.push('S' + i++);
        vals.push(val(S, onRange(L, iso(m), iso(add(m, 6))), S.metric));
        m = add(m, 7);
      }
      return {
        label: `${MN[A.getMonth()]} ${A.getFullYear()}`,
        labels,
        vals,
      };
    }
    const h = A.getMonth() < 6 ? 0 : 6;
    const y = A.getFullYear();
    const labels: string[] = [];
    const vals: number[] = [];
    for (let k = 0; k < 6; k++) {
      const f = new Date(y, h + k, 1);
      const l = new Date(y, h + k + 1, 0);
      labels.push(MN[h + k]);
      vals.push(val(S, onRange(L, iso(f), iso(l)), S.metric));
    }
    return {
      label: `${h ? '2.º' : '1.er'} semestre ${y}`,
      labels,
      vals,
    };
  })();

  // Build month grid cells
  const renderMonthGrid = () => {
    const f = new Date(A.getFullYear(), A.getMonth(), 1);
    const l = new Date(A.getFullYear(), A.getMonth() + 1, 0);
    const cells: Date[] = [];
    let d = mon(f);
    while (d <= l) {
      cells.push(new Date(d));
      d = add(d, 1);
    }

    return (
      <div className="tf-card p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {DN.map((dayLabel) => (
            <div
              key={dayLabel}
              className="text-center text-xs font-semibold text-[var(--mut)] py-1"
            >
              {dayLabel}
            </div>
          ))}
          {cells.map((cellDate) => {
            const k = iso(cellDate);
            const isOff = cellDate.getMonth() !== f.getMonth();
            const isToday = k === today;
            const daySessions = onRange(L, k, k);

            return (
              <div
                key={k}
                role="button"
                tabIndex={0}
                onClick={() => {
                  haptic('light');
                  onDayTap(k);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onDayTap(k);
                  }
                }}
                className={`tf-tap min-h-[76px] sm:min-h-[90px] rounded-xl p-1.5 text-left cursor-pointer overflow-hidden bg-[var(--surface-2)] border border-transparent hover:border-[var(--line-strong)] ${
                  isOff ? 'opacity-35' : ''
                } ${isToday ? 'ring-1 ring-[var(--ac2)] bg-[var(--ac)]/10' : ''}`}
              >
                <span
                  className={`block text-xs font-semibold tabular-nums mb-1 ${
                    isToday ? 'text-[var(--ac2)]' : 'text-[var(--tx)]'
                  }`}
                >
                  {cellDate.getDate()}
                </span>
                <div className="space-y-1">
                  {daySessions.map((s) => {
                    const allDone =
                      s.exercises.length > 0 &&
                      s.exercises.every((e) => e.sets.every((x) => x.done));
                    const isTodayPending = isToday && !allDone;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          haptic('light');
                          onOpenSession(s.id);
                        }}
                        className={`tf-tap w-full text-left flex items-center justify-between gap-1 text-white text-[10px] sm:text-[11px] font-medium rounded-md px-1.5 py-0.5 cursor-pointer hover:brightness-110 ${
                          allDone
                            ? 'bg-emerald-600/90'
                            : isTodayPending
                            ? 'bg-gradient-to-r from-[#A259FF] to-[#6D28D9] shadow-sm shadow-[#A259FF]/40 ring-1 ring-[#E0C8FF]/45'
                            : 'bg-[var(--ac)]'
                        }`}
                      >
                        <span className="truncate">
                          {s.name || 'Sesión'}
                          {s.notes ? ' ·' : ''}
                        </span>
                        <span className="shrink-0 text-[9px] opacity-95">
                          {allDone ? '✓' : '▶'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-[var(--mut)]">
          Toca cualquier sesión o día para iniciar el entrenamiento en pantalla completa.
        </p>

        {S.role !== 'atleta' && (
          <div className="pt-2 border-t border-[var(--line)]/60 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (confirmClear === 'month') {
                    onClearSessions('month');
                    setConfirmClear('');
                  } else {
                    setConfirmClear('month');
                  }
                }}
                className="min-h-[40px] px-3.5 rounded-xl bg-[var(--danger)]/15 text-[var(--danger)] text-xs font-semibold cursor-pointer"
              >
                {confirmClear === 'month' ? '¿Confirmar vaciar mes?' : 'Vaciar este mes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmClear === 'all') {
                    onClearSessions('all');
                    setConfirmClear('');
                  } else {
                    setConfirmClear('all');
                  }
                }}
                className="min-h-[40px] px-3.5 rounded-xl bg-[var(--danger)]/15 text-[var(--danger)] text-xs font-semibold cursor-pointer"
              >
                {confirmClear === 'all' ? '¿Confirmar borrar todo?' : 'Borrar todas las sesiones'}
              </button>
            </div>
            <p className="text-[11px] text-[var(--mut)]">
              Solo se borra del calendario; el plan no cambia.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderWeekView = () => {
    const m = mon(A);
    return (
      <div className="tf-card divide-y divide-[var(--line)]/70 px-4">
        {DN.map((dayLabel, i) => {
          const dayDate = add(m, i);
          const d = iso(dayDate);
          const isToday = d === today;
          const daySessions = onRange(L, d, d);
          return (
            <div key={d} className="flex gap-3 py-3">
              <div className="w-12 text-center shrink-0">
                <span className="block text-[11px] text-[var(--mut)]">{dayLabel}</span>
                <b
                  className={`block text-xl font-bold tabular-nums ${
                    isToday ? 'text-[var(--ac2)]' : 'text-[var(--tx)]'
                  }`}
                >
                  {dayDate.getDate()}
                </b>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {daySessions.map((s) => {
                  const t = tot(S, s);
                  const allDone = isSessionFullyDone(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        haptic('light');
                        onOpenSession(s.id);
                      }}
                      className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 border cursor-pointer transition-colors ${
                        !allDone
                          ? 'bg-gradient-to-r from-[#321C6A]/55 to-[var(--surface-2)] border-[var(--ac2)]/40 hover:border-[var(--ac2)]'
                          : 'bg-[var(--surface-2)] border-[var(--line)]/70 hover:border-[var(--ac2)]/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="block font-medium text-sm truncate">
                          {s.name || 'Sesión'}
                        </span>
                        <span className="block text-xs text-[var(--mut)]">
                          {t.series} series · {fmt(t.ton)} kg
                          {t.rpe ? ` · RPE ${t.rpe.toFixed(1)}` : ''}
                        </span>
                      </div>
                      {allDone ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          Lista
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--ac)] text-white text-[11px] font-semibold shrink-0">
                          <Maximize2 className="w-3 h-3" />
                          Entrenar
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    onDayTap(d);
                  }}
                  className="w-full min-h-[38px] rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--mut)] hover:text-[var(--tx)] hover:border-[var(--ac2)]/50 cursor-pointer"
                >
                  + Sesión
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderYearView = () => {
    const y = A.getFullYear();
    const hh = A.getMonth() < 6 ? 0 : 6;
    return (
      <div className="tf-card p-4 space-y-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-[var(--mut)] border-b border-[var(--line)]">
              <th className="text-left py-2 font-medium">Mes</th>
              <th className="text-center py-2 font-medium">Sesiones</th>
              <th className="text-center py-2 font-medium">Reps</th>
              <th className="text-center py-2 font-medium">RPE</th>
              <th className="text-right py-2 font-medium">Tonelaje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]/60">
            {Array.from({ length: 6 }, (_, k) => {
              const f = new Date(y, hh + k, 1);
              const l = new Date(y, hh + k + 1, 0);
              const X = onRange(L, iso(f), iso(l));
              return (
                <tr
                  key={k}
                  onClick={() => onJumpToDate(iso(f))}
                  className="cursor-pointer hover:bg-[var(--surface-2)]/60 transition-colors"
                >
                  <td className="py-3 font-medium">{MN[hh + k]}</td>
                  <td className="py-3 text-center tabular-nums">{X.length}</td>
                  <td className="py-3 text-center tabular-nums">{fmt(val(S, X, 'reps'))}</td>
                  <td className="py-3 text-center tabular-nums">
                    {val(S, X, 'rpe').toFixed(1)}
                  </td>
                  <td className="py-3 text-right tabular-nums">{fmt(val(S, X, 'ton'))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-[var(--mut)]">
          Toca un mes para planificarlo en detalle.
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Minimalist Session Summary & Next Session Strip (shared across Athlete & Trainer) */}
      <section
        aria-label="Resumen y próxima sesión"
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/90 overflow-hidden"
      >
        {/* Minimal header bar */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-2">
          <button
            type="button"
            onClick={toggleBarExpanded}
            className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
          >
            <CalendarClock className="w-3.5 h-3.5 text-[var(--ac2)] shrink-0" />
            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[var(--tx)]">
                Resumen
              </span>
              <span className="text-[11px] text-[var(--mut)] tabular-nums">
                {sessionOverview.completedCount} completada
                {sessionOverview.completedCount === 1 ? '' : 's'}
              </span>
              {!barExpanded && sessionOverview.nextSession && (
                <span className="text-[11px] text-[var(--ac2)] truncate">
                  · Próxima ({formatRelativeDayLabel(sessionOverview.nextSession.date, today)}):{' '}
                  {sessionOverview.nextSession.name || 'Entrenamiento'}
                </span>
              )}
            </div>
            <span className="text-[var(--mut)] p-0.5 shrink-0">
              {barExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {!barExpanded && sessionOverview.nextSession && (
              <button
                type="button"
                onClick={() => {
                  haptic('medium');
                  onOpenSession(sessionOverview.nextSession!.id);
                }}
                className="tf-tap px-2.5 py-1 rounded-lg bg-[var(--ac)] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                Entrenar
              </button>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {barExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-t border-[var(--line)]/60"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--line)]/60">
                {/* Past workouts minimal block */}
                <div className="px-3.5 py-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10.5px] text-[var(--mut)]">
                    <span className="uppercase tracking-wider font-semibold flex items-center gap-1">
                      <History className="w-3 h-3 text-[var(--ac2)]" />
                      Pasadas
                    </span>
                    <span className="tabular-nums">{sessionOverview.recent30Count} en 30d</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <b className="font-display text-lg font-bold tabular-nums text-[var(--tx)]">
                      {sessionOverview.completedCount}
                    </b>
                    <span className="text-[11px] text-[var(--mut)] tabular-nums truncate">
                      {sessionOverview.totalSeries} series · {fmt(sessionOverview.totalTon)} kg
                    </span>
                  </div>
                  {sessionOverview.lastCompleted ? (
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        onOpenSession(sessionOverview.lastCompleted!.id);
                      }}
                      className="w-full text-left text-[11px] text-[var(--mut)] hover:text-[var(--tx)] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="truncate">
                        Última: {sessionOverview.lastCompleted.name || 'Sesión'}
                      </span>
                      <span className="shrink-0 text-[var(--ac2)]">
                        {formatRelativeDayLabel(sessionOverview.lastCompleted.date, today)}
                      </span>
                    </button>
                  ) : (
                    <p className="text-[11px] text-[var(--mut)]">Sin sesiones completadas</p>
                  )}
                </div>

                {/* Next session minimal block */}
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[10.5px]">
                      <span className="uppercase tracking-wider font-semibold text-[var(--mut)]">
                        Próxima
                      </span>
                      {sessionOverview.nextSession && (
                        <span
                          className={`font-semibold ${
                            sessionOverview.nextSession.date === today
                              ? 'text-[var(--ac2)]'
                              : 'text-[var(--mut)]'
                          }`}
                        >
                          · {formatRelativeDayLabel(sessionOverview.nextSession.date, today)}
                        </span>
                      )}
                    </div>
                    {sessionOverview.nextSession ? (
                      <>
                        <b className="block text-xs font-semibold truncate text-[var(--tx)]">
                          {sessionOverview.nextSession.name || 'Entrenamiento'}
                        </b>
                        <span className="block text-[11px] text-[var(--mut)] truncate">
                          {fdateShort(sessionOverview.nextSession.date)} ·{' '}
                          {sessionOverview.nextSession.exercises.length} ej.
                        </span>
                      </>
                    ) : (
                      <p className="text-[11px] text-[var(--mut)]">
                        Sin sesiones pendientes
                      </p>
                    )}
                  </div>

                  {sessionOverview.nextSession && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic('medium');
                        onOpenSession(sessionOverview.nextSession!.id);
                      }}
                      className="tf-tap shrink-0 h-8 px-3 rounded-xl bg-[var(--ac)] text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer hover:brightness-110"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Entrenar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Minimal notification link strip */}
              <div className="px-3.5 py-1.5 border-t border-[var(--line)]/50 bg-[var(--surface-2)]/35 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    if (sessionOverview.latestNotif?.sessionId) {
                      onOpenSession(sessionOverview.latestNotif.sessionId);
                    } else if (onOpenNotifications) {
                      onOpenNotifications();
                    }
                  }}
                  className="min-w-0 flex-1 flex items-center gap-1.5 text-left cursor-pointer"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      unreadNotifCount > 0 ? 'bg-[var(--ac2)]' : 'bg-[var(--mut)]/60'
                    }`}
                  />
                  <span className="text-[11px] text-[var(--mut)] truncate">
                    {sessionOverview.latestNotif
                      ? `${sessionOverview.latestNotif.title}: ${sessionOverview.latestNotif.body}`
                      : S.notifEnabled !== false
                      ? 'Recordatorios y avisos vinculados'
                      : 'Notificaciones desactivadas'}
                  </span>
                  {sessionOverview.latestNotif && (
                    <span className="text-[10px] text-[var(--mut)]/80 shrink-0 tabular-nums">
                      · {formatNotifTime(sessionOverview.latestNotif.createdAt)}
                    </span>
                  )}
                </button>

                {notifPermission === 'default' &&
                  S.notifEnabled !== false &&
                  onRequestNotificationPermission && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        onRequestNotificationPermission();
                      }}
                      className="text-[11px] font-semibold text-[var(--ac2)] shrink-0 cursor-pointer hover:underline"
                    >
                      Activar avisos
                    </button>
                  )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Calendar Header & Granularity Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onNavigatePeriod(-1);
            }}
            aria-label="Período anterior"
            className="w-10 h-10 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center cursor-pointer active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <strong className="text-base sm:text-lg font-display font-bold min-w-[130px] text-center">
            {periodData.label}
          </strong>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onNavigatePeriod(1);
            }}
            aria-label="Período siguiente"
            className="w-10 h-10 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center cursor-pointer active:scale-95"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--line)]">
          {(
            [
              ['week', 'Semana'],
              ['month', 'Mes'],
              ['year', 'Semestre'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                haptic('light');
                onChangeView(k);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                S.view === k
                  ? 'bg-[var(--ac)] text-white'
                  : 'text-[var(--mut)] hover:text-[var(--tx)]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {S.view === 'week' && renderWeekView()}
      {S.view === 'month' && renderMonthGrid()}
      {S.view === 'year' && renderYearView()}

      {/* Period Summary Chart */}
      <div className="tf-card p-4 space-y-3">
        <div
          data-no-swipe="true"
          className="flex gap-1.5 overflow-x-auto no-scrollbar touch-pan-x snap-x pb-0.5"
        >
          {(Object.entries(MET) as [MetricKey, string][]).map(([k, nm]) => (
            <button
              key={k}
              type="button"
              onClick={(e) => {
                haptic('light');
                smoothScrollItemIntoView(e.currentTarget);
                onChangeMetric(k);
              }}
              className={`snap-start px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                S.metric === k
                  ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                  : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--mut)]'
              }`}
            >
              {nm}
            </button>
          ))}
        </div>
        <BarChart vals={periodData.vals} labels={periodData.labels} />
        <p className="text-xs text-[var(--mut)]">{UN[S.metric]}</p>
      </div>
    </div>
  );
}
