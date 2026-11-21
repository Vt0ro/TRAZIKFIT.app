import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Link2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  DEFAULT_SOUND_SETTINGS,
  haptic,
  playTimerStart,
  unlockAudio,
} from '../lib/audioHaptics';
import { buildCircuitIntervalPlan, fm } from '../lib/metrics';
import type {
  ActiveIntervalRunner,
  CircuitIntervalTarget,
  IntervalMode,
  IntervalPhase,
  SoundPreset,
  SoundSettings,
} from '../types/trazik';

export const IVN: Record<IntervalMode, string> = {
  tabata: 'Tabata',
  hiit: 'HIIT',
  emom: 'EMOM',
  custom: 'Libre',
};

const IVD: Record<IntervalMode, string> = {
  tabata: 'Clásico: 20 s de trabajo y 10 s de descanso, 8 rondas.',
  hiit: 'Alta intensidad con trabajo y descanso ajustables.',
  emom: 'Cada minuto en el minuto: una ronda nueva al comenzar cada intervalo.',
  custom: 'Configura tus propios ciclos de trabajo y descanso.',
};

export const IVDEF: Record<IntervalMode, Record<string, number>> = {
  tabata: { prep: 10, work: 20, rest: 10, rounds: 8 },
  hiit: { prep: 10, work: 40, rest: 20, rounds: 10 },
  emom: { prep: 10, ei: 60, ew: 0, rounds: 10 },
  custom: { prep: 5, work: 30, rest: 15, rounds: 6 },
};

const PRESET_LABELS: Record<SoundPreset, string> = {
  athletic: 'Atlético',
  chime: 'Campana',
  pulse: 'Pulso',
};

export const ivClamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v || 0)));

export function buildIntervalPlan(
  mode: IntervalMode,
  cfg: Record<string, number>
): IntervalPhase[] {
  const P: IntervalPhase[] = [];
  const prep = ivClamp(cfg.prep, 0, 120);
  const R = ivClamp(cfg.rounds, 1, 200);
  if (prep > 0) P.push({ k: 'prep', d: prep, r: 0 });
  if (mode === 'emom') {
    const L = ivClamp(cfg.ei, 5, 3600);
    const W = ivClamp(cfg.ew, 0, L);
    for (let r = 1; r <= R; r++) {
      if (W > 0 && W < L) {
        P.push({ k: 'work', d: W, r });
        P.push({ k: 'rest', d: L - W, r });
      } else {
        P.push({ k: 'work', d: L, r });
      }
    }
  } else {
    const w = ivClamp(cfg.work, 1, 3600);
    const rs = ivClamp(cfg.rest, 0, 3600);
    for (let r = 1; r <= R; r++) {
      P.push({ k: 'work', d: w, r });
      if (rs > 0 && r < R) P.push({ k: 'rest', d: rs, r });
    }
  }
  return P;
}

interface IntervalsViewProps {
  mode: IntervalMode;
  cfg: Record<string, number>;
  runner: ActiveIntervalRunner | null;
  elapsed: number;
  flash: boolean;
  sound: SoundSettings;
  circuitTargets: CircuitIntervalTarget[];
  onUpdateSound: (patch: Partial<SoundSettings>) => void;
  onChangeMode: (m: IntervalMode) => void;
  onUpdateField: (key: string, val: number) => void;
  onStart: () => void;
  onStartCircuit: (target: CircuitIntervalTarget) => void;
  onAction: (action: 'p' | 'r' | 'n' | 'b' | 'c' | 'x') => void;
}

