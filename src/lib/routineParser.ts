import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fm } from './metrics';
import type { Block, BlockConfig, PlanExercise } from '../types/trazik';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
} catch {
  // ignore
}

export interface ParsedExercise extends PlanExercise {
  g?: number;
}

export interface ParsedDay {
  n: string;
  wd: number;
  t: string;
  note: string;
  b: Block[];
  wk?: string;
}

export interface ParsedMonth {
  n: string;
  d: ParsedDay[];
}

export interface ParsedRoutineResult {
  months: ParsedMonth[];
  warn: string[];
  ignored: string[];
  nIgn: number;
  nex: number;
  ndays: number;
}

const IMPR = {
  day: /^(?:d[ií]a|day|sesi[oó]n|session|rutina|routine|entrenamiento|entreno|workout)\s*(?:n[°ºo.]*\s*)?(\d+|[A-Za-z])(?![A-Za-zÀ-ÿ])\s*[:\-–—.)]?\s*(.*)$/i,
  wk: /^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s*[:\-–—.]?\s*(.*)$/i,
  mon: /^(mes|month|fase|phase)\s*(\d+)\b\s*[:\-–—.]?\s*(.*)$/i,
  wee: /^(semana|week)\s*(\d+)\b\s*[:\-–—.]?\s*(.*)$/i,
  blk: /^(calentamiento|warm.?up|activaci[oó]n|movilidad|principal|fuerza|accesorios?|core|abdominales|abs|finalizador|finisher|enfriamiento|cool.?down|estiramientos?|cardio|t[eé]cnica)\s*[:\-–—]?\s*$/i,
  cir: /^(circuito|circuit|estaciones|stations?)\b(.*)$/i,
  skip: /^(notas?|observaciones?|obs|nota|importante|recomendaciones?|objetivo|objetivos|nombre|atleta|cliente|entrenador|fecha|p[aá]gina|page)\b/i,
};

const IMPWD: Record<string, number> = {
  lunes: 1,
  monday: 1,
  martes: 2,
  tuesday: 2,
  mi: 3,
  wednesday: 3,
  jueves: 4,
  thursday: 4,
  viernes: 5,
  friday: 5,
  sa: 6,
  saturday: 6,
  domingo: 0,
  sunday: 0,
};

const impWd = (w: string): number => {
  const k = w.toLowerCase().replace(/[éáí]/g, (c) => ({ é: 'e', á: 'a', í: 'i' }[c] || c));
  if (/^mie/.test(k)) return 3;
  if (/^sab/.test(k)) return 6;
  return IMPWD[k] ?? 1;
};

const impCap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);
const impNum = (v: string) => String(v).replace(',', '.');

