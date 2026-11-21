import type {
  AppState,
  CircuitIntervalTarget,
  DayPlan,
  Exercise,
  ExerciseSet,
  ExerciseType,
  IntervalPhase,
  LabelCustom,
  MetricKey,
  MonthPlan,
  PlanExercise,
  TrainingSession,
} from '../types/trazik';

export const MET: Record<MetricKey, string> = {
  kg: 'Carga (kg)',
  reps: 'Volumen (series×reps)',
  ton: 'Tonelaje',
  tmin: 'Tiempo',
  rpe: 'RPE',
};

export const UN: Record<MetricKey | 'min', string> = {
  kg: 'Carga máxima levantada, en kg',
  reps: 'Volumen = total de repeticiones (series × reps)',
  ton: 'Tonelaje = carga × repeticiones (con «Usar mi peso corporal»: peso corporal + lastre; por tiempo: 10 s = 1 repetición)',
  tmin: 'Tiempo bajo tensión, en minutos (ejercicios por tiempo)',
  min: 'Minutos de trabajo',
  rpe: 'Esfuerzo percibido (1–10)',
};

export const LB = 0.4536;
export const DN = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const MN = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const uid = () => Math.random().toString(36).slice(2, 8);

export const iso = (d: Date) =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');

export const pd = (s: string) => new Date(s + 'T12:00:00');

