import { CheckCircle2, Maximize2 } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { haptic } from '../lib/audioHaptics';
import { fdate } from '../lib/metrics';
import { isSessionFullyDone } from '../lib/notifications';
import type { ResolvedOS, TrainingSession } from '../types/trazik';

interface DayPickerSheetProps {
  date: string | null;
  sessions: TrainingSession[];
  os: ResolvedOS;
  onClose: () => void;
  onSelectSession: (id: string) => void;
  onCreateManualSession: (date: string) => void;
}

export function DayPickerSheet({
  date,
  sessions,
  os,
  onClose,
  onSelectSession,
  onCreateManualSession,
}: DayPickerSheetProps) {
  return (
    <BottomSheet open={!!date} onClose={onClose} os={os} maxWidthClass="max-w-lg">
      {date && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <b className="font-display text-lg font-bold">{fdate(date)}</b>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--mut)] px-2 py-1 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {sessions.length > 0 ? (
            <div className="space-y-2.5">
              <p className="text-xs text-[var(--mut)]">
                Hay {sessions.length} sesiones este día. Toca una para entrenar en pantalla completa:
              </p>
              {sessions.map((s) => {
                const done = isSessionFullyDone(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onSelectSession(s.id);
                    }}
                    className={`w-full text-left rounded-2xl border px-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      done
                        ? 'bg-emerald-500/10 border-emerald-500/35 hover:border-emerald-400/60'
                        : 'bg-gradient-to-r from-[#321C6A]/55 to-[var(--surface-2)] border-[var(--ac2)]/40 hover:border-[var(--ac2)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <b className="block text-sm font-semibold truncate">{s.name || 'Sesión'}</b>
                      <span className="block text-[11px] text-[var(--mut)] mt-0.5">
                        {s.exercises.length} ejercicio{s.exercises.length === 1 ? '' : 's'} ·{' '}
                        {done ? 'Completada' : 'Pantalla completa'}
                      </span>
                    </div>
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        Lista
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--ac)] text-white text-xs font-semibold shrink-0 shadow-sm shadow-[var(--ac)]/30">
                        <Maximize2 className="w-3.5 h-3.5" />
                        Entrenar
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--mut)] py-2">
              Día libre: no hay ningún entrenamiento planificado para esta fecha.
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onCreateManualSession(date);
              }}
              className="min-h-[42px] px-4 rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
            >
              + Sesión manual (opcional)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto min-h-[42px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
