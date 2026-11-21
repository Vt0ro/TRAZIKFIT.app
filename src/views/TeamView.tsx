import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { haptic } from '../lib/audioHaptics';
import { capWord, cleanName, fmt, getLabels, iso, mon, add, onRange, todayStr, val } from '../lib/metrics';
import type { AppState } from '../types/trazik';

interface TeamViewProps {
  S: AppState;
  onSelectAthlete: (user: string) => void;
  onAddAthlete: (name: string) => string | null;
  onRequestDeleteAthlete: (name: string) => void;
}

export function TeamView({
  S,
  onSelectAthlete,
  onAddAthlete,
  onRequestDeleteAthlete,
}: TeamViewProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const labels = getLabels(S.lbl);
  const today = todayStr();
  const m = mon(new Date());
  const w0 = iso(m);
  const w1 = iso(add(m, 6));
  const p0 = iso(add(m, -7));
  const p1 = iso(add(m, -1));

  const handleAdd = () => {
    const cleaned = cleanName(newName);
    if (!cleaned) {
      setError('Escribe un nombre.');
      return;
    }
    const err = onAddAthlete(cleaned);
    if (err) {
      setError(err);
      return;
    }
    haptic('success');
    setNewName('');
    setError('');
    setAddOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Mis {labels.plu} ({S.users.length})
        </h2>
      </div>

      {addOpen ? (
        <div className="tf-card p-4 space-y-3">
          <b className="block text-base">{labels.add.replace(/^\+\s*/, '')}</b>
          <input
            type="text"
            className="tf-input w-full px-3.5 py-2.5 text-base"
            placeholder={`Nombre del ${labels.sing}`}
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
          />
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="tf-btn-pri flex-1 min-h-[44px] rounded-xl font-semibold text-sm cursor-pointer"
            >
              Agregar
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setError('');
              }}
              className="tf-tap flex-1 min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-medium cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            haptic('light');
            setAddOpen(true);
            setError('');
          }}
          className="tf-btn-pri w-full sm:w-auto px-5 min-h-[46px] rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {capWord(labels.add.replace(/^\+\s*/, ''))}
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {S.users.map((u, idx) => {
          const L = S.sessions.filter((x) => x.user === u);
          const W = onRange(L, w0, w1);
          const P = onRange(L, p0, p1);
          const past = L.filter((x) => x.date <= today).sort((a, b) =>
            b.date.localeCompare(a.date)
          )[0];
          const nx = L.filter((x) => x.date >= today).sort((a, b) =>
            a.date.localeCompare(b.date)
          )[0];
          const curTon = val(S, W, 'ton');
          const prevTon = val(S, P, 'ton');
          const avgRpe = val(S, W, 'rpe');
          const pl = (S.plans[u] || []).map((x) => x.n).join(', ');
          const initial = String(u || '?').trim().charAt(0).toUpperCase();
          const isLinked = Boolean(S.linked?.[u]);

          return (
            <motion.div
              key={u}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(idx * 0.04, 0.2), ease: [0.16, 1, 0.3, 1] }}
              className={`tf-card p-4 space-y-3 ${
                u === S.user ? 'ring-1 ring-[var(--ac2)]/40' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A259FF] to-[#6D28D9] text-white font-display font-bold text-base flex items-center justify-center shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="text-base truncate">{u}</b>
                      {u === S.user && (
                        <span className="text-[11px] font-medium text-[var(--ac2)]">· activo</span>
                      )}
                      {isLinked && (
                        <span className="text-[10px] font-semibold text-emerald-400">· Google</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--mut)] mt-0.5 truncate">
                      {pl || 'Sin plan'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onRequestDeleteAthlete(u);
                    }}
                    aria-label={`Eliminar a ${u}`}
                    title={`Eliminar a ${u}`}
                    className="tf-tap w-10 h-10 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--mut)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 inline-flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onSelectAthlete(u);
                    }}
                    className="tf-tap min-h-[40px] px-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-medium hover:border-[var(--ac2)]/50 inline-flex items-center gap-1 cursor-pointer"
                  >
                    Abrir <ChevronRight className="w-4 h-4 text-[var(--mut)]" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-2">
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <span className="block text-[11px] text-[var(--mut)]">Sesiones semana</span>
                  <b className="text-lg font-bold tabular-nums">{W.length}</b>
                </div>

                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <span className="block text-[11px] text-[var(--mut)]">Tonelaje semana</span>
                  <b className="text-lg font-bold tabular-nums block">{fmt(curTon)}</b>
                  {(curTon > 0 || prevTon > 0) && (
                    <span
                      className={`text-[11px] font-medium ${
                        curTon >= prevTon ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
                      }`}
                    >
                      {curTon >= prevTon ? '▲' : '▼'}{' '}
                      {prevTon ? `${Math.abs(((curTon - prevTon) / prevTon) * 100).toFixed(0)}%` : 'nuevo'}
                    </span>
                  )}
                </div>

                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <span className="block text-[11px] text-[var(--mut)]">RPE medio</span>
                  <b className="text-lg font-bold tabular-nums">{avgRpe.toFixed(1)}</b>
                </div>

                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <span className="block text-[11px] text-[var(--mut)]">Próxima sesión</span>
                  <b className="text-xs font-semibold block mt-1 truncate">
                    {nx ? `${nx.date.slice(5)} · ${nx.name || 'Sesión'}` : '—'}
                  </b>
                </div>
              </div>

              {past && (
                <p className="text-xs text-[var(--mut)] leading-relaxed pt-1 border-t border-[var(--line)]/60" data-selectable="true">
                  Última: {past.date} · Ánimo {past.feel || '—'}/5 · RPE {past.rpe || '—'}
                  {past.notes ? ` · “${past.notes.slice(0, 90)}”` : ''}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
