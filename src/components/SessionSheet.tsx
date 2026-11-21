import { useEffect, useState } from 'react';
import { CheckCircle2, Pause, Play, Timer, Volume2, VolumeX } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { BarChart } from './Charts';
import {
  DEFAULT_SOUND_SETTINGS,
  haptic,
  playActionCue,
  playTimerStart,
  unlockAudio,
} from '../lib/audioHaptics';
import {
  MET,
  UN,
  axMes,
  bwFor,
  et,
  fm,
  fmt,
  newEx,
  nz,
  pRest,
  secs,
  setM,
  smoothScrollItemIntoView,
  tmEl,
  tot,
} from '../lib/metrics';
import type {
  AppState,
  CircuitIntervalTarget,
  MetricKey,
  ResolvedOS,
  RestTimerState,
  SetStopwatchState,
  SoundSettings,
  TrainingSession,
} from '../types/trazik';

interface SessionSheetProps {
  session: TrainingSession | null;
  S: AppState;
  os: ResolvedOS;
  isProfileVisible: boolean;
  restTimer: RestTimerState | null;
  restLeft: number;
  stopwatch: SetStopwatchState | null;
  stopwatchFormatted: string;
  nowTick: number;
  sound: SoundSettings;
  onToggleSound: () => void;
  onClose: () => void;
  onGoToProfile: () => void;
  onChangeMetric: (m: MetricKey) => void;
  onUpdateSession: (updater: (s: TrainingSession) => TrainingSession) => void;
  onFinishSession: (s: TrainingSession) => void;
  onStartCircuitIntervals: (target: CircuitIntervalTarget) => void;
  onDuplicatePlus7: (s: TrainingSession) => void;
  onDeleteSession: (id: string) => void;
  onTimerAction: (action: string) => void;
  onAutoTimer: (s: TrainingSession, exerciseIndex: number) => void;
  onToggleStopwatch: (s: TrainingSession, exIdx: number, setIdx: number) => void;
}