function impT(v: string, u?: string): string {
  let s: number;
  const val = String(v).replace(',', '.');
  if (val.includes(':')) {
    const p = val.split(':').map(Number);
    s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  } else {
    const n = parseFloat(val);
    s = /^(m|min|mins|minutos?|')$/i.test(u || '') ? Math.round(n * 60) : Math.round(n);
  }
  return fm(s);
}

function impRest(v: string, u?: string): string {
  const val = String(v).replace(',', '.');
  if (val.includes(':')) return val;
  const n = parseFloat(val);
  if (/^(m|min|mins|minutos?|')$/i.test(u || '')) return n + 'min';
  if (u) return n + 's';
  return n < 10 ? n + 'min' : n + 's';
}

type ColMap = Record<string, number> & { sp?: number };

export function impEx(raw: string, col: ColMap | null): ParsedExercise | null {
  const l = String(raw)
    .replace(/^[\s•●▪■□☐✓✔►▶▸◦·*\-–—>]+/, '')
    .replace(/^\(?\d{1,2}[.)]\s+(?=[A-Za-zÀ-ÿ])/, '')
    .replace(/^[A-Da-d]\d?[.)]\s+(?=[A-Za-zÀ-ÿ])/, '')
    .trim();
  if (!l) return null;
  if (/^(desc(?:anso)?|rest|pausa|recuperaci[oó]n)\b/i.test(l)) return null;

  const ex: ParsedExercise = { n: '', s: '', r: '', kg: '', rest: '', o: '', l: '', bw: '', mt: '', u: '', g: 0 };
  const cellsAll = l.split(/\t| \| |\s{3,}/).map((c) => c.trim());
  const cells = col && /\t| \| /.test(l) ? cellsAll : cellsAll.filter(Boolean);
  let useCol = col;
  let cl = cells;

  if (col && col.sp) {
    const m = l.match(/^(.*?[A-Za-zÀ-ÿ)])\s+(\d[\d\s.,:a-zA-Z%/-]*)$/);
    if (m) {
      const toks =
        m[2].match(/\d+(?:[.,:]\d+)*(?:-\d+)?(?:\s*(?:kg|kgs|lb|lbs|seg|segs|min|s|%))?|[A-Za-z]+/g) || [];
      const ord = Object.keys(col)
        .filter((k) => k !== 'n' && k !== 'sp')
        .sort((a, b) => col[a] - col[b]);
      cl = [];
      cl[col.n] = m[1];
      ord.forEach((k, i) => {
        cl[col[k]] = toks[i] || '';
      });
    } else {
      useCol = null;
    }
  }

  if (useCol && cl.filter(Boolean).length >= 2) {
    const col2 = useCol;
    const get = (k: string) => (col2[k] !== undefined ? cl[col2[k]] || '' : '');
    ex.n = get('n').replace(/^\d+[.)]\s*/, '');
    if (!/[A-Za-zÀ-ÿ]{2}/.test(ex.n)) return null;
    const rr = get('r');
    const ss = get('s');
    const kk = get('kg');
    const dd = get('rest');
    if (ss) {
      const m = ss.match(/\d+/);
      ex.s = m ? m[0] : '';
    }
    if (rr) {
      const tm =
        rr.match(/^(\d+(?::\d{2})?)\s*(min|mins|minutos?|seg|segs|segundos?|s|"|')$/i) ||
        rr.match(/^(\d{1,2}:\d{2})$/);
      if (tm) {
        ex.mt = 'time';
        ex.r = impT(tm[1], tm[2] || '');
      } else {
        ex.r = rr.replace(/\s*[aà]\s*/, '-');
      }
    }
    if (kk) {
      if (/pc|corporal|bw|body/i.test(kk)) ex.bw = '1';
      const m = kk.match(/(\d+(?:[.,]\d+)?)\s*(kg|lb|lbs)?/i);
      if (m) {
        ex.kg = impNum(m[1]);
        if (/lb/i.test(m[2] || '')) ex.u = 'lb';
      }
    }
    if (dd) {
      const m = dd.match(/(\d+(?::\d{2})?(?:[.,]\d+)?)\s*(min|mins|minutos?|seg|segs|segundos?|s|"|')?/i);
      if (m) ex.rest = impRest(m[1], m[2]);
    }
    ex.o = get('o');
    return ex;
  }

  let w = ' ' + l + ' ';
  let took = 0;
  const notes: string[] = [];
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = w.match(re);
    if (m) {
      fn(m);
      w = w.replace(re, ' ');
      took++;
      return true;
    }
    return false;
  };

  take(
    /[\s(,;·|]*(?:desc(?:anso)?\.?|rest|pausa|rec(?:up(?:eraci[oó]n)?)?\.?)\s*[:=-]?\s*(\d+(?:[.,]\d+)?(?::\d{2})?)\s*(minutos?|mins?|min|m|segundos?|segs?|seg|s|"|'|′|″)?(?![A-Za-z])\)?/i,
    (m) => {
      ex.rest = impRest(m[1], m[2]);
    }
  );
  take(/\(\s*(\d+)\s*(?:"|''|″|seg|s)\s*\)/i, (m) => {
    if (!ex.rest) ex.rest = m[1] + 's';
  });
  take(/(?:con\s+)?lastre\s*[:+]?\s*\+?\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|lb|lbs)?/i, (m) => {
    ex.bw = '1';
    ex.kg = impNum(m[1]);
    if (/lb/i.test(m[2] || '')) ex.u = 'lb';
  });
  take(/\+\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|lb|lbs)\b/i, (m) => {
    ex.bw = '1';
    ex.kg = impNum(m[1]);
    if (/lb/i.test(m[2])) ex.u = 'lb';
  });
  take(/\b(?:peso\s+corporal|bodyweight|body\s*weight|bw)\b/i, () => {
    ex.bw = '1';
  });
  take(/(?<![A-Za-z])p\.?c\.?(?![A-Za-z])/i, () => {
    ex.bw = '1';
  });
  take(/(?:@|\bcon\s+|\ba\s+)?\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|kilogramos?|lb|lbs|libras?)(?![A-Za-z])/i, (m) => {
    if (!ex.kg) ex.kg = impNum(m[1]);
    if (/^lb|^libra/i.test(m[2])) ex.u = 'lb';
  });
  take(/@\s*(\d+(?:[.,]\d+)?)(?![\d%A-Za-z])/, (m) => {
    if (!ex.kg) ex.kg = impNum(m[1]);
  });
  take(/\b(?:rpe|rir)\s*[:@]?\s*(\d+(?:[.,]\d)?)/i, (m) => {
    notes.push(m[0].trim().toUpperCase());
  });
  take(/(\d{2,3})\s*%(?:\s*(?:del\s*)?(?:1rm|rm))?/i, (m) => {
    notes.push(m[1] + '%');
  });
  take(/(?:\btempo\s*[:=]?\s*)?\b(\d)-(\d)-(\d)(?:-(\d|x))\b/i, (m) => {
    notes.push('Tempo ' + m[0]);
  });

  if (
    !take(
      /(\d+)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(minutos?|mins?|min|segundos?|segs?|seg|s|"|'|′|″)(?![A-Za-z])/i,
      (m) => {
        ex.mt = 'time';
        ex.s = m[1];
        ex.r = impT(m[2], m[3]);
      }
    )
  ) {
    if (
      !take(/(\d+)\s*[x×*]\s*(\d{1,2}:\d{2})(?!\d)/, (m) => {
        ex.mt = 'time';
        ex.s = m[1];
        ex.r = impT(m[2], '');
      })
    ) {
      take(
        /(\d+)\s*[x×*]\s*(\d+(?:\s*[-–a]\s*\d+)?|fallo|failure|amrap|max)(?![A-Za-z0-9])/i,
        (m) => {
          ex.s = m[1];
          ex.r = m[2].replace(/(\d)\s*[a–]\s*(\d)/g, '$1-$2').replace(/\s/g, '');
        }
      );
    }
  }

  if (!ex.s) {
    take(/(\d+)(?:\s*[-–]\s*\d+)?\s*(?:series?|sets?|rondas?|rounds?)(?![A-Za-z])/i, (m) => {
      ex.s = m[1];
    });
  }
  if (!ex.r) {
    if (
      !take(/(\d+(?:\s*[-–]\s*\d+)?)\s*(?:reps?|repeticiones?|rep\.?)(?![A-Za-z])/i, (m) => {
        ex.r = m[1].replace(/\s/g, '');
      })
    ) {
      if (
        !take(
          /(\d+(?::\d{2})?(?:[.,]\d+)?)\s*(minutos?|mins?|min|segundos?|segs?|seg|s|"|′|″)(?![A-Za-z])/i,
          (m) => {
            ex.mt = 'time';
            ex.r = impT(m[1], m[2]);
          }
        )
      ) {
        take(/(?:^|\s)[x×]\s*(\d+)(?![A-Za-z0-9])/i, (m) => {
          ex.r = m[1];
        });
      }
    }
  }

  let name = w
    .replace(/[()[\]{}:;|]+/g, ' ')
    .replace(/\s[-–—]\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!ex.r && !ex.s) {
    const m = name.match(/^(\d{1,3})\s+(?=[A-Za-zÀ-ÿ])/);
    if (m) {
      ex.r = m[1];
      name = name.slice(m[0].length);
      took++;
    }
  }
  name = name
    .replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '')
    .replace(/\b(?:de|con|a|x|por|en)$/i, '')
    .trim();
  if (!/[A-Za-zÀ-ÿ]{3}/.test(name) || name.split(' ').length > 9) return null;
  ex.n = name;
  if (notes.length) ex.o = notes.join(' · ');
  if (!took) ex.g = 1;
  return ex;
}

export function impParse(text: string, fname?: string): ParsedRoutineResult {
  const W: string[] = [];
  const ign: string[] = [];
  const months: ParsedMonth[] = [];
  let cm: ParsedMonth | null = null;
  let cd: (Omit<ParsedDay, 'wd'> & { wd: number | null }) | null = null;
  const getCd = (): (Omit<ParsedDay, 'wd'> & { wd: number | null }) | null => cd;
  let cb: Block | null = null;
  let wk = '';
  let colMap: ColMap | null = null;
  let title = '';
  let guess = 0;
  let assumed = 0;

  const lines = String(text || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''));

  const ensM = () => {
    if (!cm) {
      cm = { n: '', d: [] };
      months.push(cm);
    }
    return cm;
  };
  const newD = (n?: string, wd?: number | null, t?: string) => {
    const m = ensM();
    cd = {
      n: n || 'Día ' + (m.d.length + 1),
      wd: wd === undefined ? null : wd,
      t: t || '',
      note: '',
      b: [],
      wk,
    };
    m.d.push(cd as ParsedDay);
    cb = null;
    return cd;
  };
  const ensB = (name: string, cfg?: BlockConfig) => {
    if (!cd) newD();
    let b = cfg ? null : cd!.b.find((x) => x[0] === name && !x[2]);
    if (!b) {
      b = cfg ? [name, [], cfg] : [name, []];
      cd!.b.push(b);
    }
    cb = b;
    return b;
  };

  const hdrWords: Record<string, RegExp> = {
    n: /^(ejercicio|exercise|movimiento|nombre|name)/i,
    s: /^(series?|sets?)/i,
    r: /^(reps?|repeticiones|tiempo|time|rep)/i,
    kg: /^(peso|kg|carga|load|weight)/i,
    rest: /^(desc|rest|pausa)/i,
    o: /^(notas?|obs|comentarios?|notes?)/i,
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const l = raw.replace(/^[\s•●▪■□☐✓✔►▶▸◦·*]+/, '').trim();
    if (!l) continue;

    let m: RegExpMatchArray | null;
    const hc = l
      .split(/\t+| \| |\s{3,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (hc.length < 3) {
      const ws = l.split(/\s+/);
      if (ws.length >= 3 && ws.length <= 8) {
        const mp: ColMap = {};
        ws.forEach((c, k) => {
          for (const key in hdrWords) {
            if (mp[key] === undefined && hdrWords[key].test(c)) mp[key] = k;
          }
        });
        if (mp.n === 0 && Object.keys(mp).length >= 3) {
          mp.sp = 1;
          colMap = mp;
          continue;
        }
      }
    }
    if (hc.length >= 3) {
      const mp: ColMap = {};
      hc.forEach((c, k) => {
        for (const key in hdrWords) {
          if (mp[key] === undefined && hdrWords[key].test(c)) mp[key] = k;
        }
      });
      if (mp.n !== undefined && Object.keys(mp).length >= 3) {
        colMap = mp;
        continue;
      }
    }

    if (IMPR.skip.test(l) && !/\d\s*[x×]\s*\d/.test(l)) {
      ign.push(l);
      continue;
    }
    if ((m = l.match(IMPR.mon))) {
      const nm = (/^(fase|phase)/i.test(m[1]) ? 'Fase ' : 'Mes ') + m[2];
      cm = { n: nm, d: [] };
      months.push(cm);
      cd = null;
      cb = null;
      wk = '';
      continue;
    }
    if ((m = l.match(IMPR.wee))) {
      wk = 'S' + m[2];
      cd = null;
      cb = null;
      continue;
    }
    if ((m = l.match(IMPR.day))) {
      const k = m[1];
      const t = (m[2] || '').replace(/^[\s:\-–—.]+/, '');
      if (!/\d\s*[x×]\s*\d/.test(t) && t.length < 60) {
        newD('Día ' + (/^\d+$/.test(k) ? k : k.toUpperCase()), undefined, t);
        continue;
      }
    }
    if ((m = l.match(IMPR.wk))) {
      const rest = (m[2] || '').replace(/^[\s:\-–—.]+/, '');
      if (!impEx(rest, null) || !/\d/.test(rest)) {
        newD(impCap(m[1]), impWd(m[1]), rest);
        continue;
      }
    }
    if ((m = l.match(IMPR.cir))) {
      const rondas = (m[2].match(/(\d+)\s*(?:rondas?|rounds?|vueltas?)/i) || [])[1];
      const dr = m[2].match(/desc(?:anso)?\.?\s*[:-]?\s*(\d+(?::\d{2})?)\s*(min|m|s|seg)?/i);
      ensB('Circuito', { c: 1, r: rondas || '3', rest: dr ? impRest(dr[1], dr[2]) : '90s' });
      continue;
    }
    if ((m = l.match(IMPR.blk))) {
      ensB(impCap(m[1].replace(/\s+/g, ' ')));
      continue;
    }

    const ex = impEx(l, colMap);
    const upper =
      /^[^a-zà-ÿ]*[A-ZÀ-Ý][^a-zà-ÿ]*$/.test(l.replace(/[:\s]/g, '') + '') && l.length < 50;

    if (ex && ex.g) {
      const words = l.split(' ').length;
      const sentence = /[.!?]$/.test(l) || words > 6 || /,/.test(l);
      const strong = upper || /:$/.test(l);
      if (sentence) {
        ign.push(l);
        continue;
      }
      const curCd = getCd();
      if (strong && curCd && !curCd.t && !curCd.b.some((b) => b[1].length)) {
        curCd.t = l.replace(/:$/, '');
        continue;
      }
      if (strong && (!curCd || curCd.b.some((b) => b[1].length))) {
        newD(undefined, undefined, l.replace(/:$/, ''));
        continue;
      }
      if (!cd) {
        const heady = (() => {
          for (let j = i + 1, c = 0; j < lines.length && c < 5; j++) {
            const t = lines[j].trim();
            if (!t) continue;
            c++;
            const tl = t.replace(/^[\s•●▪■□☐✓✔►▶▸◦·*]+/, '');
            if (
              IMPR.day.test(tl) ||
              IMPR.wk.test(tl) ||
              IMPR.mon.test(tl) ||
              IMPR.wee.test(tl) ||
              IMPR.blk.test(tl)
            ) {
              return true;
            }
            if (IMPR.skip.test(tl)) continue;
            const e2 = impEx(tl, colMap);
            if (e2 && !e2.g) return false;
          }
          return !lines.slice(i + 1).some((x) => x.trim());
        })();
        if (!title && heady && !months.some((x) => x.d.length)) {
          title = l;
          continue;
        }
      }
      if (!cd) newD();
      if (!cb) ensB(cd!.b.length ? cd!.b[cd!.b.length - 1][0] : 'Principal');
      const t = { ...ex, s: '3', r: '10' };
      cb![1].push(t);
      guess++;
      continue;
    }

    if (ex) {
      if (!cd) newD();
      if (!cb) ensB(cd!.b.length ? cd!.b[cd!.b.length - 1][0] : 'Principal');
      if (cb![2] && cb![2].c) {
        ex.s = '1';
        if (!ex.r) {
          ex.r = '10';
          assumed++;
        }
      } else {
        if (!ex.s && ex.r) {
          ex.s = '3';
          assumed++;
        } else if (!ex.s && !ex.r) {
          ex.s = '3';
          ex.r = '10';
          assumed++;
        } else if (ex.s && !ex.r) {
          ex.r = '10';
          assumed++;
        }
      }
      cb![1].push(ex);
      continue;
    }

    if (!title && !months.some((x) => x.d.length) && l.length < 70 && !cd) {
      title = l;
      continue;
    }
    ign.push(l);
  }

  const outM: ParsedMonth[] = [];
  months.forEach((mo) => {
    mo.d = mo.d.filter((d) => d.b.some((b) => b[1].length));
    if (mo.d.length) outM.push(mo);
  });

  const fname0 = String(fname || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  outM.forEach((mo) => {
    if (!mo.n) mo.n = (title && title.length <= 40 ? title : fname0) || 'Rutina importada';
    const rawDays = mo.d as unknown as (Omit<ParsedDay, 'wd'> & { wd: number | null })[];
    const need = rawDays.filter((d) => d.wd === null);
    const used = new Set(rawDays.filter((d) => d.wd !== null).map((d) => d.wd!));
    const T: Record<number, number[]> = {
      1: [1],
      2: [1, 4],
      3: [1, 3, 5],
      4: [1, 2, 4, 5],
      5: [1, 2, 3, 4, 5],
      6: [1, 2, 3, 4, 5, 6],
      7: [1, 2, 3, 4, 5, 6, 0],
    };
    if (!used.size && need.length <= 7 && T[need.length]) {
      need.forEach((d, i) => {
        d.wd = T[need.length][i];
      });
    } else {
      const pool = [1, 3, 5, 2, 4, 6, 0].filter((x) => !used.has(x));
      need.forEach((d, i) => {
        d.wd = pool.length ? pool[i % pool.length] : [1, 3, 5][i % 3];
      });
    }

    mo.d.forEach((d) => {
      if (d.wk) d.n = d.wk + ' · ' + d.n;
      delete d.wk;
      d.b = d.b.filter((b) => b[1].length);
      if (!d.b.length) d.b = [['Principal', []]];
      if (!d.t) d.t = '';
      d.b.forEach((b) =>
        b[1].forEach((x) => {
          const px = x as ParsedExercise;
          if (px.g) delete px.g;
          px.bw = px.bw ? '1' : '';
          if (!px.mt) px.mt = '';
          if (!px.u) delete px.u;
          if (b[2] && b[2].c) px.rest = '';
        })
      );
    });
  });

  const nex = outM.reduce(
    (a, mo) => a + mo.d.reduce((b, d) => b + d.b.reduce((c, bl) => c + bl[1].length, 0), 0),
    0
  );
  if (guess) W.push(guess + ' ejercicio(s) sin series ni repeticiones: se asumió 3 × 10.');
  if (assumed) W.push(assumed + ' ejercicio(s) con datos incompletos: se completaron con valores por defecto.');
  const wks = new Set<string>();
  outM.forEach((mo) =>
    mo.d.forEach((d) => {
      const m = String(d.n).match(/^(S\d+) · /);
      if (m) wks.add(m[1]);
    })
  );
  if (wks.size > 1) W.push('Se detectaron ' + wks.size + ' semanas: elimina las que no necesites.');

  return {
    months: outM,
    warn: W,
    ignored: ign.slice(0, 8),
    nIgn: ign.length,
    nex,
    ndays: outM.reduce((a, mo) => a + mo.d.length, 0),
  };
}

const docPt = (x: string) =>
  x
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');

async function docxText(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('nodoc');
  let x = await docFile.async('string');
  x = x.replace(
    /<w:tr[ >][\s\S]*?<\/w:tr>/g,
    (tr) =>
      [...tr.matchAll(/<w:tc[ >][\s\S]*?<\/w:tc>/g)]
        .map((c) => docPt(c[0]).replace(/\n+/g, ' ').trim())
        .join('\t') + '\n'
  );
  return docPt(x)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n');
}

async function pdfText(buf: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p);
    const tc = await pg.getTextContent();
    const lines: { y: number; it: { x: number; s: string; w: number }[] }[] = [];
    for (const rawItem of tc.items) {
      const it = rawItem as { str?: string; transform?: number[]; width?: number; height?: number };
      if (it.str === undefined || !it.transform) continue;
      const y = it.transform[5];
      const x = it.transform[4];
      const h = it.height || 10;
      let ln = lines.find((l) => Math.abs(l.y - y) <= Math.max(2, h * 0.4));
      if (!ln) {
        ln = { y, it: [] };
        lines.push(ln);
      }
      ln.it.push({ x, s: it.str, w: it.width || 0 });
    }
    lines.sort((a, b) => b.y - a.y);
    lines.forEach((l) => {
      l.it.sort((a, b) => a.x - b.x);
      let s = '';
      let px: number | null = null;
      l.it.forEach((t) => {
        if (px !== null) {
          const g = t.x - px;
          s += g > 18 ? '\t' : g > 1 && !/\s$/.test(s) && !/^\s/.test(t.s) ? ' ' : '';
        }
        s += t.s;
        px = t.x + t.w;
      });
      const z = s.replace(/[ \u00a0]+$/, '');
      if (z.trim()) out.push(z);
    });
    out.push('');
  }
  return out.join('\n');
}

export async function fileToText(f: File): Promise<string> {
  const n = (f.name || '').toLowerCase();
  const buf = await f.arrayBuffer();
  if (/\.docx$/.test(n) || /wordprocessingml/.test(f.type || '')) return docxText(buf);
  if (/\.pdf$/.test(n) || f.type === 'application/pdf') return pdfText(buf);
  if (/\.doc$/.test(n)) throw new Error('doc');
  let t = new TextDecoder('utf-8').decode(buf);
  if (/\.csv$/.test(n)) {
    t = t
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => (l.includes('"') ? l : l.replace(/[,;]/g, '\t')))
      .join('\n');
  }
  if (/\.rtf$/.test(n)) {
    t = t.replace(/\\par[d]?/g, '\n').replace(/\{\\[^}]*\}|\\[a-z]+-?\d* ?|[{}]/g, '');
  }
  return t;
}
