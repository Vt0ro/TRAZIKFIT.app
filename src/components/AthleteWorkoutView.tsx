import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Plus,
  Timer,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  DEFAULT_SOUND_SETTINGS,
  haptic,
  playActionCue,
  playTimerStart,
  unlockAudio,
} from '../lib/audioHaptics';
import {
  axMes,
  bwFor,
  et,
  fdate,
  fm,
  fmt,
  newEx,
  nz,
  pRest,
  secs,
  smoothScrollItemIntoView,
  tmEl,
  tot,
} from '../lib/metrics';
import type {
  AppState,
  CircuitIntervalTarget,
  CircuitMeta,
  Exercise,
  RestTimerState,
  SetStopwatchState,
  SoundSettings,
  TrainingSession,
} from '../types/trazik';

interface AthleteWorkoutViewProps {
  session: TrainingSession | null;
  S: AppState;
  restTimer: RestTimerState | null;
  restLeft: number;
  stopwatch: SetStopwatchState | null;
  stopwatchFormatted: string;
  nowTick: number;
  sound: SoundSettings;
  onToggleSound: () => void;
  onClose: () => void;
  onGoToProfile: () => void;
  onUpdateSession: (updater: (s: TrainingSession) => TrainingSession) => void;
  onFinishSession: (s: TrainingSession) => void;
  onStartCircuitIntervals: (target: CircuitIntervalTarget) => void;
  onDuplicatePlus7: (s: TrainingSession) => void;
  onDeleteSession?: (id: string) => void;
  onTimerAction: (action: string) => void;
  onAutoTimer: (s: TrainingSession, exerciseIndex: number) => void;
  onToggleStopwatch: (s: TrainingSession, exIdx: number, setIdx: number) => void;
}

type WorkoutStep =
  | { kind: 'exercise'; key: string; index: number; ex: Exercise }
  | {
      kind: 'circuit';
      key: string;
      groupId: string;
      meta: CircuitMeta;
      items: { index: number; ex: Exercise }[];
    }
  | { kind: 'finish'; key: string };

function buildWorkoutSteps(exercises: Exercise[]): WorkoutStep[] {
  const steps: WorkoutStep[] = [];
  const seenGroups = new Set<string>();

  exercises.forEach((ex, index) => {
    const g = ex.circ?.g;
    if (g) {
      if (seenGroups.has(g)) return;
      seenGroups.add(g);
      const items = exercises
        .map((item, idx) => ({ ex: item, index: idx }))
        .filter((x) => x.ex.circ?.g === g);
      steps.push({
        kind: 'circuit',
        key: `circ:${g}`,
        groupId: g,
        meta: ex.circ!,
        items,
      });
    } else {
      steps.push({
        kind: 'exercise',
        key: `ex:${index}`,
        index,
        ex,
      });
    }
  });

  steps.push({ kind: 'finish', key: 'finish' });
  return steps;
}

const stepSlideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 44 : dir < 0 ? -44 : 0,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -36 : dir < 0 ? 36 : 0,
    opacity: 0,
  }),
};

