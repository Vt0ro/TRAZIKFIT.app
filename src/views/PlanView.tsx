import { useEffect, useState } from 'react';
import { ChevronRight, Play, Plus, Timer, Trash2, Upload } from 'lucide-react';
import { haptic, unlockAudio } from '../lib/audioHaptics';
import { WD, exFrom, iso, mon, nz, pRest, pd, secs, todayStr, uid } from '../lib/metrics';
import type { AppState, Block, CircuitIntervalTarget, MonthPlan, PlanExercise } from '../types/trazik';

interface PlanViewProps {
  S: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onOpenImport: () => void;
  onApplyPlan: (startDate: string, weeks: number) => void;
  onStartCircuitIntervals: (target: CircuitIntervalTarget) => void;
  onUploadAnnexImage?: (
    monthId: string,
    annexId: string,
    blob: Blob,
    fallbackDataUrl: string
  ) => Promise<string>;
  onDeleteMonth?: (monthIndex: number) => void;
  onDeleteAnnex?: (annexId: string) => void;
}

export function PlanView({
  S,
  onUpdateState,
  onOpenImport,
  onApplyPlan,
  onStartCircuitIntervals,
  onUploadAnnexImage,
  onDeleteMonth,
  onDeleteAnnex,
}: PlanViewProps) {
  const [applyDate, setApplyDate] = useState(() => iso(mon(pd(S.anchor))));
  const [applyWeeks, setApplyWeeks] = useState(4);
  const [singleDayIdx, setSingleDayIdx] = useState(0);
  const [singleDayDate, setSingleDayDate] = useState(() => todayStr());
  const [videoDrafts, setVideoDrafts] = useState<Record<string, string>>({});
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [confirmDeleteMonth, setConfirmDeleteMonth] = useState(false);

  useEffect(() => {
    setConfirmDeleteMonth(false);
  }, [S.pm, S.user]);

  const pl = S.plans[S.user] || [];
  const M: MonthPlan | undefined = pl[S.pm] || pl[0];
  const isAthlete = S.role === 'atleta';

  const updateMonth = (fn: (m: MonthPlan) => MonthPlan) => {
    onUpdateState((prev) => {
      const list = [...(prev.plans[prev.user] || [])];
      const idx = list[prev.pm] ? prev.pm : 0;
      if (!list[idx]) return prev;
      list[idx] = fn(structuredClone(list[idx]));
      return { ...prev, plans: { ...prev.plans, [prev.user]: list } };
    });
  };

  const renderAnnexesReadonly = (monthId: string, exName: string) => {
    const items = S.annex.filter(
      (a) => a.m && a.m === monthId && nz(a.name) === nz(exName)
    );
    if (!items.length) return null;
    return (
      <div className="flex flex-wrap gap-2 mt-1.5">
        {items.map((a) =>
          a.kind === 'img' ? (
            <img
              key={a.id}
              src={a.src}
              alt={exName}
              onClick={() => setZoomedSrc(a.src)}
              className="h-20 rounded-lg cursor-zoom-in border border-[var(--line)]"
            />
          ) : (
            <a
              key={a.id}
              href={a.src}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[var(--ac2)] hover:underline"
            >
              ▶ video
            </a>
          )
        )}
      </div>
    );
  };

  // Athlete Read-Only Program View
  if (isAthlete) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
          {pl.map((m, i) => (
            <button
              key={m.id || i}
              type="button"
              onClick={() => {
                haptic('light');
                onUpdateState((prev) => ({ ...prev, pm: i }));
              }}
              className={`min-h-[42px] px-4 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 border cursor-pointer ${
                m === M
                  ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                  : 'bg-[var(--surface)] border-[var(--line)] text-[var(--tx)]'
              }`}
            >
              {m.n}
            </button>
          ))}
        </div>

        {!M ? (
          <div className="tf-card p-5">
            <p className="text-sm text-[var(--mut)]">
              Aún no tienes un programa asignado. Puedes importar una rutina o vincularte con tu entrenador en Perfil → Cuenta.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="tf-card p-4">
              <b className="text-base">{M.n}</b>{' '}
              {M.f && <span className="text-sm text-[var(--mut)]">· {M.f}</span>}
            </div>

            {M.d.map((d, di) => (
              <div key={di} className="tf-card p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <b className="text-base">
                    {d.n}
                    {d.t ? ` · ${d.t}` : ''}
                  </b>
                  <span className="text-xs text-[var(--mut)]">{WD[d.wd]}</span>
                </div>
                {d.note && (
                  <p className="text-xs text-[var(--mut)] leading-relaxed" data-selectable="true">
                    {d.note}
                  </p>
                )}
                {d.b
                  .filter((b) => b[1].length > 0)
                  .map((b, bi) => {
                    const isCirc = !!(b[2] && b[2].c);
                    const cfg = b[2];
                    return (
                      <div key={bi} className="space-y-2 pt-2 border-t border-[var(--line)]/60">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-[var(--ac2)]">
                            {b[0]}
                            {isCirc && (
                              <span className="font-normal text-[var(--mut)]">
                                {' '}
                                · Circuito · {cfg?.r || 3} rondas
                                {cfg?.rest ? ` · desc ${cfg.rest}` : ''}
                              </span>
                            )}
                          </div>
                          {isCirc && b[1].length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                unlockAudio();
                                haptic('medium');
                                onStartCircuitIntervals({
                                  id: `plan:${M.id || 'm'}:${di}:${bi}`,
                                  title: `${M.n} · ${d.n} · ${b[0]}`,
                                  rounds: Math.max(1, parseInt(String(cfg?.r)) || 3),
                                  roundRestSec: pRest(cfg?.rest),
                                  workSec: cfg?.iw && cfg.iw > 0 ? cfg.iw : 40,
                                  transSec: cfg?.it !== undefined ? cfg.it : 10,
                                  prepSec: cfg?.ip !== undefined ? cfg.ip : 10,
                                  exercises: b[1].map((ex) => ({
                                    name: ex.n,
                                    workSec: ex.mt === 'time' ? secs(ex.r) || undefined : undefined,
                                  })),
                                });
                              }}
                              className={`tf-tap min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                                cfg?.iv
                                  ? 'tf-btn-pri'
                                  : 'border border-[var(--line)] bg-[var(--surface-2)] text-[var(--mut)] hover:text-[var(--tx)]'
                              }`}
                            >
                              <Timer className="w-3 h-3" />
                              <span>{cfg?.iv ? 'Iniciar en Intervalos' : 'Usar en Intervalos'}</span>
                            </button>
                          )}
                        </div>
                        <div className="divide-y divide-[var(--line)]/40">
                          {b[1].map((x, xi) => (
                            <div key={xi} className="py-2 space-y-1">
                              <div className="text-sm">
                                <b className="font-semibold">{x.n}</b>{' '}
                                <span className="text-xs text-[var(--mut)] tabular-nums">
                                  {isCirc ? x.r : `${x.s} × ${x.r}`}
                                  {x.kg ? ` · ${x.kg}kg` : ''}
                                  {!isCirc && x.rest ? ` · desc ${x.rest}` : ''}
                                  {x.bw ? ' · peso corporal' : ''}
                                  {x.mt === 'time' ? ' · por tiempo' : ''}
                                </span>
                              </div>
                              {x.o && (
                                <p className="text-xs text-[var(--mut)]" data-selectable="true">
                                  {x.o}
                                </p>
                              )}
                              {x.l && (
                                <a
                                  href={x.l}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block text-xs font-medium text-[var(--ac2)] hover:underline"
                                >
                                  ▶ video
                                </a>
                              )}
                              {renderAnnexesReadonly(M.id, x.n)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            haptic('light');
            onOpenImport();
          }}
          className="tf-card w-full p-4 flex items-center gap-3 text-left hover:border-[var(--ac2)]/50 cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block text-sm">Importar Rutina (PDF / Word)</b>
            <span className="block text-xs text-[var(--mut)]">
              Sube un archivo y la app arma la rutina
            </span>
          </span>
          <ChevronRight className="w-5 h-5 text-[var(--mut)] shrink-0" />
        </button>

        {zoomedSrc && (
          <div
            onClick={() => setZoomedSrc(null)}
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <img src={zoomedSrc} alt="Vista ampliada" className="max-w-full max-h-full rounded-2xl" />
          </div>
        )}
      </div>
    );
  }

  // Coach Plan Editor View
  const handleImageUpload = (
    di: number,
    bi: number,
    xi: number,
    file: File
  ) => {
    if (!M) return;
    const x = M.d[di]?.b[bi]?.[1][xi];
    if (!x) return;
    const exName = x.n;
    const monthId = M.id;
    const annexId = uid();
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 800 / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * k));
        cv.height = Math.max(1, Math.round(im.height * k));
        cv.getContext('2d')?.drawImage(im, 0, 0, cv.width, cv.height);
        const dataUrl = cv.toDataURL('image/jpeg', 0.72);
        const persist = async () => {
          let finalSrc = dataUrl;
          if (onUploadAnnexImage) {
            const blob = await new Promise<Blob | null>((resolve) =>
              cv.toBlob((b) => resolve(b), 'image/jpeg', 0.72)
            );
            if (blob) {
              finalSrc = await onUploadAnnexImage(monthId, annexId, blob, dataUrl);
            }
          }
          onUpdateState((prev) => ({
            ...prev,
            annex: [
              ...prev.annex,
              { id: annexId, name: exName, kind: 'img', src: finalSrc, m: monthId },
            ],
          }));
        };
        void persist();
      };
      im.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Orphaned annexes in current month
  const orphanedAnnexes = (() => {
    if (!M) return [];
    const seen = new Set<string>();
    M.d.forEach((d) =>
      d.b.forEach((b) =>
        b[1].forEach((x) => {
          seen.add(nz(x.n));
        })
      )
    );
    return S.annex.filter((a) => a.m === M.id && !seen.has(nz(a.name)));
  })();

  const allExerciseNamesInMonth = (() => {
    if (!M) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    M.d.forEach((d) =>
      d.b.forEach((b) =>
        b[1].forEach((x) => {
          const k = nz(x.n);
          if (k && !seen.has(k)) {
            seen.add(k);
            out.push(x.n);
          }
        })
      )
    );
    return out;
  })();

  return (
    <div className="space-y-4">
      {/* Month Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {pl.map((m, i) => (
          <button
            key={m.id || i}
            type="button"
            onClick={() => {
              haptic('light');
              onUpdateState((prev) => ({ ...prev, pm: i, msg: '', msg2: '' }));
            }}
            className={`min-h-[42px] px-4 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 border cursor-pointer ${
              i === S.pm
                ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                : 'bg-[var(--surface)] border-[var(--line)] text-[var(--tx)]'
            }`}
          >
            {m.n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            haptic('light');
            onUpdateState((prev) => {
              const cur = prev.plans[prev.user] || [];
              const newM: MonthPlan = {
                id: uid(),
                n: 'Mes ' + (cur.length + 1),
                f: '',
                d: [1, 2, 3].map((idx) => ({
                  n: 'Día ' + idx,
                  wd: [2, 4, 5][idx - 1],
                  t: '',
                  note: '',
                  b: [
                    ['Calentamiento', []],
                    ['Principal', []],
                  ],
                })),
              };
              return {
                ...prev,
                plans: { ...prev.plans, [prev.user]: [...cur, newM] },
                pm: cur.length,
              };
            });
          }}
          className="min-h-[42px] px-4 rounded-xl border border-dashed border-[var(--line)] text-sm text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
        >
          + Mes
        </button>
      </div>

      {/* Import Routine Row */}
      <button
        type="button"
        onClick={() => {
          haptic('light');
          onOpenImport();
        }}
        className="tf-card w-full p-4 flex items-center gap-3 text-left hover:border-[var(--ac2)]/50 cursor-pointer"
      >
        <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
          <Upload className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <b className="block text-sm">Importar Rutina (PDF / Word)</b>
          <span className="block text-xs text-[var(--mut)]">
            Sube un archivo y la app arma la rutina
          </span>
        </span>
        <ChevronRight className="w-5 h-5 text-[var(--mut)] shrink-0" />
      </button>

      {!M ? (
        <p className="text-sm text-[var(--mut)]">Sin plan aún. Crea el primer mes.</p>
      ) : (
        <>
          {/* Month Header & Apply to Calendar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="tf-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="tf-input flex-1 min-w-0 px-3 py-2 text-sm font-semibold"
                  value={M.n}
                  onChange={(e) => updateMonth((m) => ({ ...m, n: e.target.value }))}
                />
                <input
                  type="text"
                  className="tf-input flex-[2] min-w-0 px-3 py-2 text-sm"
                  placeholder="Enfoque del mes"
                  value={M.f}
                  onChange={(e) => updateMonth((m) => ({ ...m, f: e.target.value }))}
                />
                {confirmDeleteMonth ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        haptic('medium');
                        setConfirmDeleteMonth(false);
                        if (onDeleteMonth) {
                          onDeleteMonth(S.pm);
                        } else {
                          onUpdateState((prev) => {
                            const list = [...(prev.plans[prev.user] || [])];
                            const target = list[prev.pm];
                            const nextList = list.filter((_, idx) => idx !== prev.pm);
                            return {
                              ...prev,
                              plans: { ...prev.plans, [prev.user]: nextList },
                              annex: target?.id
                                ? prev.annex.filter((a) => a.m !== target.id)
                                : prev.annex,
                              pm: 0,
                            };
                          });
                        }
                      }}
                      className="min-h-[38px] px-2.5 rounded-lg bg-[var(--danger)] text-white text-xs font-semibold cursor-pointer"
                    >
                      ¿Borrar mes? Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMonth(false)}
                      className="min-h-[38px] px-2 rounded-lg border border-[var(--line)] text-xs cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      setConfirmDeleteMonth(true);
                    }}
                    className="min-h-[40px] px-3 text-xs font-medium text-[var(--danger)] cursor-pointer shrink-0"
                  >
                    Eliminar
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-[var(--mut)]">Aplicar desde</span>
                <input
                  type="date"
                  className="tf-input px-2.5 py-2 text-sm"
                  value={applyDate}
                  onChange={(e) => setApplyDate(e.target.value)}
                />
                <select
                  className="tf-input px-2.5 py-2 text-sm"
                  value={applyWeeks}
                  onChange={(e) => setApplyWeeks(+e.target.value)}
                >
                  {[2, 3, 4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--mut)]">semanas</span>
                <button
                  type="button"
                  onClick={() => {
                    haptic('success');
                    onApplyPlan(applyDate, applyWeeks);
                  }}
                  className="tf-btn-pri px-4 min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Aplicar al calendario
                </button>

                <select
                  className="tf-input px-2.5 py-2 text-xs"
                  value=""
                  onChange={(e) => {
                    const targetUser = e.target.value;
                    if (!targetUser) return;
                    onUpdateState((prev) => {
                      const copy = structuredClone(M);
                      copy.id = uid();
                      const list = [...(prev.plans[targetUser] || []), copy];
                      return {
                        ...prev,
                        plans: { ...prev.plans, [targetUser]: list },
                        msg: '✓ Mes copiado a ' + targetUser,
                      };
                    });
                  }}
                >
                  <option value="">Copiar mes a…</option>
                  {S.users
                    .filter((u) => u !== S.user)
                    .map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                </select>
              </div>
              {S.msg && <p className="text-xs text-[var(--ok)]">{S.msg}</p>}
            </div>

            {/* Add Single Day Card */}
            <div className="tf-card p-4 space-y-2.5">
              <div>
                <b className="text-sm block">Agregar un solo día al calendario</b>
                <p className="text-xs text-[var(--mut)] mt-0.5">
                  Suma un día suelto sin tocar nada de lo ya planificado.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className="tf-input flex-1 min-w-[140px] px-3 py-2 text-sm"
                  value={singleDayIdx}
                  onChange={(e) => setSingleDayIdx(+e.target.value)}
                >
                  {M.d.map((d, i) => (
                    <option key={i} value={i}>
                      {d.n}
                      {d.t ? ` · ${d.t}` : ''}
                    </option>
                  ))}
                  <option value={-1}>Día en blanco</option>
                </select>
                <input
                  type="date"
                  className="tf-input px-3 py-2 text-sm"
                  value={singleDayDate}
                  onChange={(e) => setSingleDayDate(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!singleDayDate) return;
                    const dd = singleDayIdx >= 0 ? M.d[singleDayIdx] : null;
                    const nm = dd
                      ? `${M.n} · ${dd.n}${dd.t ? ' · ' + dd.t : ''}`
                      : 'Sesión extra';
                    onUpdateState((prev) => {
                      const exists = prev.sessions.some(
                        (x) => x.user === prev.user && x.date === singleDayDate && x.name === nm
                      );
                      if (exists) {
                        return {
                          ...prev,
                          msg2: 'Ya existe ese día en esa fecha; no se modificó nada.',
                        };
                      }
                      const exercises = dd ? exFrom(dd) : [];

                      return {
                        ...prev,
                        sessions: [
                          ...prev.sessions,
                          {
                            id: uid(),
                            user: prev.user,
                            date: singleDayDate,
                            sport: 'Gimnasio',
                            name: nm,
                            mid: M.id,
                            exercises,
                          },
                        ],
                        msg2: `✓ Día agregado el ${singleDayDate.slice(8)}/${singleDayDate.slice(5, 7)}`,
                      };
                    });
                  }}
                  className="tf-btn-pri px-4 min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Agregar día
                </button>
              </div>
              {S.msg2 && <p className="text-xs text-[var(--ac2)]">{S.msg2}</p>}
            </div>
          </div>

          {/* Day Cards */}
          {M.d.map((d, di) => (
            <div key={di} className="tf-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="tf-input w-24 px-3 py-2 text-sm font-semibold"
                  value={d.n}
                  onChange={(e) =>
                    updateMonth((m) => {
                      m.d[di].n = e.target.value;
                      return m;
                    })
                  }
                />
                <input
                  type="text"
                  className="tf-input flex-1 min-w-0 px-3 py-2 text-sm"
                  placeholder="Enfoque del día"
                  value={d.t}
                  onChange={(e) =>
                    updateMonth((m) => {
                      m.d[di].t = e.target.value;
                      return m;
                    })
                  }
                />
                <select
                  className="tf-input px-2.5 py-2 text-sm"
                  value={d.wd}
                  onChange={(e) =>
                    updateMonth((m) => {
                      m.d[di].wd = +e.target.value;
                      return m;
                    })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((w) => (
                    <option key={w} value={w}>
                      {WD[w]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    updateMonth((m) => {
                      m.d.splice(di, 1);
                      return m;
                    });
                  }}
                  aria-label="Eliminar día"
                  className="p-2 text-[var(--danger)] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <input
                type="text"
                className="tf-input w-full px-3 py-2 text-xs"
                placeholder="Nota del día (movilidad, descansos…)"
                value={d.note || ''}
                onChange={(e) =>
                  updateMonth((m) => {
                    m.d[di].note = e.target.value;
                    return m;
                  })
                }
              />

              {/* Blocks */}
              {d.b.map((b, bi) => {
                const isCirc = !!(b[2] && b[2].c);
                return (
                  <div
                    key={bi}
                    className={`pt-3 border-t border-[var(--line)]/60 space-y-2.5 ${
                      isCirc ? 'pl-3 rounded-lg bg-[var(--ac)]/5 p-3' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="tf-input flex-1 px-3 py-1.5 text-sm font-semibold text-[var(--ac2)]"
                        value={b[0]}
                        onChange={(e) =>
                          updateMonth((m) => {
                            m.d[di].b[bi][0] = e.target.value;
                            return m;
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => {
                          haptic('light');
                          updateMonth((m) => {
                            const blk = m.d[di].b[bi];
                            if (blk[2] && blk[2].c) blk[2].c = 0;
                            else blk[2] = { r: 3, rest: '90s', ...(blk[2] || {}), c: 1 };
                            return m;
                          });
                        }}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border cursor-pointer shrink-0 ${
                          isCirc
                            ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                            : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--tx)]'
                        }`}
                      >
                        Circuito
                      </button>
                      {!b[1].length && bi > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateMonth((m) => {
                              m.d[di].b.splice(bi, 1);
                              return m;
                            })
                          }
                          className="p-1.5 text-[var(--danger)] cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {isCirc && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="text-xs text-[var(--mut)] flex items-center gap-1.5">
                            Rondas
                            <input
                              type="text"
                              inputMode="numeric"
                              className="tf-input w-16 px-2 py-1 text-center text-sm"
                              value={b[2]?.r ?? 3}
                              onChange={(e) =>
                                updateMonth((m) => {
                                  const cfg = (m.d[di].b[bi][2] = m.d[di].b[bi][2] || {
                                    c: 1,
                                    r: 3,
                                    rest: '90s',
                                  });
                                  cfg.r = e.target.value;
                                  return m;
                                })
                              }
                            />
                          </label>
                          <label className="text-xs text-[var(--mut)] flex items-center gap-1.5">
                            Desc. entre rondas
                            <input
                              type="text"
                              className="tf-input w-24 px-2 py-1 text-center text-sm"
                              value={b[2]?.rest ?? ''}
                              onChange={(e) =>
                                updateMonth((m) => {
                                  const cfg = (m.d[di].b[bi][2] = m.d[di].b[bi][2] || {
                                    c: 1,
                                    r: 3,
                                    rest: '90s',
                                  });
                                  cfg.rest = e.target.value;
                                  return m;
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              haptic('light');
                              updateMonth((m) => {
                                const cfg = (m.d[di].b[bi][2] = m.d[di].b[bi][2] || {
                                  c: 1,
                                  r: 3,
                                  rest: '90s',
                                });
                                cfg.iv = !cfg.iv;
                                if (cfg.iv) {
                                  if (cfg.iw === undefined) cfg.iw = 40;
                                  if (cfg.it === undefined) cfg.it = 10;
                                  if (cfg.ip === undefined) cfg.ip = 10;
                                }
                                return m;
                              });
                            }}
                            className={`tf-tap min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 cursor-pointer ${
                              b[2]?.iv
                                ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                                : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--mut)] hover:text-[var(--tx)]'
                            }`}
                          >
                            <Timer className="w-3.5 h-3.5" />
                            <span>
                              {b[2]?.iv ? '✓ Vinculado a intervalos' : 'Vincular a intervalos (opcional)'}
                            </span>
                          </button>
                        </div>

                        {b[2]?.iv && (
                          <div className="rounded-xl border border-[var(--ac)]/25 bg-[var(--surface-2)]/70 p-2.5 space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <label className="text-[11px] text-[var(--mut)]">
                                Prep (s)
                                <input
                                  type="number"
                                  min={0}
                                  max={120}
                                  inputMode="numeric"
                                  className="tf-input w-full mt-1 px-2 py-1 text-center text-xs font-semibold tabular-nums"
                                  value={b[2]?.ip ?? 10}
                                  onChange={(e) =>
                                    updateMonth((m) => {
                                      const cfg = (m.d[di].b[bi][2] = m.d[di].b[bi][2] || {
                                        c: 1,
                                        r: 3,
                                        rest: '90s',
                                      });
                                      cfg.ip = Math.max(0, Math.min(120, parseInt(e.target.value) || 0));
                                      return m;
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
                                  className="tf-input w-full mt-1 px-2 py-1 text-center text-xs font-semibold tabular-nums"
                                  value={b[2]?.iw ?? 40}
                                  onChange={(e) =>
                                    updateMonth((m) => {
                                      const cfg = (m.d[di].b[bi][2] = m.d[di].b[bi][2] || {
                                        c: 1,
                                        r: 3,
                                        rest: '90s',
                                      });
                                      cfg.iw = Math.max(5, Math.min(3600, parseInt(e.target.value) || 5));
                                      return m;
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
                                  className="tf-input w-full mt-1 px-2 py-1 text-center text-xs font-semibold tabular-nums"
                                  value={b[2]?.it ?? 10}
                                  onChange={(e) =>
                                    updateMonth((m) => {
                                      const cfg = (m.d[di].b[bi][2] = m.d[di].b[bi][2] || {
                                        c: 1,
                                        r: 3,
                                        rest: '90s',
                                      });
                                      cfg.it = Math.max(0, Math.min(300, parseInt(e.target.value) || 0));
                                      return m;
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10.5px] text-[var(--mut)]">
                                Ejercicios «por tiempo» usan su duración propia.
                              </span>
                              {b[1].length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    unlockAudio();
                                    haptic('medium');
                                    const cfg = b[2];
                                    onStartCircuitIntervals({
                                      id: `plan:${M.id || 'm'}:${di}:${bi}`,
                                      title: `${M.n} · ${d.n} · ${b[0]}`,
                                      rounds: Math.max(1, parseInt(String(cfg?.r)) || 3),
                                      roundRestSec: pRest(cfg?.rest),
                                      workSec: cfg?.iw && cfg.iw > 0 ? cfg.iw : 40,
                                      transSec: cfg?.it !== undefined ? cfg.it : 10,
                                      prepSec: cfg?.ip !== undefined ? cfg.ip : 10,
                                      exercises: b[1].map((ex) => ({
                                        name: ex.n,
                                        workSec: ex.mt === 'time' ? secs(ex.r) || undefined : undefined,
                                      })),
                                    });
                                  }}
                                  className="tf-btn-pri px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <Play className="w-3 h-3" /> Probar
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <p className="text-[11px] text-[var(--mut)]">
                          Estaciones: los ejercicios de este bloque se hacen seguidos, una ronda tras otra.
                        </p>
                      </div>
                    )}

                    {/* Exercises in Block */}
                    <div className="divide-y divide-[var(--line)]/50">
                      {b[1].map((x, xi) => {
                        const key = `${di},${bi},${xi}`;
                        const exAnnexes = S.annex.filter(
                          (a) => a.m === M.id && nz(a.name) === nz(x.n)
                        );
                        const updateEx = (patch: Partial<PlanExercise>) => {
                          updateMonth((m) => {
                            Object.assign(m.d[di].b[bi][1][xi], patch);
                            return m;
                          });
                        };

                        return (
                          <div key={xi} className="py-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                className="tf-input flex-1 px-3 py-2 text-sm font-semibold"
                                value={x.n}
                                onChange={(e) => {
                                  const oldName = nz(x.n);
                                  const nextName = e.target.value;
                                  onUpdateState((prev) => {
                                    const list = [...(prev.plans[prev.user] || [])];
                                    const mCopy = structuredClone(list[prev.pm]);
                                    mCopy.d[di].b[bi][1][xi].n = nextName;
                                    list[prev.pm] = mCopy;
                                    const nextAnnex = prev.annex.map((a) =>
                                      a.m === M.id && nz(a.name) === oldName
                                        ? { ...a, name: nextName }
                                        : a
                                    );
                                    return {
                                      ...prev,
                                      plans: { ...prev.plans, [prev.user]: list },
                                      annex: nextAnnex,
                                    };
                                  });
                                }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateMonth((m) => {
                                    m.d[di].b[bi][1].splice(xi, 1);
                                    return m;
                                  })
                                }
                                aria-label="Eliminar ejercicio"
                                className="p-2 text-[var(--danger)] cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>

                            <div
                              className={`grid gap-2 ${
                                isCirc ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
                              }`}
                            >
                              {!isCirc && (
                                <label className="text-[11px] text-[var(--mut)]">
                                  Series
                                  <input
                                    type="text"
                                    className="tf-input w-full mt-1 px-2 py-2 text-center text-sm tabular-nums"
                                    value={x.s ?? ''}
                                    onChange={(e) => updateEx({ s: e.target.value })}
                                  />
                                </label>
                              )}
                              <label className="text-[11px] text-[var(--mut)]">
                                {isCirc
                                  ? x.mt === 'time'
                                    ? 'Tiempo'
                                    : 'Reps'
                                  : x.mt === 'time'
                                  ? 'Tiempo (mm:ss)'
                                  : 'Reps'}
                                <input
                                  type="text"
                                  className="tf-input w-full mt-1 px-2 py-2 text-center text-sm tabular-nums"
                                  value={x.r ?? ''}
                                  onChange={(e) => updateEx({ r: e.target.value })}
                                />
                              </label>
                              <label className="text-[11px] text-[var(--mut)]">
                                {x.bw ? 'Lastre (+kg)' : 'Kg'}
                                <input
                                  type="text"
                                  className="tf-input w-full mt-1 px-2 py-2 text-center text-sm tabular-nums"
                                  value={x.kg ?? ''}
                                  onChange={(e) => updateEx({ kg: e.target.value })}
                                />
                              </label>
                              {!isCirc && (
                                <label className="text-[11px] text-[var(--mut)]">
                                  Desc.
                                  <input
                                    type="text"
                                    className="tf-input w-full mt-1 px-2 py-2 text-center text-sm tabular-nums"
                                    value={x.rest ?? ''}
                                    onChange={(e) => updateEx({ rest: e.target.value })}
                                  />
                                </label>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateEx({ mt: '' })}
                                className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                                  x.mt !== 'time'
                                    ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                                    : 'bg-[var(--surface-2)] border-[var(--line)]'
                                }`}
                              >
                                Reps
                              </button>
                              <button
                                type="button"
                                onClick={() => updateEx({ mt: 'time' })}
                                className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                                  x.mt === 'time'
                                    ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                                    : 'bg-[var(--surface-2)] border-[var(--line)]'
                                }`}
                              >
                                Tiempo
                              </button>
                              <button
                                type="button"
                                onClick={() => updateEx({ bw: x.bw ? '' : '1' })}
                                className={`min-h-[34px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                                  x.bw
                                    ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                                    : 'bg-[var(--surface-2)] border-[var(--line)]'
                                }`}
                              >
                                {x.bw ? '✓ ' : ''}Usar mi peso corporal
                              </button>
                            </div>

                            <input
                              type="text"
                              className="tf-input w-full px-3 py-2 text-xs"
                              placeholder="Comentarios y observaciones del ejercicio"
                              value={x.o || ''}
                              onChange={(e) => updateEx({ o: e.target.value })}
                            />

                            {/* Annexes Section */}
                            <div className="pt-1 space-y-2">
                              <span className="block text-[11px] text-[var(--mut)]">
                                Anexo de {M.n}
                              </span>
                              {exAnnexes.map((a) => (
                                <div key={a.id} className="flex items-center gap-2">
                                  {a.kind === 'img' ? (
                                    <img
                                      src={a.src}
                                      alt={a.name}
                                      className="h-14 rounded-lg border border-[var(--line)]"
                                    />
                                  ) : (
                                    <a
                                      href={a.src}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex-1 min-w-0 text-xs text-[var(--ac2)] break-all hover:underline"
                                    >
                                      ▶ {a.src}
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onDeleteAnnex) {
                                        onDeleteAnnex(a.id);
                                      } else {
                                        onUpdateState((prev) => ({
                                          ...prev,
                                          annex: prev.annex.filter((it) => it.id !== a.id),
                                        }));
                                      }
                                    }}
                                    className="p-1.5 text-[var(--danger)] cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              <div className="flex gap-2">
                                <input
                                  type="url"
                                  className="tf-input flex-1 px-3 py-1.5 text-xs"
                                  placeholder="Link de video (YouTube, Instagram…)"
                                  value={videoDrafts[key] || ''}
                                  onChange={(e) =>
                                    setVideoDrafts((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const url = (videoDrafts[key] || '').trim();
                                    if (!/^https?:\/\//.test(url)) return;
                                    onUpdateState((prev) => ({
                                      ...prev,
                                      annex: [
                                        ...prev.annex,
                                        { id: uid(), name: x.n, kind: 'vid', src: url, m: M.id },
                                      ],
                                    }));
                                    setVideoDrafts((prev) => ({ ...prev, [key]: '' }));
                                  }}
                                  className="tf-btn-pri px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                                >
                                  Agregar
                                </button>
                              </div>
                              <label className="inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium cursor-pointer">
                                Subir imagen
                                <input
                                  type="file"
                                  accept="image/*"
                                  hidden
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleImageUpload(di, bi, xi, f);
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        updateMonth((m) => {
                          m.d[di].b[bi][1].push({
                            n: 'Nuevo ejercicio',
                            s: 3,
                            r: 8,
                            kg: '',
                            rest: '2min',
                            o: '',
                            l: '',
                          });
                          return m;
                        });
                      }}
                      className="w-full min-h-[40px] rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
                    >
                      + Ejercicio
                    </button>
                  </div>
                );
              })}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    updateMonth((m) => {
                      m.d[di].b.push(['Bloque', []] as Block);
                      return m;
                    })
                  }
                  className="min-h-[38px] px-3.5 rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
                >
                  + Bloque
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateMonth((m) => {
                      m.d[di].b.push(['Circuito', [], { c: 1, r: 3, rest: '90s' }] as Block);
                      return m;
                    })
                  }
                  className="min-h-[38px] px-3.5 rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
                >
                  + Circuito
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              haptic('light');
              updateMonth((m) => {
                const i = m.d.length + 1;
                m.d.push({
                  n: 'Día ' + i,
                  wd: [2, 4, 5, 6, 0, 1, 3][(i - 1) % 7],
                  t: '',
                  note: '',
                  b: [
                    ['Calentamiento', []],
                    ['Principal', []],
                  ],
                });
                return m;
              });
            }}
            className="w-full min-h-[44px] rounded-xl border border-dashed border-[var(--line)] text-sm text-[var(--mut)] hover:text-[var(--tx)] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Día de entrenamiento
          </button>

          {/* Orphaned Annexes */}
          {orphanedAnnexes.length > 0 && (
            <div className="tf-card p-4 space-y-3">
              <div>
                <b className="text-sm block">Anexos sin ejercicio vinculado</b>
                <p className="text-xs text-[var(--mut)] mt-0.5">
                  Su ejercicio ya no existe en {M.n}. Vincúlalos a uno o quítalos.
                </p>
              </div>
              {orphanedAnnexes.map((a) => (
                <div key={a.id} className="pt-2 border-t border-[var(--line)]/60 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {a.name} · {a.kind === 'img' ? 'imagen' : a.src}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (onDeleteAnnex) {
                          onDeleteAnnex(a.id);
                        } else {
                          onUpdateState((prev) => ({
                            ...prev,
                            annex: prev.annex.filter((it) => it.id !== a.id),
                          }));
                        }
                      }}
                      className="text-[var(--danger)] px-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <select
                    className="tf-input w-full px-3 py-2 text-xs"
                    value=""
                    onChange={(e) => {
                      const nextName = e.target.value;
                      if (!nextName) return;
                      onUpdateState((prev) => ({
                        ...prev,
                        annex: prev.annex.map((it) =>
                          it.id === a.id ? { ...it, name: nextName } : it
                        ),
                      }));
                    }}
                  >
                    <option value="">Vincular a ejercicio…</option>
                    {allExerciseNamesInMonth.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
