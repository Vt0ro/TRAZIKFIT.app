import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Search } from 'lucide-react';
import { BarChart } from '../components/Charts';
import { haptic } from '../lib/audioHaptics';
import { MET, UN, buckets, fmt, nz, onRange, smoothScrollItemIntoView, val } from '../lib/metrics';
import type { AppState, MetricKey } from '../types/trazik';

interface ProgressViewProps {
  S: AppState;
  onChangeGranularity: (pg: 'w' | 'm') => void;
  onChangeMetric: (m: MetricKey) => void;
  onChangeExercise: (ex: string) => void;
}

export function ProgressView({
  S,
  onChangeGranularity,
  onChangeMetric,
  onChangeExercise,
}: ProgressViewProps) {
  const [exSearch, setExSearch] = useState('');
  const metricBtnRefs = useRef<Partial<Record<MetricKey, HTMLButtonElement | null>>>({});
  const exerciseBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setExSearch('');
  }, [S.user]);

  const L = useMemo(
    () => S.sessions.filter((s) => s.sport === S.sport && s.user === S.user),
    [S.sessions, S.sport, S.user]
  );
  const g = S.pg;
  const n = g === 'w' ? 8 : 6;
  const B = useMemo(() => buckets(g, n), [g, n]);

  const exerciseStats = useMemo(() => {
    const map = new Map<string, { name: string; sessions: number; lastDate: string }>();
    L.forEach((s) => {
      const seenInSession = new Set<string>();
      s.exercises.forEach((e) => {
        const clean = String(e.name || '').trim();
        if (!clean) return;
        const key = nz(clean);
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { name: clean, sessions: 1, lastDate: s.date });
          seenInSession.add(key);
        } else {
          if (!seenInSession.has(key)) {
            existing.sessions += 1;
            seenInSession.add(key);
          }
          if (s.date > existing.lastDate) {
            existing.lastDate = s.date;
          }
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [L]);

  const names = useMemo(() => exerciseStats.map((x) => x.name), [exerciseStats]);
  const activeEx = useMemo(() => {
    if (S.pex && names.includes(S.pex)) return S.pex;
    const matchByLower = names.find((nm) => nz(nm) === nz(S.pex));
    return matchByLower || names[0] || '';
  }, [S.pex, names]);

  useEffect(() => {
    smoothScrollItemIntoView(metricBtnRefs.current[S.metric] ?? null);
  }, [S.metric]);

  useEffect(() => {
    if (activeEx) {
      smoothScrollItemIntoView(exerciseBtnRefs.current[activeEx] ?? null);
    }
  }, [activeEx]);

  const filteredExercises = useMemo(() => {
    const q = nz(exSearch);
    if (!q) return exerciseStats;
    return exerciseStats.filter((x) => nz(x.name).includes(q));
  }, [exerciseStats, exSearch]);

  const activeExMeta = useMemo(
    () => exerciseStats.find((x) => x.name === activeEx) || null,
    [exerciseStats, activeEx]
  );

  const T = (b: { a: string; b: string }, only?: string) => {
    const X = onRange(L, b.a, b.b);
    return {
      rpe: val(S, X, 'rpe', only),
      reps: val(S, X, 'reps', only),
      kg: val(S, X, 'kg', only),
      ton: val(S, X, 'ton', only),
      tmin: val(S, X, 'tmin', only),
      series: val(S, X, 'series', only),
    };
  };

  const renderKpis = (only?: string) => {
    const c = T(B[n - 1], only);
    const p = T(B[n - 2], only);
    const items = (
      [
        ['reps', 'Volumen', 'reps'],
        ['kg', 'Carga máx', 'kg'],
        ['ton', 'Tonelaje', 'kg'],
        ['tmin', 'Tiempo', 'min'],
        ['rpe', 'RPE', '/10'],
      ] as const
    ).filter(([k]) => c[k] || p[k]);

    if (!items.length) {
      return <span className="text-xs text-[var(--mut)] block pt-1">Sin datos aún en este período</span>;
    }

    return (
      <div
        data-no-swipe="true"
        className="flex gap-2.5 overflow-x-auto no-scrollbar touch-pan-x snap-x snap-mandatory -mx-1 px-1 pt-2 pb-1"
      >
        {items.map(([k, nm, u]) => {
          const cv = c[k];
          const pv = p[k];
          const hasDelta = cv > 0 || pv > 0;
          const isSelected = S.metric === k;
          return (
            <button
              key={k}
              type="button"
              onClick={(e) => {
                haptic('light');
                smoothScrollItemIntoView(e.currentTarget);
                onChangeMetric(k);
              }}
              className={`min-w-[130px] sm:min-w-[140px] shrink-0 snap-start rounded-xl p-3 text-left border transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-[var(--ac)]/16 border-[var(--ac2)]/55 shadow-sm shadow-[var(--ac)]/20'
                  : 'bg-[var(--surface-2)] border-[var(--line)]/60 hover:border-[var(--line-strong)]'
              }`}
            >
              <span className="block text-[11px] text-[var(--mut)] whitespace-nowrap">{nm}</span>
              <b className="block text-xl font-bold tabular-nums mt-0.5 whitespace-nowrap">
                {fmt(cv)} <small className="text-xs font-normal text-[var(--mut)]">{u}</small>
              </b>
              <div className="mt-0.5 whitespace-nowrap">
                {k === 'reps' && (
                  <span className="text-[11px] text-[var(--mut)]">{c.series} series · </span>
                )}
                {hasDelta && (
                  <span
                    className={`text-[11px] font-medium ${
                      cv >= pv ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
                    }`}
                  >
                    {cv >= pv ? '▲' : '▼'}{' '}
                    {pv ? `${Math.abs(((cv - pv) / pv) * 100).toFixed(0)}%` : 'nuevo'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const chartVals = (only?: string) =>
    B.map((b) => val(S, onRange(L, b.a, b.b), S.metric, only));
  const chartLabels = B.map((b) => b.l);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--line)]">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onChangeGranularity('w');
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              g === 'w' ? 'bg-[var(--ac)] text-white' : 'text-[var(--mut)]'
            }`}
          >
            Semanas
          </button>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onChangeGranularity('m');
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              g === 'm' ? 'bg-[var(--ac)] text-white' : 'text-[var(--mut)]'
            }`}
          >
            Meses
          </button>
        </div>
        <span className="text-xs text-[var(--mut)]">
          {g === 'w' ? 'vs semana anterior' : 'vs mes anterior'}
        </span>
      </div>

      {/* Horizontal swipeable metrics bar with auto-slide animation */}
      <div
        data-no-swipe="true"
        className="relative flex gap-2 overflow-x-auto no-scrollbar touch-pan-x snap-x snap-mandatory -mx-1 px-1 pb-1"
      >
        {(Object.entries(MET) as [MetricKey, string][]).map(([k, nm]) => {
          const active = S.metric === k;
          return (
            <button
              key={k}
              ref={(el) => {
                metricBtnRefs.current[k] = el;
              }}
              type="button"
              onClick={(e) => {
                haptic('light');
                smoothScrollItemIntoView(e.currentTarget);
                onChangeMetric(k);
              }}
              className={`relative snap-start px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                active
                  ? 'border-[var(--ac)] text-white'
                  : 'bg-[var(--surface)] border-[var(--line)] text-[var(--mut)] hover:text-[var(--tx)]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="progress-metric-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-[var(--ac)] shadow-sm shadow-[var(--ac)]/30 -z-0"
                />
              )}
              <span className="relative z-10">{nm}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* General Progress */}
        <div className="tf-card p-4 space-y-2.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <b className="text-base">Progreso general</b>
            <span className="text-[11px] font-semibold text-[var(--ac2)] whitespace-nowrap">
              {MET[S.metric]}
            </span>
          </div>
          <BarChart vals={chartVals()} labels={chartLabels} />
          <p className="text-xs text-[var(--mut)] leading-relaxed">{UN[S.metric]}</p>
          {renderKpis()}
        </div>

        {/* Ordered Exercise Progress */}
        <div className="tf-card p-4 space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="w-4 h-4 text-[var(--ac2)] shrink-0" />
              <b className="text-base truncate">Por ejercicio</b>
            </div>
            {names.length > 0 && (
              <span className="text-[11px] font-medium text-[var(--mut)] shrink-0 tabular-nums">
                {names.length} {names.length === 1 ? 'ejercicio' : 'ejercicios'}
              </span>
            )}
          </div>

          {names.length > 0 ? (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                {names.length > 5 && (
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-3.5 h-3.5 text-[var(--mut)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      className="tf-input w-full pl-8 pr-3 py-2 text-xs"
                      placeholder="Buscar ejercicio…"
                      value={exSearch}
                      onChange={(e) => setExSearch(e.target.value)}
                    />
                  </div>
                )}
                <select
                  className="tf-input flex-1 min-w-0 px-3 py-2 text-sm font-medium"
                  value={activeEx}
                  onChange={(e) => {
                    haptic('light');
                    onChangeExercise(e.target.value);
                  }}
                >
                  {names.map((nm) => (
                    <option key={nm} value={nm}>
                      {nm}
                    </option>
                  ))}
                </select>
              </div>

              {/* Horizontal swipeable exercise selector strip */}
              <div
                data-no-swipe="true"
                className="flex gap-2 overflow-x-auto no-scrollbar touch-pan-x snap-x snap-mandatory -mx-1 px-1 pb-0.5"
              >
                {filteredExercises.length ? (
                  filteredExercises.map((item) => {
                    const selected = item.name === activeEx;
                    return (
                      <button
                        key={item.name}
                        ref={(el) => {
                          exerciseBtnRefs.current[item.name] = el;
                        }}
                        type="button"
                        onClick={(e) => {
                          haptic('light');
                          smoothScrollItemIntoView(e.currentTarget);
                          onChangeExercise(item.name);
                        }}
                        className={`snap-start px-3 py-2 rounded-xl border text-left shrink-0 transition-colors cursor-pointer ${
                          selected
                            ? 'bg-[var(--ac)]/20 border-[var(--ac2)]/60 text-[var(--tx)]'
                            : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--mut)] hover:text-[var(--tx)]'
                        }`}
                      >
                        <span className="block text-xs font-semibold whitespace-nowrap">
                          {item.name}
                        </span>
                        <span className="block text-[10px] opacity-80 whitespace-nowrap tabular-nums">
                          {item.sessions} {item.sessions === 1 ? 'sesión' : 'sesiones'}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <span className="text-xs text-[var(--mut)] py-1">
                    Sin coincidencias para «{exSearch}»
                  </span>
                )}
              </div>

              {activeEx && (
                <div className="space-y-2 pt-1 border-t border-[var(--line)]/60">
                  <div className="flex items-baseline justify-between gap-2">
                    <b className="text-sm font-semibold text-[var(--tx)] truncate">{activeEx}</b>
                    {activeExMeta && (
                      <span className="text-[11px] text-[var(--mut)] shrink-0 tabular-nums">
                        {activeExMeta.sessions}{' '}
                        {activeExMeta.sessions === 1 ? 'sesión registrada' : 'sesiones registradas'}
                      </span>
                    )}
                  </div>
                  <BarChart vals={chartVals(activeEx)} labels={chartLabels} />
                  {renderKpis(activeEx)}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--mut)]">Aún no hay ejercicios registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