export function AthleteWorkoutView({
  session,
  S,
  restTimer,
  restLeft,
  stopwatch,
  stopwatchFormatted,
  sound,
  onToggleSound,
  onClose,
  onGoToProfile,
  onUpdateSession,
  onFinishSession,
  onStartCircuitIntervals,
  onDuplicatePlus7,
  onDeleteSession,
  onTimerAction,
  onAutoTimer,
  onToggleStopwatch,
}: AthleteWorkoutViewProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [slideDir, setSlideDir] = useState(0);
  const [timerExpanded, setTimerExpanded] = useState(false);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stepBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    lock: 'h' | 'v' | null;
  } | null>(null);

  useEffect(() => {
    if (!session) return;
    const stepsNow = buildWorkoutSteps(session.exercises);
    const firstPending = stepsNow.findIndex((st) => {
      if (st.kind === 'exercise') {
        return st.ex.sets.length === 0 || st.ex.sets.some((x) => !x.done);
      }
      if (st.kind === 'circuit') {
        return st.items.some((it) => it.ex.sets.length === 0 || it.ex.sets.some((x) => !x.done));
      }
      return false;
    });
    setStepIdx(firstPending >= 0 ? firstPending : 0);
    setSlideDir(0);
    setTimerExpanded(false);
    setZoomedSrc(null);
    setConfirmDelete(false);
  }, [session?.id]);

  const steps = useMemo(
    () => (session ? buildWorkoutSteps(session.exercises) : []),
    [session?.exercises]
  );

  const safeIdx = Math.min(stepIdx, Math.max(0, steps.length - 1));

  useEffect(() => {
    if (safeIdx !== stepIdx) {
      setStepIdx(safeIdx);
    }
  }, [safeIdx, stepIdx]);

  useEffect(() => {
    smoothScrollItemIntoView(stepBtnRefs.current[safeIdx] ?? null);
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [safeIdx]);

  if (!session) return null;

  const s = session;
  const snd = sound || DEFAULT_SOUND_SETTINGS;
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

  const currentStep = steps[safeIdx];

  const goToStep = (target: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, target));
    if (clamped === safeIdx) return;
    haptic('light');
    setSlideDir(clamped > safeIdx ? 1 : -1);
    setStepIdx(clamped);
  };

  const isStepDone = (st: WorkoutStep): boolean => {
    if (st.kind === 'exercise') {
      return st.ex.sets.length > 0 && st.ex.sets.every((x) => x.done);
    }
    if (st.kind === 'circuit') {
      return st.items.every((it) => it.ex.sets.length > 0 && it.ex.sets.every((x) => x.done));
    }
    return allSets.length > 0 && doneCount === allSets.length;
  };

  const handleTouchStart = (ev: React.TouchEvent<HTMLDivElement>) => {
    if (ev.touches.length !== 1) return;
    const tgt = ev.target;
    if (
      tgt instanceof HTMLElement &&
      tgt.closest('input, textarea, select, button, a, [data-no-swipe="true"]')
    ) {
      swipeRef.current = null;
      return;
    }
    swipeRef.current = {
      startX: ev.touches[0].clientX,
      startY: ev.touches[0].clientY,
      lock: null,
    };
  };

  const handleTouchMove = (ev: React.TouchEvent<HTMLDivElement>) => {
    const g = swipeRef.current;
    if (!g || ev.touches.length !== 1) return;
    const dx = ev.touches[0].clientX - g.startX;
    const dy = ev.touches[0].clientY - g.startY;
    if (g.lock === null) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx) * 0.9) {
        g.lock = 'v';
      } else if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        g.lock = 'h';
      }
    }
  };

  const handleTouchEnd = (ev: React.TouchEvent<HTMLDivElement>) => {
    const g = swipeRef.current;
    swipeRef.current = null;
    if (!g || g.lock !== 'h') return;
    const dx = (ev.changedTouches[0]?.clientX ?? g.startX) - g.startX;
    if (dx < -54) goToStep(safeIdx + 1);
    else if (dx > 54) goToStep(safeIdx - 1);
  };

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

  const renderExerciseCard = (e: Exercise, i: number, insideCircuit = false) => {
    const exType = et(e);
    const u = e.u || (exType === 'res' ? 'min' : 'kg');
    const exDone = e.sets.length > 0 && e.sets.every((x) => x.done);
    const exAnnexes = S.annex.filter(
      (a) => nz(a.name) === nz(e.name) && a.m && a.m === smid
    );

    return (
      <div
        key={i}
        className={`tf-card p-4 space-y-3.5 ${
          insideCircuit ? 'border-[var(--ac2)]/30' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              haptic('success');
              const nextDone = !exDone;
              if (nextDone) playActionCue('complete');
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
            className={`tf-tap w-11 h-11 rounded-2xl border flex items-center justify-center text-lg font-bold shrink-0 cursor-pointer ${
              exDone
                ? 'bg-[var(--ac)] border-[var(--ac)] text-white shadow-md shadow-[var(--ac)]/40'
                : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--mut)]'
            }`}
          >
            ✓
          </button>

          <div className="flex-1 min-w-0">
            {insideCircuit && (
              <span className="inline-block text-[10.5px] font-bold uppercase tracking-wider text-[var(--ac2)] mb-0.5">
                Estación
              </span>
            )}
            <input
              type="text"
              className={`w-full bg-transparent font-extrabold text-[var(--tx)] focus:outline-none ${
                insideCircuit ? 'text-lg' : 'text-xl sm:text-2xl'
              }`}
              value={e.name}
              onChange={(ev) =>
                onUpdateSession((cur) => {
                  const exs = [...cur.exercises];
                  exs[i] = { ...exs[i], name: ev.target.value };
                  return { ...cur, exercises: exs };
                })
              }
            />
            {(e.tg || e.block || e.rest || e.link) && (
              <div className="text-xs text-[var(--mut)] mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {e.block && <span>{e.block}</span>}
                {e.tg && (
                  <span>
                    {e.block ? '· ' : ''}Objetivo <b className="text-[var(--tx)]">{e.tg}</b>
                  </span>
                )}
                {e.rest && <span>· desc {e.rest}</span>}
                {e.link && (
                  <a
                    href={e.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ac2)] font-semibold hover:underline"
                  >
                    · ▶ Ver video
                  </a>
                )}
              </div>
            )}
          </div>

          {S.role !== 'atleta' && (
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onUpdateSession((cur) => ({
                  ...cur,
                  exercises: cur.exercises.filter((_, idx) => idx !== i),
                }));
              }}
              aria-label="Eliminar ejercicio"
              title="Eliminar ejercicio"
              className="text-[var(--mut)] hover:text-[var(--danger)] p-1.5 shrink-0 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <input
          type="text"
          className="tf-input w-full px-3 py-2 text-xs"
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

        {exType !== 'res' && (
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
                <b>{fmt(bw)} kg de tu peso corporal + lastre</b>
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
          <div className="flex flex-wrap items-center gap-2">
            {exAnnexes.map((a) =>
              a.kind === 'img' ? (
                <img
                  key={a.id}
                  src={a.src}
                  alt={e.name}
                  onClick={() => setZoomedSrc(a.src)}
                  className="h-24 rounded-xl cursor-zoom-in border border-[var(--line)]"
                />
              ) : (
                <a
                  key={a.id}
                  href={a.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[var(--ac2)] hover:underline"
                >
                  ▶ Video anexo
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
              {exType !== 'res' && (
                <th className="py-1 font-medium">
                  {e.bw ? `Lastre (+${u})` : `Carga (${u})`}
                </th>
              )}
              <th className="py-1 font-medium">
                {e.mt === 'time' && exType !== 'res'
                  ? 'Tiempo (mm:ss)'
                  : exType === 'res'
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
                  <td className="py-1.5 text-center text-xs text-[var(--mut)] tabular-nums">
                    {j + 1}
                  </td>
                  {exType !== 'res' && (
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`w-full rounded-xl py-3 px-1 text-center text-base font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ac)] ${
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
                    {e.mt === 'time' && exType !== 'res' ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          placeholder="0:45"
                          className={`flex-1 min-w-0 rounded-xl py-3 px-1 text-center text-base font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ac)] ${
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
                          className={`w-12 rounded-xl border text-base flex items-center justify-center shrink-0 cursor-pointer ${
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
                        className={`w-full rounded-xl py-3 px-1 text-center text-base font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ac)] ${
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
                      className={`tf-tap w-11 h-11 rounded-xl border text-base font-bold inline-flex items-center justify-center cursor-pointer ${
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
          className="w-full min-h-[40px] rounded-xl border border-dashed border-[var(--line)] text-xs font-medium text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
        >
          + Serie
        </button>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modo entrenamiento"
      className="fixed inset-0 z-50 bg-[var(--bg)] flex flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      {/* Top Bar + Always-Visible Timer Header */}
      <header className="shrink-0 bg-[var(--bg)]/95 backdrop-blur-xl border-b border-[var(--line)]">
        <div className="max-w-3xl mx-auto px-4 pt-2.5 pb-2 space-y-2">
          {/* Session Title & Close */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onClose();
              }}
              aria-label="Salir de la sesión"
              className="tf-tap w-9 h-9 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--mut)] hover:text-[var(--tx)] shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-0 text-center">
              <b className="block text-sm font-bold truncate">{s.name || 'Entrenamiento'}</b>
              <span className="block text-[11px] text-[var(--mut)] tabular-nums">
                {fdate(s.date)} · {doneCount}/{allSets.length} series ({pct}%)
              </span>
            </div>

            <button
              type="button"
              onClick={() => goToStep(steps.length - 1)}
              className="tf-tap min-h-[34px] px-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shrink-0 cursor-pointer"
            >
              Finalizar
            </button>
          </div>

          {/* Always-Visible Sticky Session + Rest Timer Bar */}
          <div
            onClick={() => {
              haptic('light');
              setTimerExpanded((v) => !v);
            }}
            className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 cursor-pointer select-none ${
              restDone ? 'animate-rest-flash border-[var(--ac2)]' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 leading-tight">
                <small className="block text-[10px] uppercase tracking-wider text-[var(--mut)]">
                  Sesión
                </small>
                <b className="text-xl sm:text-2xl font-bold font-mono-num">{fm(elapsed)}</b>
              </div>

              <div className="flex-1 leading-tight">
                <small className="block text-[10px] uppercase tracking-wider text-[var(--mut)]">
                  Descanso{restPaused ? ' · pausa' : ''}
                </small>
                <b className="text-xl sm:text-2xl font-bold text-[var(--ac2)] font-mono-num">
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
                className={`tf-tap w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
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
                aria-label={running ? 'Pausar sesión' : 'Iniciar sesión'}
                className={`tf-tap w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                  running
                    ? 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--tx)]'
                    : 'tf-btn-pri'
                }`}
              >
                {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
            </div>

            <div className="h-1.5 rounded-full bg-[var(--surface-2)] mt-1.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#6b4590] to-[#a78bc4] transition-all duration-150"
                style={{ width: `${restPct}%` }}
              />
            </div>
          </div>

          {/* Expandable Rest & Session Timer Controls */}
          {timerExpanded && (
            <div className="tf-card p-3 space-y-2.5">
              <div className="grid grid-cols-4 gap-1.5">
                {[30, 60, 90, 120].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => onTimerAction(`r${sec}`)}
                    className="min-h-[38px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
                  >
                    {sec < 60 ? `${sec}s` : sec === 90 ? '90s' : `${sec / 60}m`}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => onTimerAction('-')}
                  className="min-h-[36px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
                >
                  −15s
                </button>
                <button
                  type="button"
                  onClick={() => onTimerAction('+')}
                  className="min-h-[36px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
                >
                  +15s
                </button>
                <button
                  type="button"
                  onClick={() => onTimerAction('rp')}
                  className={`min-h-[36px] rounded-xl text-xs font-semibold cursor-pointer ${
                    restPaused
                      ? 'tf-btn-pri'
                      : 'border border-[var(--line)] bg-[var(--surface-2)]'
                  }`}
                >
                  {restPaused ? '▶ Seguir' : '⏸ Pausa'}
                </button>
                <button
                  type="button"
                  onClick={() => onTimerAction('x')}
                  className="min-h-[36px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium text-[var(--mut)] cursor-pointer"
                >
                  Quitar
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--line)]/60">
                <span className="text-[11px] text-[var(--mut)]">Cronómetro sesión</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onTimerAction('sm')}
                    className="min-h-[32px] px-2.5 rounded-lg border border-[var(--line)] text-xs cursor-pointer"
                  >
                    −1m
                  </button>
                  <button
                    type="button"
                    onClick={() => onTimerAction('sp')}
                    className="min-h-[32px] px-2.5 rounded-lg border border-[var(--line)] text-xs cursor-pointer"
                  >
                    +1m
                  </button>
                  {!zero && (
                    <button
                      type="button"
                      onClick={() => onTimerAction('sz')}
                      className="min-h-[32px] px-2.5 rounded-lg border border-[var(--line)] text-xs text-[var(--mut)] cursor-pointer"
                    >
                      0:00
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Horizontal Scrollable Steps Indicator */}
          <div
            data-no-swipe="true"
            className="flex gap-1.5 overflow-x-auto no-scrollbar touch-pan-x snap-x pb-0.5"
          >
            {steps.map((st, idx) => {
              const active = idx === safeIdx;
              const done = isStepDone(st);
              const label =
                st.kind === 'circuit'
                  ? `Circuito (${st.items.length})`
                  : st.kind === 'finish'
                  ? 'Resumen'
                  : st.ex.name || `Ej. ${idx + 1}`;
              return (
                <button
                  key={st.key}
                  ref={(el) => {
                    stepBtnRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => goToStep(idx)}
                  className={`snap-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--ac)] border-[var(--ac)] text-white shadow-sm shadow-[var(--ac)]/30'
                      : done
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--mut)]'
                  }`}
                >
                  {done && !active && <Check className="w-3 h-3 shrink-0" />}
                  <span>
                    {st.kind === 'finish' ? label : `${idx + 1}. ${label}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Fullscreen Exercise / Circuit / Finish Stage */}
      <div
        ref={scrollBodyRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait" custom={slideDir} initial={false}>
            <motion.div
              key={currentStep?.key || 'empty'}
              custom={slideDir}
              variants={stepSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4 pb-6"
            >
              {currentStep?.kind === 'exercise' && (
                <>{renderExerciseCard(currentStep.ex, currentStep.index, false)}</>
              )}

              {currentStep?.kind === 'circuit' && (() => {
                const cMeta = currentStep.meta;
                const groupId = currentStep.groupId;
                const ivLinked = !!cMeta.iv;
                const workSec = cMeta.iw && cMeta.iw > 0 ? cMeta.iw : 40;
                const transSec = cMeta.it !== undefined ? cMeta.it : 10;
                const prepSec = cMeta.ip !== undefined ? cMeta.ip : 10;
                const circDone = isStepDone(currentStep);

                const patchCircuit = (patch: Partial<CircuitMeta>) => {
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
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-[var(--ac)]/35 bg-[var(--ac)]/12 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="inline-block text-[10.5px] font-bold uppercase tracking-wider text-[var(--ac2)]">
                            Circuito completo
                          </span>
                          <h3 className="text-base font-extrabold text-[var(--tx)]">
                            {currentStep.items.length} estaciones · {cMeta.r} rondas
                            {cMeta.rest ? ` · desc ${cMeta.rest}` : ''}
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            haptic('success');
                            const nextDone = !circDone;
                            if (nextDone) playActionCue('complete');
                            const idxSet = new Set(currentStep.items.map((x) => x.index));
                            onUpdateSession((cur) => ({
                              ...cur,
                              exercises: cur.exercises.map((ex, idx) =>
                                idxSet.has(idx)
                                  ? {
                                      ...ex,
                                      sets: ex.sets.map((st) => ({ ...st, done: nextDone })),
                                    }
                                  : ex
                              ),
                            }));
                          }}
                          className={`tf-tap min-h-[38px] px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                            circDone
                              ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                              : 'bg-[var(--surface)] border-[var(--line)] text-[var(--tx)]'
                          }`}
                        >
                          {circDone ? '✓ Circuito listo' : 'Marcar circuito'}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
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
                          className={`tf-tap min-h-[34px] px-3 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                            ivLinked
                              ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                              : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--mut)] hover:text-[var(--tx)]'
                          }`}
                        >
                          <Timer className="w-3.5 h-3.5" />
                          <span>
                            {ivLinked ? 'Vinculado a intervalos' : 'Vincular a intervalos'}
                          </span>
                        </button>

                        {ivLinked && (
                          <button
                            type="button"
                            onClick={() => {
                              unlockAudio();
                              haptic('medium');
                              onStartCircuitIntervals({
                                id: `ses:${s.id}:${groupId}`,
                                title: `${s.name || 'Sesión'} · ${
                                  currentStep.items[0]?.ex.block || 'Circuito'
                                }`,
                                rounds: Math.max(1, cMeta.r || 3),
                                roundRestSec: pRest(cMeta.rest),
                                workSec,
                                transSec,
                                prepSec,
                                sessionId: s.id,
                                groupId,
                                autoComplete: true,
                                exercises: currentStep.items.map(({ ex }) => ({
                                  name: ex.name,
                                  workSec:
                                    ex.mt === 'time' ? secs(ex.sets[0]?.b) || undefined : undefined,
                                })),
                              });
                            }}
                            className="tf-btn-pri min-h-[34px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Iniciar intervalos</span>
                          </button>
                        )}
                      </div>

                      {ivLinked && (
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--line)]/50">
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
                                patchCircuit({
                                  ip: Math.max(0, Math.min(120, parseInt(ev.target.value) || 0)),
                                })
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
                                patchCircuit({
                                  iw: Math.max(5, Math.min(3600, parseInt(ev.target.value) || 5)),
                                })
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
                                patchCircuit({
                                  it: Math.max(0, Math.min(300, parseInt(ev.target.value) || 0)),
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      {currentStep.items.map(({ ex, index }) =>
                        renderExerciseCard(ex, index, true)
                      )}
                    </div>
                  </div>
                );
              })()}

              {currentStep?.kind === 'finish' && (
                <div className="space-y-4">
                  <div className="tf-card p-4 space-y-2.5">
                    <b className="text-sm text-[var(--ac2)] block">Resumen del entrenamiento</b>
                    <div className="flex flex-wrap gap-4">
                      {elapsed > 0 && (
                        <div className="text-xs text-[var(--mut)]">
                          <b className="block text-lg text-[var(--tx)] tabular-nums">
                            {fm(elapsed)}
                          </b>
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
                    </div>
                  </div>

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
                            className={`min-h-[42px] flex-1 rounded-xl text-sm font-semibold border cursor-pointer ${
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
                      <div className="grid grid-cols-5 gap-1.5">
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
                            className={`min-h-[40px] rounded-xl text-xs font-semibold border cursor-pointer ${
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

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        const nextIdx = steps.length - 1;
                        onUpdateSession((cur) => ({
                          ...cur,
                          exercises: [...cur.exercises, newEx('fuerza')],
                        }));
                        setSlideDir(-1);
                        setStepIdx(nextIdx);
                      }}
                      className="flex-1 min-h-[44px] px-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Agregar ejercicio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        onDuplicatePlus7(s);
                      }}
                      className="flex-1 min-h-[44px] px-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
                    >
                      Repetir +7 días
                    </button>
                  </div>

                  {S.role !== 'atleta' && (
                    <div className="tf-card p-3.5 space-y-2.5">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--mut)]">
                        Ajustes de sesión
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          className="tf-input px-3 py-2 text-xs font-medium"
                          placeholder="Nombre de la sesión"
                          value={s.name || ''}
                          onChange={(ev) =>
                            onUpdateSession((cur) => ({ ...cur, name: ev.target.value }))
                          }
                        />
                        <input
                          type="date"
                          className="tf-input px-3 py-2 text-xs font-medium"
                          value={s.date}
                          onChange={(ev) =>
                            onUpdateSession((cur) => ({
                              ...cur,
                              date: ev.target.value || cur.date,
                            }))
                          }
                        />
                      </div>
                      {onDeleteSession &&
                        (confirmDelete ? (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                haptic('medium');
                                setConfirmDelete(false);
                                onDeleteSession(s.id);
                              }}
                              className="flex-1 min-h-[40px] px-3.5 rounded-xl bg-[var(--danger)] text-white text-xs font-semibold cursor-pointer"
                            >
                              ¿Confirmar eliminar sesión?
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(false)}
                              className="min-h-[40px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium cursor-pointer"
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
                            className="w-full min-h-[40px] px-4 rounded-xl bg-[var(--danger)]/15 text-[var(--danger)] text-xs font-semibold cursor-pointer"
                          >
                            Eliminar sesión
                          </button>
                        ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      unlockAudio();
                      haptic('success');
                      onFinishSession(s);
                    }}
                    className="tf-tap w-full min-h-[54px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/35 cursor-pointer transition-colors"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Finalizar entrenamiento</span>
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Step Footer */}
      <footer className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={safeIdx === 0}
            onClick={() => goToStep(safeIdx - 1)}
            className="tf-tap min-h-[46px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>

          <span className="text-xs font-semibold text-[var(--mut)] tabular-nums">
            {safeIdx + 1} / {steps.length}
          </span>

          {currentStep?.kind === 'finish' ? (
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                haptic('success');
                onFinishSession(s);
              }}
              className="tf-tap min-h-[46px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finalizar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToStep(safeIdx + 1)}
              className="tf-tap tf-btn-pri min-h-[46px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>{safeIdx === steps.length - 2 ? 'Resumen' : 'Siguiente'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>

      {zoomedSrc && (
        <div
          onClick={() => setZoomedSrc(null)}
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={zoomedSrc}
            alt="Vista ampliada"
            className="max-w-full max-h-full rounded-2xl"
          />
        </div>
      )}
    </div>
  );
}