export const add = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const mon = (d: Date) => add(d, -((d.getDay() + 6) % 7));
export const todayStr = () => iso(new Date());
export const nz = (t: string | undefined) => String(t || '').trim().toLowerCase();
export const cleanName = (x: string | undefined) =>
  String(x || '')
    .replace(/["'<>`\\]/g, '')
    .trim()
    .slice(0, 30);

export const fdate = (d: string) =>
  d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d;

export const fdateShort = (d: string) =>
  d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d;

export const et = (e: Exercise): ExerciseType =>
  e.t || (e.sets.some((x) => parseFloat(String(x.a)) > 0) ? 'fuerza' : 'cali');

export const ty = (x: PlanExercise): ExerciseType =>
  parseFloat(String(x.kg)) > 0 ? 'fuerza' : 'cali';

export function secs(b: string | number | undefined): number {
  const v = String(b == null ? '' : b)
    .toLowerCase()
    .replace(',', '.')
    .trim();
  if (!v) return 0;
  let m = v.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) {
    return m[3] !== undefined
      ? +m[1] * 3600 + +m[2] * 60 + +m[3]
      : +m[1] * 60 + +m[2];
  }
  m = v.match(/^(\d+(?:\.\d+)?)\s*(min|m)\b/);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = v.match(/^(\d+(?:\.\d+)?)/);
  if (m) return Math.round(parseFloat(m[1]));
  return 0;
}

export function reps(b: string | number | undefined): number {
  const s = String(b || '')
    .toLowerCase()
    .replace(/^\s*\d+\s*x\s*(?=\d)/, '');
  const m = s.match(/(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(',', '.'));
  if (m[2]) n = (n + parseFloat(m[2].replace(',', '.'))) / 2;
  if (/lado|pierna/.test(s)) n *= 2;
  if (/seg/.test(s)) n /= 10;
  else if (/min/.test(s)) n *= 6;
  return n;
}

export function setM(e: Exercise, x: ExerciseSet, bw: number) {
  const t = et(e);
  const a = parseFloat(String(x.a)) || 0;
  if (t === 'res') {
    return {
      km: 0,
      min: (parseFloat(String(x.b)) || 0) / (e.u === 'seg' ? 60 : 1),
      reps: 0,
      kg: 0,
      ton: 0,
      tmin: 0,
    };
  }
  const k = e.u === 'lb' ? a * LB : a;
  const L = e.bw ? k + (bw || 0) : k;
  if (e.mt === 'time') {
    const q = secs(x.b);
    return { km: 0, min: 0, reps: q / 10, kg: k, ton: (L * q) / 10, tmin: q / 60 };
  }
  const r = reps(x.b);
  return { km: 0, min: 0, reps: r, kg: k, ton: L * r, tmin: 0 };
}

export function bwAt(S: AppState, u: string, d: string): number {
  const H = (S.bwh || [])
    .filter((x) => x.user === u)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (H.length) {
    let r = null;
    H.forEach((x) => {
      if (x.date <= d) r = x;
    });
    return +(r || H[0]).kg || 0;
  }
  return parseFloat(String((S.bwt || {})[u] || 0)) || 0;
}

export const bwFor = (S: AppState, s: TrainingSession) =>
  parseFloat(String(s.bw || 0)) || bwAt(S, s.user, s.date || todayStr());

export function isTimeEx(S: AppState, n: string): boolean {
  const k = nz(n);
  return (
    S.sessions.some(
      (s) => s.user === S.user && s.exercises.some((e) => nz(e.name) === k && e.mt === 'time')
    ) ||
    (S.plans[S.user] || []).some((m) =>
      (m.d || []).some((d) =>
        (d.b || []).some((b) => (b[1] || []).some((x) => nz(x.n) === k && x.mt === 'time'))
      )
    )
  );
}

const num = (v: unknown) => parseFloat(String(v || 0)) || 0;

export function tot(S: AppState, s: TrainingSession, only?: string) {
  const o = { series: 0, reps: 0, kg: 0, ton: 0, km: 0, min: 0, tmin: 0, rpe: 0 };
  const rp: number[] = [];
  const bwk = bwFor(S, s);
  s.exercises.forEach((e) => {
    if (only && e.name !== only) return;
    e.sets.forEach((x) => {
      const m = setM(e, x, bwk);
      o.series++;
      o.reps += m.reps;
      o.ton += m.ton;
      o.km += m.km;
      o.min += m.min;
      o.tmin += m.tmin;
      o.kg = Math.max(o.kg, m.kg);
      if (num(x.rpe)) rp.push(num(x.rpe));
    });
  });
  o.rpe = rp.length ? rp.reduce((a, b) => a + b, 0) / rp.length : 0;
  if (!only && num(s.rpe)) o.rpe = num(s.rpe);
  return o;
}

export function val(
  S: AppState,
  L: TrainingSession[],
  m: MetricKey | 'series' | 'km' | 'min',
  only?: string
): number {
  const t = L.map((s) => tot(S, s, only));
  if (!t.length) return 0;
  if (m === 'kg') return Math.max(...t.map((a) => a.kg));
  if (m === 'rpe') {
    const x = t.filter((a) => a.rpe);
    return x.length ? x.reduce((a, b) => a + b.rpe, 0) / x.length : 0;
  }
  return t.reduce((a, b) => a + b[m], 0);
}

export const fmt = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n * 10) / 10);

export const fm = (n: number) => {
  n = Math.max(0, Math.round(n));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const q = n % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(q).padStart(2, '0');
};

export function pRest(v: string | undefined): number {
  const s = String(v || '').toLowerCase().trim();
  if (!s) return 90;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(m|min|mins|minutos?)\b/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60);
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(s|seg|segs|segundos?)?\b/);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.'));
    return Math.round(!m[2] && n < 10 ? n * 60 : n);
  }
  return 90;
}

