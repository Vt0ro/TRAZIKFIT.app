import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { haptic } from '../lib/audioHaptics';
import {
  bwFor,
  fdateShort,
  fm,
  fmt,
  isTimeEx,
  nz,
  reps,
  secs,
  todayStr,
} from '../lib/metrics';
import type { AppState } from '../types/trazik';

interface PRViewProps {
  S: AppState;
  onTrackExercise: (name: string) => void;
  onTrackAllFromPlan: (names: string[]) => void;
  onUntrackExercise: (id: string) => void;
  onAddManualPR: (name: string, kg: number, repsVal: number, date: string, isTime: boolean) => void;
  onDeleteManualPR: (id: string) => void;
}

interface PRRowData {
  k: string;
  n: string;
  id: string;
  kg: number;
  rk: number;
  kd: string;
  e: number;
  ed: string;
  mr: number;
  md: string;
  h: Record<string, { e: number; r: number }>;
  tm: number;
  bw: number;
}

export function PRView({
  S,
  onTrackExercise,
  onTrackAllFromPlan,
  onUntrackExercise,
  onAddManualPR,
  onDeleteManualPR,
}: PRViewProps) {
  const today = todayStr();
  const [trackInput, setTrackInput] = useState('');
  const [selectedPRName, setSelectedPRName] = useState('');
  const [manualKg, setManualKg] = useState('');
  const [manualReps, setManualReps] = useState('');
  const [manualDate, setManualDate] = useState(today);

  const L = S.sessions
    .filter((s) => s.sport === S.sport && s.user === S.user)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const planNames = (() => {
    const o: string[] = [];
    const seen: Record<string, number> = {};
    (S.plans[S.user] || []).forEach((m) =>
      (m.d || []).forEach((d) =>
        (d.b || []).forEach((b) =>
          (b[1] || []).forEach((x) => {
            const k = nz(x.n);
            if (k && !seen[k]) {
              seen[k] = 1;
              o.push(x.n);
            }
          })
        )
      )
    );
    return o;
  })();

  const planTarget = (k: string) => {
    const P = S.plans[S.user] || [];
    for (let i = P.length - 1; i >= 0; i--) {
      for (const d of P[i].d || []) {
        for (const b of d.b || []) {
          for (const x of b[1] || []) {
            if (nz(x.n) === k) {
              return {
                m: P[i].n,
                t:
                  b[2] && b[2].c
                    ? (b[2].r || 3) + ' rondas × ' + x.r
                    : x.s + ' × ' + x.r,
                kg: parseFloat(String(x.kg)) || 0,
              };
            }
          }
        }
      }
    }
    return null;
  };

  const R: Record<string, PRRowData> = {};
  const trk = (S.prx || []).filter((x) => x.user === S.user);
  const mine = S.prs.filter((x) => x.user === S.user);

  const mk = (name: string, id: string) => {
    const k = nz(name);
    if (k && !R[k]) {
      R[k] = {
        k,
        n: name,
        id,
        kg: 0,
        rk: 0,
        kd: '',
        e: 0,
        ed: '',
        mr: 0,
        md: '',
        h: {},
        tm: 0,
        bw: 0,
      };
    }
  };

  trk.forEach((x) => mk(x.name, x.id));
  mine.forEach((x) => {
    mk(x.name, '');
    if (x.mt === 'time' && R[nz(x.name)]) R[nz(x.name)].tm = 1;
  });
  L.forEach((x) =>
    x.exercises.forEach((e) => {
      const o = R[nz(e.name)];
      if (o) {
        if (e.mt === 'time') o.tm = 1;
        if (e.bw) o.bw = 1;
      }
    })
  );

  const put = (k: string, kg: number, r: number, d: string) => {
    const o = R[k];
    if (!o) return;
    if (kg > o.kg) {
      o.kg = kg;
      o.rk = r;
      o.kd = d;
    }
    const e = !o.tm && kg > 0 && r > 0 ? kg * (1 + r / 30) : 0;
    if (e > o.e) {
      o.e = e;
      o.ed = d;
    }
    if (r > o.mr) {
      o.mr = r;
      o.md = d;
    }
    const hh = o.h[d] || (o.h[d] = { e: 0, r: 0 });
    if (e > hh.e) hh.e = e;
    if (r > hh.r) hh.r = r;
  };

  L.forEach((x) => {
    const bw = bwFor(S, x);
    x.exercises.forEach((e) => {
      const k = nz(e.name);
      if (!R[k]) return;
      e.sets.forEach((st) => {
        if (!st.done) return;
        const a = parseFloat(String(st.a)) || 0;
        put(k, e.bw ? a + bw : a, e.mt === 'time' ? secs(st.b) : reps(st.b), x.date);
      });
    });
  });
  mine.forEach((x) => put(nz(x.name), +x.kg || 0, +x.reps || 0, x.date));

  const rows = Object.values(R).sort((a, b) => b.kg - a.kg || a.n.localeCompare(b.n));
  const nw = (d: string) =>
    d && (new Date(today).getTime() - new Date(d).getTime()) / 864e5 <= 14 ? ' ★' : '';

  const allNames = [
    ...new Set([...planNames, ...L.flatMap((x) => x.exercises.map((e) => e.name))]),
  ].sort();

  const trackedSet = new Set(trk.map((x) => nz(x.name)));
  mine.forEach((x) => trackedSet.add(nz(x.name)));
  const suggestions = planNames.filter((n) => !trackedSet.has(nz(n)));
  const activeSelectName = rows.some((r) => r.n === selectedPRName)
    ? selectedPRName
    : rows[0]?.n || '';

  return (
    <div className="space-y-4">
      <div className="tf-card p-4 space-y-3 min-w-0 overflow-hidden">
        <div>
          <b className="text-base block">★ Récords personales (PR)</b>
          <p className="text-xs text-[var(--mut)] mt-1 leading-relaxed" data-selectable="true">
            Agrega a mano los ejercicios que quieres seguir. Cada serie marcada con ✓ en tus
            sesiones con ese nombre actualiza solo el récord, el 1RM estimado (Epley) y la
            tendencia. En ejercicios con peso corporal la carga incluye tu peso; en los de tiempo el
            récord es el tiempo máximo. ★ = récord de los últimos 14 días.
          </p>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-[var(--mut)] border-b border-[var(--line)]">
                  <th className="text-left py-2 font-medium">Ejercicio</th>
                  <th className="text-center py-2 font-medium">PR carga</th>
                  <th className="text-center py-2 font-medium">1RM est.</th>
                  <th className="text-right py-2 font-medium">Máx reps / tiempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]/60">
                {rows.map((o) => {
                  const pt = planTarget(o.k);
                  const ds = Object.keys(o.h).sort();
                  let trendEl = null;
                  if (ds.length >= 2) {
                    const m = o.e > 0 ? 'e' : 'r';
                    const a = o.h[ds[ds.length - 1]][m];
                    const b = o.h[ds[ds.length - 2]][m];
                    const dl = a - b;
                    if (a && b) {
                      trendEl = (
                        <span
                          className={`block text-[11px] ${
                            dl >= 0 ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
                          }`}
                        >
                          {dl >= 0 ? '▲' : '▼'} {fmt(Math.abs(dl))}
                          {m === 'e' ? ' kg' : o.tm ? ' s' : ' reps'} vs. anterior
                        </span>
                      );
                    }
                  }
                  const vr = (v: number) => (o.tm ? fm(v) : fmt(v));

                  return (
                    <tr key={o.k}>
                      <td className="py-2.5 pr-2 align-top">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{o.n}</span>
                          {o.id && (
                            <button
                              type="button"
                              onClick={() => {
                                haptic('light');
                                onUntrackExercise(o.id);
                              }}
                              title="Dejar de seguir"
                              className="text-[var(--danger)] px-1.5 py-0.5 text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {pt && (
                          <span className="block text-[11px] text-[var(--mut)]">
                            Plan ({pt.m}): {pt.t}
                            {pt.kg ? ` · ${fmt(pt.kg)} kg` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center align-top tabular-nums">
                        {o.kg ? (
                          <>
                            <b>{fmt(o.kg)} kg</b>
                            {nw(o.kd)}
                            <span className="block text-[11px] text-[var(--mut)]">
                              × {vr(o.rk)} · {fdateShort(o.kd)}
                              {o.bw ? ' · peso corporal' : ''}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 text-center align-top tabular-nums">
                        {o.e ? `${fmt(o.e)} kg` : '—'}
                        {trendEl}
                      </td>
                      <td className="py-2.5 text-right align-top tabular-nums">
                        {o.mr ? (
                          <>
                            {vr(o.mr)}
                            {nw(o.md)}
                            <span className="block text-[11px] text-[var(--mut)]">
                              {fdateShort(o.md)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--mut)]">
            Aún no sigues ningún ejercicio. Agrégalo abajo.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="tf-card p-4 space-y-3 min-w-0 overflow-hidden">
          <b className="text-base block">Ejercicios a seguir</b>
          <div className="flex gap-2 min-w-0">
            <input
              type="text"
              list="pr-l"
              className="tf-input flex-1 min-w-0 w-full px-3 py-2.5 text-sm"
              placeholder="Nombre del ejercicio"
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
            />
            <datalist id="pr-l">
              {allNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => {
                const v = trackInput.trim();
                if (v) {
                  haptic('success');
                  onTrackExercise(v);
                  setTrackInput('');
                }
              }}
              className="tf-btn-pri px-4 rounded-xl text-sm font-semibold cursor-pointer shrink-0"
            >
              Seguir
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="block text-xs text-[var(--mut)]">De tu plan:</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onTrackExercise(n);
                    }}
                    className="min-h-[36px] px-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium hover:border-[var(--ac2)]/50 cursor-pointer"
                  >
                    + {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  haptic('success');
                  onTrackAllFromPlan(suggestions);
                }}
                className="w-full min-h-[40px] rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
              >
                Seguir todos los del plan
              </button>
            </div>
          )}
        </div>

        <div className="tf-card p-4 space-y-3 min-w-0 overflow-hidden">
          <b className="text-base block">Registrar una marca manual</b>
          {rows.length ? (
            <>
              <select
                className="tf-input w-full min-w-0 px-3 py-2.5 text-sm"
                value={activeSelectName}
                onChange={(e) => setSelectedPRName(e.target.value)}
              >
                {rows.map((o) => (
                  <option key={o.k} value={o.n}>
                    {o.n}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2 min-w-0">
                <input
                  type="text"
                  inputMode="decimal"
                  className="tf-input w-full min-w-0 px-3 py-2.5 text-sm"
                  placeholder="kg (0 = sin carga)"
                  value={manualKg}
                  onChange={(e) => setManualKg(e.target.value)}
                />
                <input
                  type="text"
                  className="tf-input w-full min-w-0 px-3 py-2.5 text-sm"
                  placeholder="reps o tiempo (1:30)"
                  value={manualReps}
                  onChange={(e) => setManualReps(e.target.value)}
                />
              </div>
              <input
                type="date"
                className="tf-input w-full min-w-0 max-w-full px-3 py-2.5 text-sm"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  if (!activeSelectName) return;
                  const k = parseFloat(manualKg) || 0;
                  const tm = isTimeEx(S, activeSelectName);
                  const r = tm ? secs(manualReps) : parseFloat(manualReps) || 0;
                  if (k > 0 || r > 0) {
                    haptic('success');
                    onAddManualPR(activeSelectName, k, r || 1, manualDate || today, tm);
                    setManualKg('');
                    setManualReps('');
                  }
                }}
                className="tf-btn-pri w-full min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer"
              >
                Guardar marca
              </button>
            </>
          ) : (
            <p className="text-xs text-[var(--mut)]">
              Primero agrega un ejercicio a seguir.
            </p>
          )}

          {mine.length > 0 && (
            <div className="pt-2 border-t border-[var(--line)]/60 space-y-1.5">
              {mine.map((x) => (
                <div
                  key={x.id}
                  className="flex items-center justify-between text-xs py-1 border-b border-[var(--line)]/40 last:border-b-0"
                >
                  <span className="tabular-nums">
                    {x.name} · {fmt(x.kg)} kg × {x.mt === 'time' ? fm(x.reps) : fmt(x.reps)}{' '}
                    <small className="text-[var(--mut)]">{fdateShort(x.date)}</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteManualPR(x.id)}
                    aria-label="Eliminar marca"
                    className="p-1.5 text-[var(--danger)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