export function SessionSheet({
  session,
  S,
  os,
  isProfileVisible,
  restTimer,
  restLeft,
  stopwatch,
  stopwatchFormatted,
  sound,
  onToggleSound,
  onClose,
  onGoToProfile,
  onChangeMetric,
  onUpdateSession,
  onFinishSession,
  onStartCircuitIntervals,
  onDuplicatePlus7,
  onDeleteSession,
  onTimerAction,
  onAutoTimer,
  onToggleStopwatch,
}: SessionSheetProps) {
  const [timerExpanded, setTimerExpanded] = useState(false);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    setZoomedSrc(null);
  }, [session?.id]);

  if (!session) return null;
  const snd = sound || DEFAULT_SOUND_SETTINGS;

  const s = session;
  const elapsed = tmEl(s);
  const running = !!(s.tm && s.tm.st);
  const zero = !s.tm || (!s.tm.st && !(s.tm.acc > 0));
  const restDone = !!(restTimer && restTimer.done);
  const restPaused = !!(restTimer && restTimer.paused);
  const restPct =
    restTimer && !restDone ? Math.max(0, (restLeft / Math.max(1, restTimer.tot)) * 100) : 0;

  const t = tot(S, s);
  const bw = bwFor(S, s);
  const smid = axMes(S, s);

  const allSets = s.exercises.flatMap((e) => e.sets);
  const doneCount = allSets.filter((x) => x.done).length;
  const pct = allSets.length ? Math.round((doneCount / allSets.length) * 100) : 0;

  const seriesMetric: MetricKey = S.metric === 'rpe' ? 'reps' : S.metric;
  const seriesVals: number[] = [];
  const seriesLabels: string[] = [];
  s.exercises.forEach((e, i) =>
    e.sets.forEach((x, j) => {
      const m = setM(e, x, bw);
      seriesVals.push(m[seriesMetric]);
      seriesLabels.push(`${i + 1}.${j + 1}`);
    })
  );

  const summaryItems = (
    [
      ['Series', t.series],
      ['Reps', t.reps],
      ['Carga máx (kg)', t.kg],
      ['Tonelaje (kg)', t.ton],
      t.tmin ? ['Tiempo', fm(t.tmin * 60)] : null,
      t.min ? ['min', t.min] : null,
      ['RPE', t.rpe],
    ] as ([string, number | string] | null)[]
  ).filter((x): x is [string, number | string] => x !== null);

  return (
    <BottomSheet open={!!session} onClose={onClose} os={os} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        {/* Sticky Session + Rest Timer Bar */}
        <div className="sticky -top-2 z-20 -mx-4 px-4 py-2.5 bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--line)]">
          <div
            onClick={() => {
              haptic('light');
              setTimerExpanded((v) => !v);
            }}
            className={`flex items-center gap-3 cursor-pointer select-none ${
              restDone ? 'animate-rest-flash rounded-xl px-1' : ''
            }`}
          >
            <div className="flex-1 leading-tight">
              <small className="block text-[10.5px] uppercase tracking-wider text-[var(--mut)]">
                Sesión
              </small>
              <b className="text-2xl font-bold font-mono-num">{fm(elapsed)}</b>
            </div>
            <div className="flex-1 leading-tight">
              <small className="block text-[10.5px] uppercase tracking-wider text-[var(--mut)]">
                Descanso{restPaused ? ' · pausa' : ''}
              </small>
              <b className="text-2xl sm:text-3xl font-bold text-[var(--ac2)] font-mono-num">
                {restTimer ? (restDone ? '¡Listo!' : fm(restLeft)) : '0:00'}
              </b>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                haptic('light');
                if (!snd.enabled) {
                  unlockAudio();
                  playTimerStart(true);
                }
                onToggleSound();
              }}
              aria-label={snd.enabled ? 'Silenciar sonidos' : 'Activar sonidos'}
              className={`tf-tap w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
                snd.enabled
                  ? 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ac2)]'
                  : 'border-[var(--line)] bg-[var(--surface)] text-[var(--mut)]'
              }`}
            >
              {snd.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                unlockAudio();
                haptic('light');
                onTimerAction(running ? 'pa' : 'go');
              }}
              aria-label={running ? 'Pausar' : 'Iniciar'}
              className={`tf-tap w-12 h-12 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                running
                  ? 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--tx)]'
                  : 'tf-btn-pri'
              }`}
            >
              {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-2)] mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#6b4590] to-[#a78bc4] transition-all duration-150"
              style={{ width: `${restPct}%` }}
            />
          </div>
        </div>

        {/* Expanded Timer Panel */}
        {timerExpanded && (
          <div className="tf-card p-4 text-center space-y-3">
            <small className="block text-xs tracking-wider text-[var(--mut)]">DESCANSO</small>
            <div className="font-display text-6xl font-extrabold text-[var(--ac2)] tabular-nums leading-none">
              {restTimer ? (restDone ? '¡Listo!' : fm(restLeft)) : '0:00'}
            </div>
            <div className="h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#6b4590] to-[#a78bc4] transition-all duration-150"
                style={{ width: `${restPct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onTimerAction('-')}
                className="min-h-[46px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
              >
                −15 s
              </button>
              <button
                type="button"
                onClick={() => onTimerAction('+')}
                className="min-h-[46px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
              >
                +15 s
              </button>
              <button
                type="button"
                onClick={() => onTimerAction('rp')}
                className={`min-h-[46px] rounded-xl text-sm font-semibold cursor-pointer ${
                  restPaused
                    ? 'tf-btn-pri'
                    : 'border border-[var(--line)] bg-[var(--surface-2)]'
                }`}
              >
                {restPaused ? '▶ Reanudar' : '⏸ Pausar'}
              </button>
              <button
                type="button"
                onClick={() => onTimerAction('rr')}
                className="min-h-[46px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
              >
                ↻ Reiniciar
              </button>
            </div>

            <button
              type="button"
              onClick={() => onTimerAction('x')}
              className="w-full min-h-[42px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/60 text-xs text-[var(--mut)] cursor-pointer"
            >
              {restDone ? 'Cerrar' : 'Volver a 0:00'}
            </button>

            <div className="grid grid-cols-5 gap-1.5">
              {[30, 60, 90, 120, 180].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onTimerAction('r' + sec)}
                  className="min-h-[42px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold tabular-nums cursor-pointer"
                >
                  {fm(sec)}
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-[var(--line)]/60 space-y-2">
              <small className="block text-xs tracking-wider text-[var(--mut)]">SESIÓN</small>
              <div className="font-display text-4xl font-bold tabular-nums">{fm(elapsed)}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onTimerAction('sm')}
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
                >
                  −1 min
                </button>
                <button
                  type="button"
                  onClick={() => onTimerAction('sp')}
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
                >
                  +1 min
                </button>
                <button
                  type="button"
                  onClick={() => onTimerAction(running ? 'pa' : 'go')}
                  className={`min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer ${
                    running
                      ? 'border border-[var(--line)] bg-[var(--surface-2)]'
                      : 'tf-btn-pri'
                  }`}
                >
                  {running ? '⏸ Pausar' : zero ? '▶ Iniciar' : '▶ Reanudar'}
                </button>
                <button
                  type="button"
                  onClick={() => onTimerAction('sr')}
                  className="min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
                >
                  ↻ Reiniciar
                </button>
              </div>
              <button
                type="button"
                onClick={() => onTimerAction('sz')}
                className="w-full min-h-[40px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/60 text-xs text-[var(--mut)] cursor-pointer"
              >
                Volver a 0:00
              </button>
            </div>
          </div>
        )}

        {/* Session Name & Date */}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            className="tf-input flex-[2] min-w-[160px] px-3 py-2.5 text-sm font-semibold"
            placeholder="Nombre de la sesión"
            value={s.name || ''}
            onChange={(e) =>
              onUpdateSession((cur) => ({ ...cur, name: e.target.value }))
            }
          />
          <input
            type="date"
            className="tf-input flex-1 min-w-[140px] px-3 py-2.5 text-sm"
            value={s.date}
            onChange={(e) =>
              onUpdateSession((cur) => ({ ...cur, date: e.target.value }))
            }
          />
        </div>

        {/* Completion Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                haptic('success');
                const v = !(allSets.length > 0 && doneCount === allSets.length);
                onUpdateSession((cur) => ({
                  ...cur,
                  exercises: cur.exercises.map((e) => ({
                    ...e,
                    sets: e.sets.map((st) => ({ ...st, done: v })),
                  })),
                }));
              }}
              className="min-h-[40px] px-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
            >
              {allSets.length > 0 && doneCount === allSets.length
                ? 'Desmarcar todo'
                : 'Marcar todo completado'}
            </button>
            <span className="text-xs text-[var(--mut)] tabular-nums">
              {doneCount}/{allSets.length} series
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#5b3a78] to-[#a78bc4] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Live Summary */}
        <div className="tf-card p-3.5 flex flex-wrap gap-4">
          {summaryItems.map(([label, val]) => (
            <div key={label} className="text-xs text-[var(--mut)]">
              <b className="block text-lg text-[var(--tx)] tabular-nums">
                {label === 'RPE'
                  ? Number(val).toFixed(1)
                  : typeof val === 'string'
                  ? val
                  : fmt(val)}
              </b>
              {label}
            </div>
          ))}
        </div>

        {/* Live Per-Series Chart */}
        <div className="tf-card p-3.5 space-y-2">
          <div data-no-swipe="true" className="flex gap-1.5 overflow-x-auto no-scrollbar touch-pan-x snap-x">
            {(Object.entries(MET) as [MetricKey, string][])
              .filter(([k]) => k !== 'rpe')
              .map(([k, nm]) => (
                <button
                  key={k}
                  type="button"
                  onClick={(e) => {
                    haptic('light');
                    smoothScrollItemIntoView(e.currentTarget);
                    onChangeMetric(k);
                  }}
                  className={`snap-start px-2.5 py-1 rounded-lg text-[11px] font-medium border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    S.metric === k
                      ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                      : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--mut)]'
                  }`}
                >
                  {nm}
                </button>
              ))}
          </div>
          <p className="text-[11px] text-[var(--mut)]">{UN[seriesMetric]} · por serie (en vivo)</p>
          {seriesVals.length > 0 ? (
            <BarChart vals={seriesVals} labels={seriesLabels} height={100} />
          ) : (
            <span className="text-xs text-[var(--mut)]">Agrega series</span>
          )}
        </div>

        {/* Exercises List */}
        <div className="space-y-4">
          {s.exercises.map((e, i) => {
            const prevEx = s.exercises[i - 1];
            const showCircHeader =
              e.circ && (!prevEx || !prevEx.circ || prevEx.circ.g !== e.circ.g);
            const t = et(e);
            const u = e.u || (t === 'res' ? 'min' : 'kg');
            const exDone = e.sets.length > 0 && e.sets.every((x) => x.done);
            const exAnnexes = S.annex.filter(
              (a) => nz(a.name) === nz(e.name) && a.m && a.m === smid
            );

            return (
              <div key={i} className="space-y-2">
                {showCircHeader && e.circ && (() => {
                  const cMeta = e.circ;
                  const groupId = cMeta.g;
                  const groupExs = s.exercises.filter((ex) => ex.circ?.g === groupId);
                  const ivLinked = !!cMeta.iv;
                  const workSec = cMeta.iw && cMeta.iw > 0 ? cMeta.iw : 40;
                  const transSec = cMeta.it !== undefined ? cMeta.it : 10;
                  const prepSec = cMeta.ip !== undefined ? cMeta.ip : 10;

                  const patchCircuit = (patch: Partial<typeof cMeta>) => {
                    onUpdateSession((cur) => ({
                      ...cur,
                      exercises: cur.exercises.map((ex) =>
                        ex.circ?.g === groupId
                          ? { ...ex, circ: { ...ex.circ, ...patch } }
                          : ex
                      ),
                    }));
                  };

                  return (
                    <div className="rounded-xl border border-[var(--ac)]/30 bg-[var(--ac)]/10 p-3 space-y-2.5 mt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-[var(--ac2)]">
                          Circuito · {groupExs.length} estaciones · {cMeta.r} rondas · desc entre rondas{' '}
                          {cMeta.rest || ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            haptic('light');
                            patchCircuit({
                              iv: !ivLinked,
                              ...(cMeta.iw === undefined ? { iw: 40 } : {}),
                              ...(cMeta.it === undefined ? { it: 10 } : {}),
                              ...(cMeta.ip === undefined ? { ip: 10 } : {}),
                            });
                          }}
                          className={`tf-tap min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                            ivLinked
                              ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                              : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--mut)] hover:text-[var(--tx)]'
                          }`}
                        >
                          <Timer className="w-3.5 h-3.5" />
                          <span>{ivLinked ? 'Vinculado a intervalos' : 'Vincular a intervalos'}</span>
                        </button>
                      </div>

                      {ivLinked && (
                        <div className="pt-2 border-t border-[var(--line)]/50 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <label className="text-[11px] text-[var(--mut)]">
                              Prep (s)
                              <input
                                type="number"
                                min={0}
                                max={120}
                                inputMode="numeric"
                                className="tf-input w-full mt-1 px-2 py-1.5 text-center text-xs font-semibold tabular-nums"
                                value={prepSec}
                                onChange={(ev) =>
                                  patchCircuit({ ip: Math.max(0, Math.min(120, parseInt(ev.target.value) || 0)) })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-[var(--mut)]">
                              Estación (s)
                              <input
                                type="number"
                                min={5}
                                max={3600}
                                inputMode="numeric"
                                className="tf-input w-full mt-1 px-2 py-1.5 text-center text-xs font-semibold tabular-nums"
                                value={workSec}
                                onChange={(ev) =>
                                  patchCircuit({ iw: Math.max(5, Math.min(3600, parseInt(ev.target.value) || 5)) })
                                }
                              />
                            </label>
                            <label className="text-[11px] text-[var(--mut)]">
                              Cambio (s)
                              <input
                                type="number"
                                min={0}
                                max={300}
                                inputMode="numeric"
                                className="tf-input w-full mt-1 px-2 py-1.5 text-center text-xs font-semibold tabular-nums"
                                value={transSec}
                                onChange={(ev) =>
                                  patchCircuit({ it: Math.max(0, Math.min(300, parseInt(ev.target.value) || 0)) })
                                }
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              unlockAudio();
                              haptic('medium');
                              onStartCircuitIntervals({
                                id: `ses:${s.id}:${groupId}`,
                                title: `${s.name || 'Sesión'} · ${e.block || 'Circuito'}`,
                                rounds: Math.max(1, cMeta.r || 3),
                                roundRestSec: pRest(cMeta.rest),
                                workSec,
                                transSec,
                                prepSec,
                                sessionId: s.id,
                                groupId,
                                autoComplete: true,
                                exercises: groupExs.map((ex) => ({
                                  name: ex.name,
                                  workSec: ex.mt === 'time' ? secs(ex.sets[0]?.b) || undefined : undefined,
                                })),
                              });
                            }}
                            className="tf-btn-pri w-full min-h-[38px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" /> Iniciar circuito en cronómetro de intervalos
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div
                  className={`tf-card p-3.5 space-y-2.5 ${
                    e.circ ? 'ring-1 ring-[var(--ac2)]/35' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptic('success');
                        const nextDone = !exDone;
                        onUpdateSession((cur) => {
                          const exs = [...cur.exercises];
                          exs[i] = {
                            ...exs[i],
                            sets: exs[i].sets.map((st) => ({ ...st, done: nextDone })),
                          };
                          return { ...cur, exercises: exs };
                        });
                      }}
                      title="Completar ejercicio"
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center text-base font-bold shrink-0 cursor-pointer ${
                        exDone
                          ? 'bg-[var(--ac)] border-[var(--ac)] text-white shadow-md shadow-[var(--ac)]/40'
                          : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--mut)]'
                      }`}
                    >
                      ✓
                    </button>
                    <input
                      type="text"
                      className="flex-1 min-w-0 bg-transparent text-base font-bold text-[var(--ac2)] focus:outline-none"
                      value={e.name}
                      onChange={(ev) =>
                        onUpdateSession((cur) => {
                          const exs = [...cur.exercises];
                          exs[i] = { ...exs[i], name: ev.target.value };
                          return { ...cur, exercises: exs };
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSession((cur) => ({
                          ...cur,
                          exercises: cur.exercises.filter((_, idx) => idx !== i),
                        }))
                      }
                      aria-label="Eliminar ejercicio"
                      className="p-2 text-[var(--danger)] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {(e.tg || e.obs || e.link) && (
                    <div className="text-xs text-[var(--mut)]" data-selectable="true">
                      {e.block ? `${e.block} · ` : ''}
                      Objetivo {e.tg || ''}
                      {e.rest ? ` · desc ${e.rest}` : ''}
                      {e.link && (
                        <>
                          {' '}
                          ·{' '}
                          <a
                            href={e.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--ac2)] hover:underline"
                          >
                            ▶ video
                          </a>
                        </>
                      )}
                    </div>
                  )}

                  <input
                    type="text"
                    className="tf-input w-full px-3 py-1.5 text-xs"
                    placeholder="Comentarios y observaciones del ejercicio"
                    value={e.obs || ''}
                    onChange={(ev) =>
                      onUpdateSession((cur) => {
                        const exs = [...cur.exercises];
                        exs[i] = { ...exs[i], obs: ev.target.value };
                        return { ...cur, exercises: exs };
                      })
                    }
                  />

                  {t !== 'res' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSession((cur) => {
                            const exs = [...cur.exercises];
                            exs[i] = { ...exs[i], mt: '' };
                            return { ...cur, exercises: exs };
                          })
                        }
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                          e.mt !== 'time'
                            ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                            : 'bg-[var(--surface-2)] border-[var(--line)]'
                        }`}
                      >
                        Repeticiones
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSession((cur) => {
                            const exs = [...cur.exercises];
                            exs[i] = { ...exs[i], mt: 'time' };
                            return { ...cur, exercises: exs };
                          })
                        }
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                          e.mt === 'time'
                            ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                            : 'bg-[var(--surface-2)] border-[var(--line)]'
                        }`}
                      >
                        Tiempo
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSession((cur) => {
                            const exs = [...cur.exercises];
                            exs[i] = { ...exs[i], bw: e.bw ? 0 : 1 };
                            return { ...cur, exercises: exs };
                          })
                        }
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                          e.bw
                            ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                            : 'bg-[var(--surface-2)] border-[var(--line)]'
                        }`}
                      >
                        {e.bw ? '✓ ' : ''}Usar mi peso corporal
                      </button>
                    </div>
                  )}

                  {!!e.bw && (
                    <div className="text-xs text-[var(--mut)] flex items-center gap-2 flex-wrap">
                      <span>
                        Base:{' '}
                        {bw ? (
                          isProfileVisible ? (
                            <b>{fmt(bw)} kg de tu peso corporal + lastre</b>
                          ) : (
                            'tu peso corporal registrado + lastre'
                          )
                        ) : (
                          <b className="text-[var(--danger)]">registra tu peso en Perfil</b>
                        )}
                      </span>
                      {!bw && (
                        <button
                          type="button"
                          onClick={onGoToProfile}
                          className="px-2.5 py-1 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-xs cursor-pointer"
                        >
                          Ir a Perfil
                        </button>
                      )}
                    </div>
                  )}

                  {exAnnexes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-[var(--mut)]">Anexo:</span>
                      {exAnnexes.map((a) =>
                        a.kind === 'img' ? (
                          <img
                            key={a.id}
                            src={a.src}
                            alt={e.name}
                            onClick={() => setZoomedSrc(a.src)}
                            className="h-20 rounded-lg cursor-zoom-in border border-[var(--line)]"
                          />
                        ) : (
                          <a
                            key={a.id}
                            href={a.src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--ac2)] hover:underline"
                          >
                            ▶ Video
                          </a>
                        )
                      )}
                    </div>
                  )}

                  {/* Sets Table */}
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-[11px] text-[var(--mut)]">
                        <th className="py-1 font-medium w-8">#</th>
                        {t !== 'res' && (
                          <th className="py-1 font-medium">
                            {e.bw ? `Lastre (+${u})` : `Carga (${u})`}
                          </th>
                        )}
                        <th className="py-1 font-medium">
                          {e.mt === 'time' && t !== 'res'
                            ? 'Tiempo (mm:ss)'
                            : t === 'res'
                            ? `Tiempo (${u})`
                            : 'Reps'}
                        </th>
                        <th className="w-12"></th>
                        <th className="w-9"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.sets.map((st, j) => {
                        const isSwOn =
                          stopwatch &&
                          stopwatch.sid === s.id &&
                          stopwatch.i === i &&
                          stopwatch.j === j;
                        return (
                          <tr key={j}>
                            <td className="py-1 text-center text-xs text-[var(--mut)] tabular-nums">
                              {j + 1}
                            </td>
                            {t !== 'res' && (
                              <td className="p-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className={`w-full rounded-lg py-2.5 px-1 text-center text-base font-medium tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ac)] ${
                                    st.done ? 'bg-[var(--ac)]/25' : 'bg-[var(--surface-2)]'
                                  }`}
                                  value={st.a ?? ''}
                                  onChange={(ev) =>
                                    onUpdateSession((cur) => {
                                      const exs = [...cur.exercises];
                                      const sets = [...exs[i].sets];
                                      sets[j] = { ...sets[j], a: ev.target.value };
                                      exs[i] = { ...exs[i], sets };
                                      return { ...cur, exercises: exs };
                                    })
                                  }
                                />
                              </td>
                            )}
                            <td className="p-1">
                              {e.mt === 'time' && t !== 'res' ? (
                                <div className="flex gap-1">
                                  <input
                                    type="text"
                                    placeholder="0:45"
                                    className={`flex-1 min-w-0 rounded-lg py-2.5 px-1 text-center text-base font-medium tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ac)] ${
                                      st.done ? 'bg-[var(--ac)]/25' : 'bg-[var(--surface-2)]'
                                    }`}
                                    value={isSwOn ? stopwatchFormatted : String(st.b ?? '')}
                                    onChange={(ev) =>
                                      onUpdateSession((cur) => {
                                        const exs = [...cur.exercises];
                                        const sets = [...exs[i].sets];
                                        sets[j] = { ...sets[j], b: ev.target.value };
                                        exs[i] = { ...exs[i], sets };
                                        return { ...cur, exercises: exs };
                                      })
                                    }
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      haptic('light');
                                      onToggleStopwatch(s, i, j);
                                    }}
                                    aria-label="Cronómetro"
                                    className={`w-11 rounded-lg border text-base flex items-center justify-center shrink-0 cursor-pointer ${
                                      isSwOn
                                        ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                                        : 'border-[var(--line)] bg-[var(--surface-2)]'
                                    }`}
                                  >
                                    {isSwOn ? '■' : '⏱'}
                                  </button>
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className={`w-full rounded-lg py-2.5 px-1 text-center text-base font-medium tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ac)] ${
                                    st.done ? 'bg-[var(--ac)]/25' : 'bg-[var(--surface-2)]'
                                  }`}
                                  value={st.b ?? ''}
                                  onChange={(ev) =>
                                    onUpdateSession((cur) => {
                                      const exs = [...cur.exercises];
                                      const sets = [...exs[i].sets];
                                      sets[j] = { ...sets[j], b: ev.target.value };
                                      exs[i] = { ...exs[i], sets };
                                      return { ...cur, exercises: exs };
                                    })
                                  }
                                />
                              )}
                            </td>
                            <td className="p-1 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  haptic('success');
                                  const nextDone = !st.done;
                                  if (nextDone) playActionCue('complete');
                                  onUpdateSession((cur) => {
                                    const exs = [...cur.exercises];
                                    const sets = [...exs[i].sets];
                                    sets[j] = { ...sets[j], done: nextDone };
                                    exs[i] = { ...exs[i], sets };
                                    return { ...cur, exercises: exs };
                                  });
                                  if (nextDone) {
                                    onAutoTimer(s, i);
                                  }
                                }}
                                className={`tf-tap w-10 h-10 rounded-xl border text-base font-bold inline-flex items-center justify-center cursor-pointer ${
                                  st.done
                                    ? 'bg-[var(--ac)] border-[var(--ac)] text-white shadow-sm shadow-[var(--ac)]/50 animate-check-pop'
                                    : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--mut)]'
                                }`}
                              >
                                ✓
                              </button>
                            </td>
                            <td className="p-1 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSession((cur) => {
                                    const exs = [...cur.exercises];
                                    exs[i] = {
                                      ...exs[i],
                                      sets: exs[i].sets.filter((_, idx) => idx !== j),
                                    };
                                    return { ...cur, exercises: exs };
                                  })
                                }
                                className="text-[var(--danger)] p-1.5 cursor-pointer"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onUpdateSession((cur) => {
                        const exs = [...cur.exercises];
                        exs[i] = {
                          ...exs[i],
                          sets: [...exs[i].sets, { a: '', b: '', rpe: '', done: false }],
                        };
                        return { ...cur, exercises: exs };
                      });
                    }}
                    className="w-full min-h-[38px] rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
                  >
                    + Serie
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Training Summary */}
        <div className="tf-card p-4 space-y-2">
          <b className="text-sm text-[var(--ac2)] block">Resumen del entrenamiento</b>
          <div className="flex flex-wrap gap-4">
            {elapsed > 0 && (
              <div className="text-xs text-[var(--mut)]">
                <b className="block text-lg text-[var(--tx)] tabular-nums">{fm(elapsed)}</b>
                Duración
              </div>
            )}
            {summaryItems.map(([label, val]) => (
              <div key={label} className="text-xs text-[var(--mut)]">
                <b className="block text-lg text-[var(--tx)] tabular-nums">
                  {label === 'RPE'
                    ? Number(val).toFixed(1)
                    : typeof val === 'string'
                    ? val
                    : fmt(val)}
                </b>
                {label}
              </div>
            ))}
            {s.exercises.some((e) => e.bw) && (
              <div className="text-xs text-[var(--mut)]">
                <b className="block text-lg text-[var(--tx)] tabular-nums">
                  {bw ? (isProfileVisible ? `${fmt(bw)} kg` : 'registrado') : '—'}
                </b>
                Peso corporal usado
              </div>
            )}
          </div>
        </div>

        {/* Final Comments, Mood & RPE */}
        <div className="tf-card p-4 space-y-3">
          <b className="text-sm text-[var(--ac2)] block">Comentarios finales</b>
          <div>
            <span className="block text-xs text-[var(--mut)] mb-1.5">
              Ánimo (1 bajo · 5 alto)
            </span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    haptic('light');
                    onUpdateSession((cur) => ({
                      ...cur,
                      feel: cur.feel === n ? 0 : n,
                    }));
                  }}
                  className={`min-h-[40px] min-w-[44px] rounded-xl text-sm font-semibold border cursor-pointer ${
                    s.feel === n
                      ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                      : 'bg-[var(--surface-2)] border-[var(--line)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs text-[var(--mut)] mb-1.5">
              RPE de la sesión · escala de Borg (1 = muy suave · 10 = máximo)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    haptic('light');
                    onUpdateSession((cur) => ({
                      ...cur,
                      rpe: Number(cur.rpe) === n ? 0 : n,
                    }));
                  }}
                  className={`min-h-[38px] min-w-[38px] px-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    Number(s.rpe) === n
                      ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                      : 'bg-[var(--surface-2)] border-[var(--line)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <textarea
            rows={3}
            className="tf-input w-full p-3 text-sm"
            placeholder="¿Cómo te sentiste? Molestias, cargas a subir, ajustes para la próxima sesión…"
            value={s.notes || ''}
            onChange={(e) =>
              onUpdateSession((cur) => ({ ...cur, notes: e.target.value }))
            }
          />
        </div>

        {/* Footer Actions */}
        <div className="space-y-2.5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onUpdateSession((cur) => ({
                  ...cur,
                  exercises: [...cur.exercises, newEx('fuerza')],
                }));
              }}
              className="tf-btn-pri flex-1 sm:flex-none px-5 min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer"
            >
              + Ejercicio
            </button>

            <button
              type="button"
              onClick={() => {
                haptic('light');
                onDuplicatePlus7(s);
              }}
              className="min-h-[44px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
            >
              Repetir +7 días
            </button>
            {S.role !== 'atleta' &&
              (confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      haptic('medium');
                      setConfirmDelete(false);
                      onDeleteSession(s.id);
                    }}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[var(--danger)] text-white text-xs font-semibold cursor-pointer"
                  >
                    ¿Eliminar? Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[44px] px-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    setConfirmDelete(true);
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--danger)]/15 text-[var(--danger)] text-xs font-semibold cursor-pointer"
                >
                  Eliminar
                </button>
              ))}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto min-h-[44px] px-5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
            >
              Listo
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              unlockAudio();
              haptic('success');
              onFinishSession(s);
            }}
            className="tf-tap w-full min-h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/35 cursor-pointer transition-colors"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Finalizar entrenamiento</span>
          </button>
        </div>
      </div>

      {zoomedSrc && (
        <div
          onClick={() => setZoomedSrc(null)}
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={zoomedSrc} alt="Vista ampliada" className="max-w-full max-h-full rounded-2xl" />
        </div>
      )}
    </BottomSheet>
  );
}
