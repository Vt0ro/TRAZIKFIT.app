import { useState } from 'react';
import { Upload } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { haptic } from '../lib/audioHaptics';
import { WD, uid } from '../lib/metrics';
import { fileToText, impParse, type ParsedRoutineResult } from '../lib/routineParser';
import type { MonthPlan, PlanExercise, ResolvedOS } from '../types/trazik';

interface ImportRoutineSheetProps {
  open: boolean;
  onClose: () => void;
  os: ResolvedOS;
  isLinkedAthlete: boolean;
  onSaveMonths: (months: MonthPlan[], startToday: boolean) => void;
}

export function ImportRoutineSheet({
  open,
  onClose,
  os,
  isLinkedAthlete,
  onSaveMonths,
}: ImportRoutineSheetProps) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [msg, setMsg] = useState('');
  const [res, setRes] = useState<ParsedRoutineResult | null>(null);

  const analyze = (inputText: string, fn: string) => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      setMsg('No hay texto para analizar.');
      setRes(null);
      return;
    }
    const parsed = impParse(trimmed, fn);
    setRes(parsed);
    setMsg(
      parsed.nex
        ? ''
        : 'No se reconocieron ejercicios. Usa líneas como «Sentadilla 4x8 60kg».'
    );
  };

  const handleFile = async (f: File) => {
    setFileName(f.name);
    setMsg(`Leyendo «${f.name}»…`);
    try {
      const tx = await fileToText(f);
      setText(tx);
      if (!tx.trim()) {
        setMsg(
          'El archivo no tiene texto legible (¿PDF escaneado?). Pega el texto manualmente.'
        );
        setRes(null);
      } else {
        analyze(tx, f.name);
      }
    } catch (err) {
      const m = String((err as Error)?.message || '');
      setMsg(
        m === 'doc'
          ? 'El formato .doc antiguo no es compatible. Guárdalo como .docx o PDF.'
          : 'No se pudo leer el archivo. Prueba con otro o pega el texto.'
      );
    }
  };

  const cleanResult = (next: ParsedRoutineResult): ParsedRoutineResult => {
    next.months.forEach((mo) => {
      mo.d.forEach((d) => {
        d.b = d.b.filter((b) => b[1].length > 0);
      });
      mo.d = mo.d.filter((d) => d.b.length > 0);
    });
    next.months = next.months.filter((m) => m.d.length > 0);
    next.nex = next.months.reduce(
      (a, m) => a + m.d.reduce((b, d) => b + d.b.reduce((c, bl) => c + bl[1].length, 0), 0),
      0
    );
    next.ndays = next.months.reduce((a, m) => a + m.d.length, 0);
    if (!next.nex) setMsg('Ya no quedan ejercicios en la vista previa.');
    return next;
  };

  const handleCommit = (startToday: boolean) => {
    if (!res || !res.nex) return;
    const months: MonthPlan[] = res.months.map((mo) => ({
      id: uid(),
      n: String(mo.n || '').trim() || 'Rutina importada',
      f: '',
      d: mo.d.map((d) => ({
        n: String(d.n || '').trim() || 'Día',
        wd: d.wd,
        t: String(d.t || '').trim(),
        note: '',
        b: d.b.map((b) => {
          const exercises: PlanExercise[] = b[1]
            .map((x) => {
              const o: PlanExercise = {
                n: String(x.n || '').trim(),
                s: String(x.s || ''),
                r: String(x.r || ''),
                kg: String(x.kg || '').replace(',', '.'),
                rest: String(x.rest || ''),
                o: String(x.o || ''),
                l: '',
              };
              if (x.bw) o.bw = '1';
              if (x.mt === 'time') o.mt = 'time';
              if (x.u === 'lb') o.u = 'lb';
              return o;
            })
            .filter((x) => x.n);
          return b[2] ? ([b[0], exercises, b[2]] as const) : ([b[0], exercises] as const);
        }) as MonthPlan['d'][number]['b'],
      })),
    }));

    haptic('success');
    onSaveMonths(months, startToday);
    setRes(null);
    setText('');
    setMsg('');
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} os={os} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold tracking-tight">
            Importar rutina
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-sm text-[var(--mut)] px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="tf-card p-4 space-y-3">
          <label className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-white border border-[#E0C8FF]/35 bg-gradient-to-br from-[#A259FF]/80 to-[#321C6A]/95 cursor-pointer">
            <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <b className="block text-sm">Elegir archivo</b>
              <small className="block text-xs text-white/80">
                PDF, Word (.docx) o texto (.txt, .csv)
              </small>
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          <div>
            <small className="text-xs text-[var(--mut)]">
              o pega aquí el texto de tu rutina
            </small>
            <textarea
              rows={6}
              className="tf-input w-full mt-1.5 p-3 text-sm"
              placeholder={'Día 1 - Pierna\nSentadilla 4x8 60kg desc 2min\nPlancha 3 x 45s'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              haptic('light');
              analyze(text, fileName);
            }}
            className="tf-btn-pri w-full min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer"
          >
            Analizar texto
          </button>

          {msg && <p className="text-xs text-[var(--mut)]">{msg}</p>}
          {isLinkedAthlete && (
            <p className="text-xs text-[var(--mut)]">
              Si tu entrenador te envía un plan, puede reemplazar esta rutina al sincronizar.
            </p>
          )}
        </div>

        {res && res.nex > 0 && (
          <div className="space-y-3">
            <div className="tf-card p-4 space-y-2">
              <b className="text-sm block">Vista previa</b>
              <p className="text-xs text-[var(--mut)]">
                {res.nex} ejercicio(s) · {res.ndays} día(s). Revisa y corrige antes de guardar.
              </p>
              {res.warn.map((w, i) => (
                <p key={i} className="text-xs text-[var(--ac2)]">
                  ⚠ {w}
                </p>
              ))}
              {res.nIgn > 0 && (
                <details className="pt-1">
                  <summary className="text-xs text-[var(--mut)] cursor-pointer">
                    {res.nIgn} línea(s) sin reconocer
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {res.ignored.map((ln, i) => (
                      <div key={i} className="text-[11px] text-[var(--mut)]">
                        {ln}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {res.months.map((mo, mi) => (
              <div key={mi} className="tf-card p-4 space-y-3">
                <input
                  type="text"
                  className="tf-input w-full px-3 py-2 text-sm font-bold"
                  value={mo.n}
                  onChange={(e) => {
                    const next = structuredClone(res);
                    next.months[mi].n = e.target.value;
                    setRes(next);
                  }}
                />

                {mo.d.map((d, di) => (
                  <div
                    key={di}
                    className="pt-3 border-t border-[var(--line)]/60 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="tf-input flex-1 px-2.5 py-1.5 text-sm"
                        value={d.n}
                        onChange={(e) => {
                          const next = structuredClone(res);
                          next.months[mi].d[di].n = e.target.value;
                          setRes(next);
                        }}
                      />
                      <input
                        type="text"
                        className="tf-input flex-[1.4] px-2.5 py-1.5 text-sm"
                        placeholder="Título"
                        value={d.t}
                        onChange={(e) => {
                          const next = structuredClone(res);
                          next.months[mi].d[di].t = e.target.value;
                          setRes(next);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = structuredClone(res);
                          next.months[mi].d.splice(di, 1);
                          setRes(cleanResult(next));
                        }}
                        aria-label="Quitar día"
                        className="text-[var(--danger)] px-2 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    <span className="block text-xs text-[var(--mut)]">{WD[d.wd]}</span>

                    {d.b.map(
                      (b, bi) =>
                        b[1].length > 0 && (
                          <div key={bi} className="space-y-2 pt-1">
                            <b className="text-xs text-[var(--ac2)]">
                              {b[0]}
                              {b[2] && b[2].c ? ` · Circuito ${b[2].r} rondas` : ''}
                            </b>
                            {b[1].map((x, xi) => {
                              const isCirc = !!(b[2] && b[2].c);
                              const fields = isCirc
                                ? ([
                                    ['r', x.mt === 'time' ? 'Tiempo' : 'Reps'],
                                    ['kg', 'Kg'],
                                    ['o', 'Nota'],
                                  ] as const)
                                : ([
                                    ['s', 'Series'],
                                    ['r', x.mt === 'time' ? 'Tiempo' : 'Reps'],
                                    ['kg', x.bw ? 'Lastre' : 'Kg'],
                                    ['rest', 'Desc.'],
                                  ] as const);

                              return (
                                <div key={xi} className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      className="tf-input flex-1 px-2.5 py-1.5 text-sm"
                                      value={x.n}
                                      onChange={(e) => {
                                        const next = structuredClone(res);
                                        next.months[mi].d[di].b[bi][1][xi].n = e.target.value;
                                        setRes(next);
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = structuredClone(res);
                                        next.months[mi].d[di].b[bi][1].splice(xi, 1);
                                        setRes(cleanResult(next));
                                      }}
                                      aria-label="Quitar ejercicio"
                                      className="text-[var(--danger)] px-2 cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <div
                                    className={`grid gap-1.5 ${
                                      isCirc ? 'grid-cols-3' : 'grid-cols-4'
                                    }`}
                                  >
                                    {fields.map(([k, lbl]) => (
                                      <label key={k} className="text-[11px] text-[var(--mut)]">
                                        {lbl}
                                        <input
                                          type="text"
                                          className="tf-input w-full mt-0.5 px-1.5 py-1.5 text-center text-xs"
                                          value={String(x[k] || '')}
                                          onChange={(e) => {
                                            const next = structuredClone(res);
                                            (next.months[mi].d[di].b[bi][1][xi] as unknown as Record<string, string>)[k] =
                                              e.target.value;
                                            setRes(next);
                                          }}
                                        />
                                      </label>
                                    ))}
                                  </div>
                                  {(x.bw || x.mt === 'time') && (
                                    <div className="text-[11px] text-[var(--mut)]">
                                      {x.bw ? 'Peso corporal' : ''}
                                      {x.bw && x.mt === 'time' ? ' · ' : ''}
                                      {x.mt === 'time' ? 'Por tiempo' : ''}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )
                    )}
                  </div>
                ))}
              </div>
            ))}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleCommit(false)}
                className="tf-btn-pri w-full min-h-[50px] rounded-xl text-sm font-semibold cursor-pointer"
              >
                Guardar en mi plan
              </button>
              <button
                type="button"
                onClick={() => handleCommit(true)}
                className="w-full min-h-[46px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
              >
                Guardar y empezar hoy
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