export function tmEl(s: TrainingSession | null): number {
  const t = s && s.tm;
  const v = t ? (t.acc || 0) + (t.st ? (Date.now() - t.st) / 1000 : 0) : 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export const onRange = (L: TrainingSession[], a: string, b: string) =>
  L.filter((s) => s.date >= a && s.date <= b);

export function buckets(g: 'w' | 'm', n: number) {
  const A = new Date();
  const o: { l: string; a: string; b: string }[] = [];
  if (g === 'w') {
    const m = mon(A);
    for (let i = n - 1; i >= 0; i--) {
      const a = add(m, -7 * i);
      o.push({ l: a.getDate() + '/' + (a.getMonth() + 1), a: iso(a), b: iso(add(a, 6)) });
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      const f = new Date(A.getFullYear(), A.getMonth() - i, 1);
      const l = new Date(A.getFullYear(), A.getMonth() - i + 1, 0);
      o.push({ l: MN[f.getMonth()], a: iso(f), b: iso(l) });
    }
  }
  return o;
}

const E = (
  n: string,
  s: string | number,
  r: string | number,
  kg: string | number = '',
  rest = '',
  o = '',
  l = ''
): PlanExercise => ({ n, s, r, kg, rest, o, l });

const D = (
  n: string,
  wd: number,
  t: string,
  note: string,
  w: PlanExercise[],
  m: PlanExercise[]
): DayPlan => ({
  n,
  wd,
  t,
  note,
  b: [
    ['Calentamiento', w],
    ['Principal', m],
  ],
});

const Y = 'https://www.youtube.com/';
const PALL = Y + 'shorts/iyuPba3EOaw';
const LM = Y + 'shorts/yv_2J_OsFbw';
const RT = Y + 'watch?v=tOhE8jUUE3Q';
const PAL = Y + 'shorts/PsOrl3qX7Jo';
const SB = Y + 'watch?v=E7qYhwQch9k';
const KB = 'https://www.instagram.com/reel/DXeZkIXCOs1/';
const MS = 'https://www.instagram.com/reels/DUHOGDfkbPi/';

export const PLAN = (): MonthPlan[] => [
  {
    id: uid(),
    n: 'Mes 1',
    f: 'Estabilidad y fuerza base',
    d: [
      D(
        'Día 1',
        2,
        'Estabilidad, core',
        'IMPORTANTE: movilidad articular general ~5 min',
        [
          E('Bicho muerto', 2, '30seg-1min', '', '1min', 'Repeticiones a un ritmo constante'),
          E('Press Pallof con banda', 2, '10 x lado', '', '1min', 'Core activado en todo momento, sin rotación de cadera', PALL),
        ],
        [
          E('Sentadilla isométrica', 4, '1x 30seg', '', '2min', 'Dos series con banda contrarrestando la rotación y dos con peso'),
          E('Landmine press', 3, '6-15', '', '2-3min', 'Potencia en el movimiento concéntrico', LM),
          E('Russian twists con disco', 2, '10', 5, '2min', '5 por cada lado', RT),
          E('PM paloma', 3, '6-8', '', '2min', 'Mantener el ángulo de la leve flexión de rodilla', PAL),
        ]
      ),
      D(
        'Día 2',
        4,
        'Tren superior',
        '',
        [
          E('Bicho muerto', 3, '30seg', '', '1min'),
          E('Pull ups escapulares', 2, '10', '', '2min', 'Concéntrico y excéntrico controlado'),
        ],
        [
          E('Dominadas', 3, '8', '', '2min', 'Con banda, RIR 2-3'),
          E('Press banca', 4, '8', 25, '2-3min', '1 serie de aproximación y 3 efectivas'),
          E('Remo con barra', 3, '8', 25, '2min', 'Mantener la inclinación del tronco en todas las repeticiones'),
          E('Press militar', 2, '6', 15, '2min', 'Control y activación de core para evitar arqueo lumbar excesivo'),
        ]
      ),
      D(
        'Día 3',
        5,
        'Tren inferior',
        'Viernes o sábado. Movilidad articular con enfoque en piernas. Descansar 2-3 min entre ejercicios que activen las mismas cadenas musculares.',
        [
          E('Bicho muerto', 3, '30seg', '', '2min'),
          E('Crab walks', 2, '16 reps', '', '2min', '8 repeticiones por pierna'),
          E('Sentadilla isométrica', 1, '60seg', '', '', 'Con banda pequeña a la altura de las rodillas'),
        ],
        [
          E('Sentadilla bombero', 2, '5 por pierna', 15, '2min', '', SB),
          E('Clean kettlebell', 2, '6', 5, '2min', '', KB),
          E('Sentadilla', 4, '6-8', 20, '3min'),
          E('Hip thrust', 3, '8', 30, '2-3min', 'En la última repetición, mantención isométrica de 10 seg'),
        ]
      ),
    ],
  },
  {
    id: uid(),
    n: 'Mes 2',
    f: 'Core y potencia',
    d: [
      D(
        'Día 1',
        2,
        'Core y potencia',
        '',
        [
          E('Crab walks con banda', 2, '10 x pierna', '', '2min'),
          E('Press Pallof con banda', 1, '10 x lado', '', '1min', 'Core activado sin rotación de cadera, en isometría de media sentadilla', PALL),
        ],
        [
          E('Salto cajón', 2, '8', '', '3min', 'Extensión completa de cadera; subir al cajón con la mínima flexión de rodillas'),
          E('Russian twist con balón medicinal o mancuerna', 3, '10 x lado', '', '3min', 'Lanzar con fuerza el balón; al rebote rotar instantáneamente, movimiento continuo'),
          E('Landmine press', 3, '8', 15, '2min', 'Potencia en el movimiento concéntrico', LM),
          E('Media sentadilla con cajón', 3, '6', '', '3min', 'Concéntrico potente, excéntrico lento y controlado. Peso: 1,5 × RM de sentadilla profunda', MS),
          E('PM paloma con banda en tobillo', 2, '8 x pierna', '', '2min', 'Misma flexión de rodilla en todo el rango de movimiento', PAL),
          E('Sentadilla isométrica con peso', 2, '1min', '', '2min'),
        ]
      ),
      D('Día 2', 4, 'Circuito concurrente', 'Por completar', [], []),
      D('Día 3', 5, 'Por definir', '', [], []),
    ],
  },
];

export const newDay = (i: number): DayPlan => ({
  n: 'Día ' + i,
  wd: [2, 4, 5, 6, 0, 1, 3][(i - 1) % 7],
  t: '',
  note: '',
  b: [
    ['Calentamiento', []],
    ['Principal', []],
  ],
});

export const newMonth = (existingCount: number): MonthPlan => ({
  id: uid(),
  n: 'Mes ' + (existingCount + 1),
  f: '',
  d: [1, 2, 3].map((i) => ({
    n: 'Día ' + i,
    wd: [2, 4, 5][i - 1],
    t: '',
    note: '',
    b: [
      ['Calentamiento', []],
      ['Principal', []],
    ],
  })),
});

export const newEx = (t: ExerciseType): Exercise => ({
  name: { fuerza: 'Nuevo ejercicio', cali: 'Calistenia', res: 'Running' }[t],
  t,
  u: t === 'res' ? 'min' : 'kg',
  sets: [{ a: '', b: '', rpe: '', done: false }],
});

export function exFrom(d: DayPlan): Exercise[] {
  const ex: Exercise[] = [];
  d.b.forEach((b) => {
    const c =
      b[2] && b[2].c
        ? {
            g: uid(),
            n: b[1].length,
            r: Math.max(1, parseInt(String(b[2].r)) || 3),
            rest: b[2].rest || '90s',
            ...(b[2].iv ? { iv: true } : {}),
            ...(b[2].iw ? { iw: b[2].iw } : {}),
            ...(b[2].it !== undefined ? { it: b[2].it } : {}),
            ...(b[2].ip !== undefined ? { ip: b[2].ip } : {}),
          }
        : null;
    b[1].forEach((x, k) => {
      const t = ty(x);
      ex.push({
        name: x.n,
        t,
        u: x.u || (t === 'res' ? 'min' : 'kg'),
        block: b[0],
        tg: (c ? c.r + ' rondas × ' + x.r : x.s + ' × ' + x.r) + (x.kg ? ' · ' + x.kg + 'kg' : ''),
        rest: c ? c.rest : x.rest,
        obs: x.o,
        link: x.l,
        ...(x.bw ? { bw: 1 } : {}),
        ...(x.mt === 'time' ? { mt: 'time' } : {}),
        ...(c
          ? {
              circ: {
                g: c.g,
                i: k + 1,
                n: c.n,
                r: c.r,
                rest: c.rest,
                ...(c.iv ? { iv: true } : {}),
                ...(c.iw ? { iw: c.iw } : {}),
                ...(c.it !== undefined ? { it: c.it } : {}),
                ...(c.ip !== undefined ? { ip: c.ip } : {}),
              },
            }
          : {}),
        sets: Array.from({ length: c ? c.r : Math.max(1, parseInt(String(x.s)) || 1) }, () => ({
          a: parseFloat(String(x.kg)) || '',
          b: x.r,
          rpe: '',
          done: false,
        })),
      });
    });
  });
  return ex;
}

export function buildCircuitIntervalPlan(target: CircuitIntervalTarget): IntervalPhase[] {
  const phases: IntervalPhase[] = [];
  const prep = Math.min(120, Math.max(0, Math.round(target.prepSec || 0)));
  const rounds = Math.min(50, Math.max(1, Math.round(target.rounds || 1)));
  const roundRest = Math.min(600, Math.max(0, Math.round(target.roundRestSec || 0)));
  const trans = Math.min(300, Math.max(0, Math.round(target.transSec || 0)));
  const defaultWork = Math.min(3600, Math.max(5, Math.round(target.workSec || 40)));
  const exs = target.exercises.length ? target.exercises : [{ name: target.title }];

  if (prep > 0) {
    phases.push({
      k: 'prep',
      d: prep,
      r: 0,
      label: target.title,
      station: `${exs.length} estaciones · ${rounds} rondas`,
    });
  }

  for (let r = 1; r <= rounds; r++) {
    for (let si = 0; si < exs.length; si++) {
      const ex = exs[si];
      const w = Math.min(3600, Math.max(5, Math.round(ex.workSec && ex.workSec > 0 ? ex.workSec : defaultWork)));
      phases.push({
        k: 'work',
        d: w,
        r,
        label: ex.name,
        station: `Estación ${si + 1}/${exs.length}`,
      });
      if (si < exs.length - 1 && trans > 0) {
        phases.push({
          k: 'rest',
          d: trans,
          r,
          label: `Siguiente: ${exs[si + 1].name}`,
          station: 'Cambio de estación',
        });
      }
    }
    if (r < rounds && roundRest > 0) {
      phases.push({
        k: 'rest',
        d: roundRest,
        r,
        label: 'Descanso entre rondas',
        station: `Ronda ${r}/${rounds} completada`,
      });
    }
  }
  return phases;
}

export function extractCircuitTargets(S: AppState): CircuitIntervalTarget[] {
  const targets: CircuitIntervalTarget[] = [];
  const today = todayStr();

  // 1) Circuits from user's calendar sessions (prioritize today & upcoming incomplete)
  const userSessions = S.sessions
    .filter((s) => s.user === S.user && s.sport === S.sport)
    .sort((a, b) => {
      const aToday = a.date === today ? 0 : a.date > today ? 1 : 2;
      const bToday = b.date === today ? 0 : b.date > today ? 1 : 2;
      if (aToday !== bToday) return aToday - bToday;
      return a.date.localeCompare(b.date);
    });

  for (const s of userSessions) {
    const groups = new Map<string, Exercise[]>();
    for (const ex of s.exercises) {
      if (ex.circ?.g) {
        const arr = groups.get(ex.circ.g) || [];
        arr.push(ex);
        groups.set(ex.circ.g, arr);
      }
    }
    groups.forEach((exs, groupId) => {
      const first = exs[0]?.circ;
      if (!first || exs.length === 0) return;
      const allDone = exs.every((ex) => ex.sets.length > 0 && ex.sets.every((st) => st.done));
      if (allDone && s.date < today) return;
      const blockLabel = exs[0].block || 'Circuito';
      targets.push({
        id: `ses:${s.id}:${groupId}`,
        title: `${s.name || 'Sesión'} · ${blockLabel}`,
        subtitle: `${fdateShort(s.date)} · ${exs.length} estaciones · ${first.r} rondas${first.iv ? ' · Vinculado' : ''}`,
        rounds: Math.max(1, first.r || 3),
        roundRestSec: pRest(first.rest),
        workSec: first.iw && first.iw > 0 ? first.iw : 40,
        transSec: first.it !== undefined ? first.it : 10,
        prepSec: first.ip !== undefined ? first.ip : 10,
        sessionId: s.id,
        groupId,
        autoComplete: true,
        exercises: exs.map((ex) => ({
          name: ex.name,
          workSec: ex.mt === 'time' ? secs(ex.sets[0]?.b) || undefined : undefined,
        })),
      });
    });
  }

  // 2) Circuits from active athlete's plans
  const plans = S.plans[S.user] || [];
  plans.forEach((m, mi) => {
    (m.d || []).forEach((d, di) => {
      (d.b || []).forEach((b, bi) => {
        if (b[2] && b[2].c && b[1].length > 0) {
          const cfg = b[2];
          targets.push({
            id: `plan:${m.id || mi}:${di}:${bi}`,
            title: `${m.n} · ${d.n} · ${b[0]}`,
            subtitle: `Plan · ${b[1].length} estaciones · ${Math.max(1, parseInt(String(cfg.r)) || 3)} rondas${cfg.iv ? ' · Vinculado' : ''}`,
            rounds: Math.max(1, parseInt(String(cfg.r)) || 3),
            roundRestSec: pRest(cfg.rest),
            workSec: cfg.iw && cfg.iw > 0 ? cfg.iw : 40,
            transSec: cfg.it !== undefined ? cfg.it : 10,
            prepSec: cfg.ip !== undefined ? cfg.ip : 10,
            exercises: b[1].map((x) => ({
              name: x.n,
              workSec: x.mt === 'time' ? secs(x.r) || undefined : undefined,
            })),
          });
        }
      });
    });
  });

  return targets;
}

export const getLabels = (lbl?: LabelCustom) => {
  const t = (k: keyof LabelCustom) => (typeof lbl?.[k] === 'string' ? lbl[k]!.trim() : '');
  const sing = t('sing') || 'atleta';
  const plu = t('plu') || (t('sing') ? sing + 's' : 'atletas');
  const add = t('add') || '+ Agregar ' + sing;
  return { sing, plu, add };
};

export const capWord = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

export const sesMes = (S: AppState, s: TrainingSession): MonthPlan | null => {
  const P = S.plans[s.user] || [];
  return (
    P.find((m) => m.id && m.id === s.mid) ||
    P.find((m) => s.name && String(s.name).indexOf(m.n + ' · ') === 0) ||
    null
  );
};

export const axMes = (S: AppState, s: TrainingSession) => {
  const o = sesMes(S, s);
  return (o && o.id) || '';
};

export function sanRemote<T>(v: T): T {
  if (typeof v === 'string') {
    return v.replace(/[<>"`]/g, '').replace(/^\s*javascript:/i, '') as unknown as T;
  }
  if (Array.isArray(v)) {
    return v.map(sanRemote) as unknown as T;
  }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor') continue;
      o[sanRemote(k)] = sanRemote(val);
    }
    return o as T;
  }
  return v;
}

export function normalizeState(raw: Partial<AppState>): AppState {
  const nowToday = todayStr();
  const base: AppState = {
    sport: 'Gimnasio',
    view: 'month',
    metric: 'reps',
    anchor: nowToday,
    sessions: [],
    user: '',
    users: [],
    plans: {},
    pm: 0,
    pg: 'w',
    pex: '',
    cdel: '',
    annex: [],
    axs: 1,
    role: '',
    msg: '',
    sy: '',
    prs: [],
    prx: [],
    bwt: {},
    bwh: [],
    prof: {},
    theme: 'dark',
    platform: 'auto',
    code: '',
    linked: {},
    ...raw,
  };

  if (base.plans['Vale']) {
    base.plans['vale'] = base.plans['Vale'].filter(
      (m) => !(m.n === 'Mes 1' && m.f === 'Estabilidad y fuerza base')
    );
    delete base.plans['Vale'];
    base.users = base.users.map((u) => (u === 'Vale' ? 'vale' : u));
    if (base.user === 'Vale') base.user = 'vale';
    base.pm = 0;
    base.sessions.forEach((x) => {
      if (x.user === 'Vale') x.user = 'vale';
    });
    base.sessions = base.sessions.filter(
      (x) => !(x.user === 'vale' && /^Mes 1 · /.test(x.name || ''))
    );
  }

  if (base.users.length > 0) {
    Object.values(base.plans || {}).forEach((p) =>
      (p || []).forEach((m) => {
        if (m && !m.id) m.id = uid();
      })
    );
    if (!base.users.includes(base.user)) base.user = base.users[0];
    if (!base.plans[base.user]) base.plans[base.user] = [];
    if (!base.plans[base.user][base.pm]) base.pm = 0;
  } else {
    base.user = '';
    base.pm = 0;
  }

  base.sport = 'Gimnasio';
  if (
    !['month', 'week', 'year', 'plan', 'prog', 'team', 'pr', 'perfil', 'int', 'admin'].includes(
      base.view
    ) ||
    (base.role === 'atleta' && base.view === 'team')
  ) {
    base.view = 'month';
  }
  if (!MET[base.metric]) base.metric = 'reps';

  return base;
}

export function createEmptyAuthState(prev?: Partial<AppState>): AppState {
  return {
    sport: 'Gimnasio',
    view: 'month',
    metric: prev?.metric || 'reps',
    anchor: todayStr(),
    sessions: [],
    user: '',
    users: [],
    plans: {},
    pm: 0,
    pg: prev?.pg || 'w',
    pex: '',
    cdel: '',
    annex: [],
    axs: 1,
    role: '',
    msg: '',
    sy: '',
    prs: [],
    prx: [],
    bwt: {},
    bwh: [],
    prof: {},
    theme: prev?.theme || 'dark',
    platform: 'auto',
    code: '',
    linked: {},
    mts: 0,
    cts: 0,
    ...(prev?.snd ? { snd: prev.snd } : {}),
    ...(prev?.notifEnabled !== undefined ? { notifEnabled: prev.notifEnabled } : {}),
  };
}

export function loadInitialState(): AppState {
  try {
    const rawStr = localStorage.getItem('plan_v1');
    const parsed = rawStr ? (JSON.parse(rawStr) as Partial<AppState>) : {};
    const hasCloudCtx = Boolean(localStorage.getItem('plan_v1_cloud_ctx'));
    if (!hasCloudCtx) {
      return createEmptyAuthState(parsed);
    }
    return normalizeState(parsed);
  } catch {
    return createEmptyAuthState();
  }
}

export function expCode(S: AppState, u: string): string {
  const o = {
    v: 1,
    user: u,
    plan: S.plans[u] || [],
    sessions: S.sessions.filter((x) => x.user === u),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(o))));
}