export function IntervalsView({
  mode,
  cfg,
  runner,
  elapsed,
  flash,
  sound,
  circuitTargets,
  onUpdateSound,
  onChangeMode,
  onUpdateField,
  onStart,
  onStartCircuit,
  onAction,
}: IntervalsViewProps) {
  const snd = sound || DEFAULT_SOUND_SETTINGS;
  const [linkCircuitEnabled, setLinkCircuitEnabled] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [circPrep, setCircPrep] = useState(10);
  const [circWork, setCircWork] = useState(40);
  const [circTrans, setCircTrans] = useState(10);
  const [circAutoComplete, setCircAutoComplete] = useState(true);

  const selectedTarget = useMemo(() => {
    if (!circuitTargets.length) return null;
    return circuitTargets.find((t) => t.id === selectedTargetId) || circuitTargets[0];
  }, [circuitTargets, selectedTargetId]);

  useEffect(() => {
    if (!selectedTarget) return;
    setSelectedTargetId(selectedTarget.id);
    setCircPrep(selectedTarget.prepSec);
    setCircWork(selectedTarget.workSec);
    setCircTrans(selectedTarget.transSec);
    setCircAutoComplete(selectedTarget.autoComplete !== false);
  }, [selectedTarget?.id]);

  const soundToggleBtn = (
    <button
      type="button"
      onClick={() => {
        haptic('light');
        const nextEnabled = !snd.enabled;
        onUpdateSound({ enabled: nextEnabled });
        if (nextEnabled) {
          unlockAudio();
          playTimerStart(true);
        }
      }}
      aria-label={snd.enabled ? 'Silenciar sonidos' : 'Activar sonidos'}
      className={`tf-tap min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
        snd.enabled
          ? 'border-[var(--ac2)]/40 bg-[var(--ac)]/15 text-[var(--ac2)]'
          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--mut)]'
      }`}
    >
      {snd.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      <span>{snd.enabled ? 'Sonido activado' : 'Silenciado'}</span>
    </button>
  );

  if (runner && runner.mode === 'run') {
    const P = runner.plan;
    const done = runner.done || elapsed >= runner.total;
    let idx = P.length - 1;
    if (!done) {
      for (let i = 0; i < P.length; i++) {
        if (elapsed < runner.cum[i + 1]) {
          idx = i;
          break;
        }
      }
    }
    const ph = P[idx];
    const rem = done ? 0 : runner.cum[idx + 1] - elapsed;
    const rounds = runner.circuit ? runner.circuit.rounds : ivClamp(cfg.rounds, 1, 200);
    const nx = P[idx + 1];
    const label = { prep: 'PREPÁRATE', work: 'TRABAJO', rest: 'DESCANSO' }[ph.k];
    const phaseBg = done
      ? 'from-emerald-500 to-emerald-800'
      : ph.k === 'prep'
      ? 'from-[#321C6A] to-[#0A051A]'
      : ph.k === 'work'
      ? 'from-[#A259FF] to-[#6D28D9]'
      : 'from-[#0ea5e9] to-[#2563eb]';

    const phasePct = done ? 100 : Math.min(100, ((elapsed - runner.cum[idx]) / ph.d) * 100);
    const radius = 92;
    const circ = 2 * Math.PI * radius;
    const strokeOffset = circ * (1 - phasePct / 100);

    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight truncate">
            {runner.circuit ? runner.circuit.title : `Intervalos · ${IVN[runner.m]}`}
          </h2>
          {soundToggleBtn}
        </div>

        <motion.div
          key={`${ph.k}-${done ? 'done' : 'live'}`}
          initial={{ scale: 0.985, opacity: 0.92 }}
          animate={{ scale: flash ? 1.015 : 1, opacity: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={`rounded-[28px] p-6 sm:p-8 text-center text-white bg-gradient-to-br ${phaseBg} shadow-2xl border border-white/15 transition-all ${
            flash ? 'brightness-125 saturate-125' : ''
          }`}
        >
          <div className="text-xs font-extrabold tracking-[0.22em] opacity-95">
            {done ? '¡TERMINADO!' : label}
          </div>

          {!done && ph.label && (
            <div className="mt-2 space-y-0.5">
              <div className="text-lg sm:text-xl font-bold tracking-tight leading-snug">
                {ph.label}
              </div>
              {ph.station && (
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-85">
                  {ph.station}
                </div>
              )}
            </div>
          )}

          <div className="relative w-52 h-52 mx-auto my-3 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 210 210">
              <circle
                cx="105"
                cy="105"
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="8"
              />
              <circle
                cx="105"
                cy="105"
                r={radius}
                fill="none"
                stroke="#ffffff"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={strokeOffset}
                style={{ transition: 'stroke-dashoffset 0.14s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-display text-6xl sm:text-7xl font-extrabold tracking-tight tabular-nums leading-none">
                {done ? fm(runner.total) : fm(Math.ceil(rem))}
              </div>
              <div className="text-sm font-semibold opacity-95 mt-2">
                {done
                  ? 'Tiempo total'
                  : ph.k === 'prep'
                  ? 'Comienza en breve'
                  : `Ronda ${ph.r} / ${rounds}`}
              </div>
            </div>
          </div>

          <div className="mt-1 text-xs font-medium opacity-90 min-h-[18px]">
            {done
              ? runner.circuit
                ? 'Circuito completado ✓'
                : 'Entrenamiento completado'
              : nx
              ? `Siguiente: ${nx.label || (nx.k === 'work' ? 'Trabajo' : 'Descanso')} · ${fm(nx.d)}`
              : 'Última fase'}
          </div>
        </motion.div>

        <div className="tf-card p-4 grid grid-cols-2 text-center divide-x divide-[var(--line)]/60">
          <div>
            <span className="block text-[11px] text-[var(--mut)] tracking-wider">TRANSCURRIDO</span>
            <b className="text-2xl font-bold tabular-nums">{fm(Math.min(elapsed, runner.total))}</b>
          </div>
          <div>
            <span className="block text-[11px] text-[var(--mut)] tracking-wider">RESTANTE</span>
            <b className="text-2xl font-bold tabular-nums">{fm(Math.max(0, runner.total - elapsed))}</b>
          </div>
        </div>

        {done ? (
          <button
            type="button"
            onClick={() => {
              haptic('medium');
              onAction('x');
            }}
            className="tf-btn-pri w-full min-h-[60px] rounded-2xl text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" /> Repetir
          </button>
        ) : (
          <div className="grid grid-cols-[1fr_1.6fr_1fr] gap-2.5">
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onAction('b');
              }}
              aria-label="Fase anterior"
              className="tf-tap min-h-[64px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center cursor-pointer"
            >
              <SkipBack className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                haptic('medium');
                onAction('p');
              }}
              aria-label="Pausar o reanudar"
              className="tf-btn-pri min-h-[64px] rounded-2xl flex items-center justify-center cursor-pointer"
            >
              {runner.running ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
            </button>
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onAction('n');
              }}
              aria-label="Saltar fase"
              className="tf-tap min-h-[64px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center cursor-pointer"
            >
              <SkipForward className="w-6 h-6" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onAction('r');
            }}
            className="tf-tap min-h-[48px] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-sm text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
          >
            ↻ Reiniciar (volver a 0:00)
          </button>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onAction('c');
            }}
            className="tf-tap min-h-[48px] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-sm text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
          >
            Cambiar configuración
          </button>
        </div>
      </div>
    );
  }

  const effectiveTarget: CircuitIntervalTarget | null =
    linkCircuitEnabled && selectedTarget
      ? {
          ...selectedTarget,
          prepSec: circPrep,
          workSec: circWork,
          transSec: circTrans,
          autoComplete: circAutoComplete,
        }
      : null;

  const plan = effectiveTarget
    ? buildCircuitIntervalPlan(effectiveTarget)
    : buildIntervalPlan(mode, cfg);
  const totalSec = plan.reduce((a, p) => a + p.d, 0);
  const totalRounds = effectiveTarget
    ? effectiveTarget.rounds
    : ivClamp(cfg.rounds, 1, 200);

  const fields =
    mode === 'emom'
      ? [
          ['prep', 'Preparación', 'segundos', 0, 120],
          ['ei', 'Cada', 'segundos por ronda', 5, 3600],
          ['rounds', 'Rondas', 'minutos / rondas', 1, 200],
          ['ew', 'Trabajo', 'segundos dentro de la ronda (0 = todo)', 0, 3600],
        ]
      : [
          ['prep', 'Preparación', 'segundos', 0, 120],
          ['work', 'Trabajo', 'segundos', 1, 3600],
          ['rest', 'Descanso', 'segundos', 0, 3600],
          ['rounds', 'Rondas', 'ciclos', 1, 200],
        ];

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold tracking-tight">Intervalos</h2>
        {soundToggleBtn}
      </div>

      {/* Optional Circuit Linking Card */}
      {circuitTargets.length > 0 && (
        <div className="tf-card p-3.5 space-y-3 border-[var(--ac)]/25">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Link2 className="w-4 h-4 text-[var(--ac2)] shrink-0" />
                <span>Vincular con circuito (opcional)</span>
              </div>
              <p className="text-xs text-[var(--mut)] mt-0.5">
                Sincroniza estaciones, rondas y descansos de un circuito planificado.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={linkCircuitEnabled}
              onClick={() => {
                haptic('light');
                setLinkCircuitEnabled((v) => !v);
              }}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold border shrink-0 cursor-pointer ${
                linkCircuitEnabled
                  ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                  : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--mut)]'
              }`}
            >
              {linkCircuitEnabled ? 'Activado' : 'Usar'}
            </button>
          </div>

          {linkCircuitEnabled && selectedTarget && (
            <div className="pt-2 border-t border-[var(--line)]/60 space-y-3">
              <div>
                <label className="block text-[11px] text-[var(--mut)] mb-1">
                  Selecciona el circuito
                </label>
                <select
                  className="tf-input w-full px-3 py-2 text-xs font-medium"
                  value={selectedTarget.id}
                  onChange={(e) => {
                    const next = circuitTargets.find((t) => t.id === e.target.value);
                    if (next) {
                      setSelectedTargetId(next.id);
                      setCircPrep(next.prepSec);
                      setCircWork(next.workSec);
                      setCircTrans(next.transSec);
                      setCircAutoComplete(next.autoComplete !== false);
                    }
                  }}
                >
                  {circuitTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.subtitle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="text-[11px] text-[var(--mut)]">
                  Prep (s)
                  <input
                    type="number"
                    min={0}
                    max={120}
                    inputMode="numeric"
                    className="tf-input w-full mt-1 px-2 py-1.5 text-center text-sm font-bold tabular-nums"
                    value={circPrep}
                    onChange={(e) =>
                      setCircPrep(ivClamp(parseInt(e.target.value) || 0, 0, 120))
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
                    className="tf-input w-full mt-1 px-2 py-1.5 text-center text-sm font-bold tabular-nums"
                    value={circWork}
                    onChange={(e) =>
                      setCircWork(ivClamp(parseInt(e.target.value) || 5, 5, 3600))
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
                    className="tf-input w-full mt-1 px-2 py-1.5 text-center text-sm font-bold tabular-nums"
                    value={circTrans}
                    onChange={(e) =>
                      setCircTrans(ivClamp(parseInt(e.target.value) || 0, 0, 300))
                    }
                  />
                </label>
              </div>

              <div className="rounded-xl bg-[var(--surface-2)]/70 p-2.5 space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--ac2)]">
                  Estaciones ({selectedTarget.exercises.length}) · {selectedTarget.rounds} rondas ·
                  descanso entre rondas {fm(selectedTarget.roundRestSec)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTarget.exercises.map((ex, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line)]"
                    >
                      {idx + 1}. {ex.name}{' '}
                      <span className="text-[var(--mut)] tabular-nums">
                        ({ex.workSec || circWork}s)
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {selectedTarget.sessionId && (
                <button
                  type="button"
                  onClick={() => setCircAutoComplete((v) => !v)}
                  className="flex items-center gap-2 text-xs text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
                >
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      circAutoComplete ? 'text-emerald-400' : 'text-[var(--mut)]'
                    }`}
                  />
                  <span>Al finalizar el circuito, marcar sus ejercicios como completados</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!effectiveTarget && (
        <>
          <div className="grid grid-cols-4 gap-2 p-1 rounded-2xl bg-[var(--surface)] border border-[var(--line)]">
            {(Object.keys(IVN) as IntervalMode[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  haptic('light');
                  onChangeMode(k);
                }}
                className={`tf-tap min-h-[42px] rounded-xl text-sm font-semibold cursor-pointer ${
                  mode === k
                    ? 'bg-[var(--ac)] text-white shadow-sm'
                    : 'text-[var(--mut)] hover:text-[var(--tx)]'
                }`}
              >
                {IVN[k]}
              </button>
            ))}
          </div>

          <p className="text-xs text-[var(--mut)] px-0.5">{IVD[mode]}</p>

          <div className="tf-card px-4 divide-y divide-[var(--line)]/60">
            {fields.map(([k, label, suf, min, max]) => {
              const key = String(k);
              const step = key === 'rounds' ? 1 : 5;
              const val = cfg[key] ?? 0;
              return (
                <div key={key} className="flex items-center gap-2.5 py-3">
                  <div className="flex-1 min-w-0">
                    <b className="block text-sm font-semibold">{label}</b>
                    <small className="block text-xs text-[var(--mut)]">{suf}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onUpdateField(key, ivClamp(val - step, Number(min), Number(max)));
                    }}
                    aria-label="Menos"
                    className="tf-tap w-11 h-11 rounded-xl border border-[var(--line)] bg-[var(--ac)]/15 text-[var(--ac2)] text-xl font-bold flex items-center justify-center cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="tf-input w-20 py-2 text-center text-lg font-bold tabular-nums"
                    value={val}
                    onChange={(e) => onUpdateField(key, Math.max(0, parseInt(e.target.value) || 0))}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onUpdateField(key, ivClamp(val + step, Number(min), Number(max)));
                    }}
                    aria-label="Más"
                    className="tf-tap w-11 h-11 rounded-xl border border-[var(--line)] bg-[var(--ac)]/15 text-[var(--ac2)] text-xl font-bold flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Audio & Sound Preferences */}
      <div className="tf-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <b className="text-sm block">Sonidos del temporizador</b>
            <span className="text-xs text-[var(--mut)]">
              Inicio, pausa, últimos 3 s y término de fase
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              unlockAudio();
              playTimerStart(true);
            }}
            className="tf-tap min-h-[36px] px-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
          >
            Probar
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--mut)] w-16 shrink-0">Volumen</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(snd.volume * 100)}
            onChange={(e) =>
              onUpdateSound({ volume: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })
            }
            className="tf-range flex-1"
            aria-label="Volumen de sonidos"
          />
          <span className="text-xs font-mono-num w-9 text-right text-[var(--mut)]">
            {Math.round(snd.volume * 100)}%
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--surface-2)]">
          {(Object.keys(PRESET_LABELS) as SoundPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                haptic('light');
                onUpdateSound({ preset: p });
              }}
              className={`tf-tap py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                snd.preset === p
                  ? 'bg-[var(--ac)] text-white shadow-sm'
                  : 'text-[var(--mut)] hover:text-[var(--tx)]'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="tf-card p-4 text-center">
        <span className="block text-[11px] text-[var(--mut)] tracking-wider">RESUMEN</span>
        <div className="text-xl font-bold tabular-nums mt-1">
          Total {fm(totalSec)} · {totalRounds} rondas
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          unlockAudio();
          haptic('medium');
          if (effectiveTarget) {
            onStartCircuit(effectiveTarget);
          } else {
            onStart();
          }
        }}
        className="tf-btn-pri w-full min-h-[58px] rounded-2xl text-lg font-bold flex items-center justify-center gap-2 cursor-pointer"
      >
        <Play className="w-5 h-5" />{' '}
        {effectiveTarget ? 'Iniciar circuito' : 'Iniciar'}
      </button>
    </div>
  );
}