const activeScrollAnimMap = new WeakMap<HTMLElement, number>();

export function smoothScrollItemIntoView(el: HTMLElement | null, duration = 300): void {
  if (!el || typeof window === 'undefined') return;
  const parent = el.parentElement;
  if (!parent) return;

  const maxScroll = parent.scrollWidth - parent.clientWidth;
  if (maxScroll <= 1) return;

  const prevRaf = activeScrollAnimMap.get(parent);
  if (prevRaf !== undefined) {
    window.cancelAnimationFrame(prevRaf);
  }

  const elRect = el.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const elCenterInScroll = parent.scrollLeft + (elRect.left - parentRect.left) + elRect.width / 2;
  const targetLeft = Math.max(0, Math.min(maxScroll, elCenterInScroll - parent.clientWidth / 2));

  const startLeft = parent.scrollLeft;
  const delta = targetLeft - startLeft;
  if (Math.abs(delta) < 1.5) return;

  const startTime = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    parent.scrollLeft = startLeft + delta * eased;
    if (t < 1) {
      const id = window.requestAnimationFrame(step);
      activeScrollAnimMap.set(parent, id);
    } else {
      activeScrollAnimMap.delete(parent);
    }
  };
  const id = window.requestAnimationFrame(step);
  activeScrollAnimMap.set(parent, id);
}
