export type PlatformMode = 'auto' | 'ios' | 'android';
export type ResolvedOS = 'ios' | 'android';
export type UserRoleView = 'coach' | 'atleta' | '';
export type ActiveView =
  | 'team'
  | 'month'
  | 'week'
  | 'year'
  | 'plan'
  | 'prog'
  | 'pr'
  | 'int'
  | 'perfil'
  | 'admin';

export type MetricKey = 'kg' | 'reps' | 'ton' | 'tmin' | 'rpe';
export type ExerciseType = 'fuerza' | 'cali' | 'res';
export type IntervalMode = 'tabata' | 'hiit' | 'emom' | 'custom';
export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'past_due' | 'canceled';

export interface ExerciseSet {
  a: string | number;
  b: string | number;
  rpe?: string | number;
  done: boolean;
}

export interface CircuitMeta {
  g: string;
  i: number;
  n: number;
  r: number;
  rest: string;
  iv?: boolean;
  iw?: number;
  it?: number;
  ip?: number;
}

export interface Exercise {
  name: string;
  t?: ExerciseType;
  u?: string;
  block?: string;
  tg?: string;
  rest?: string;
  obs?: string;
  link?: string;
  bw?: number;
  mt?: 'time' | '';
  circ?: CircuitMeta;
  sets: ExerciseSet[];
}

export interface SessionTimer {
  st: number;
  acc: number;
  auto?: number;
}

export interface TrainingSession {
  id: string;
  user: string;
  date: string;
  sport: string;
  name?: string;
  mid?: string;
  exercises: Exercise[];
  rpe?: number;
  feel?: number;
  notes?: string;
  tm?: SessionTimer;
  bw?: number;
  ts?: number;
  finishedAt?: number;
  updatedBy?: 'coach' | 'atleta';
}

export interface PlanExercise {
  n: string;
  s: string | number;
  r: string | number;
  kg: string | number;
  rest: string;
  o: string;
  l: string;
  bw?: string;
  mt?: 'time' | '';
  u?: string;
}

export interface BlockConfig {
  c?: number;
  r?: string | number;
  rest?: string;
  iv?: boolean;
  iw?: number;
  it?: number;
  ip?: number;
}

export type Block = [string, PlanExercise[], BlockConfig?];

export interface DayPlan {
  n: string;
  wd: number;
  t: string;
  note: string;
  b: Block[];
}

export interface MonthPlan {
  id: string;
  n: string;
  f: string;
  d: DayPlan[];
}

export interface AnnexItem {
  id: string;
  name: string;
  kind: 'vid' | 'img';
  src: string;
  m: string;
}

export interface PersonalRecord {
  id: string;
  user: string;
  name: string;
  kg: number;
  reps: number;
  date: string;
  mt?: 'time' | '';
}

export interface TrackedPR {
  id: string;
  user: string;
  name: string;
}

export interface BodyWeightEntry {
  id: string;
  user: string;
  date: string;
  kg: number;
}

export interface ProfileClaim {
  uid: string;
  email: string;
  name: string;
  at: string;
}

export interface LabelCustom {
  sing?: string;
  plu?: string;
  add?: string;
}

export interface IntervalSettings {
  m: IntervalMode;
  cfg: Record<IntervalMode, Record<string, number>>;
}

export type SoundPreset = 'athletic' | 'chime' | 'pulse';

export interface SoundSettings {
  enabled: boolean;
  volume: number;
  preset: SoundPreset;
}

export interface AppState {
  sport: string;
  view: ActiveView;
  metric: MetricKey;
  anchor: string;
  sessions: TrainingSession[];
  user: string;
  users: string[];
  plans: Record<string, MonthPlan[]>;
  pm: number;
  pg: 'w' | 'm';
  pex: string;
  cdel: string;
  ccl?: string;
  annex: AnnexItem[];
  axs: number;
  role: UserRoleView;
  local?: boolean;
  msg: string;
  msg2?: string;
  sy: string;
  prs: PersonalRecord[];
  prx: TrackedPR[];
  bwt: Record<string, number>;
  bwh: BodyWeightEntry[];
  prof: Record<string, ProfileClaim>;
  theme: 'dark' | 'light';
  platform?: PlatformMode;
  code: string;
  linked: Record<string, string>;
  lbl?: LabelCustom;
  iv?: IntervalSettings;
  snd?: SoundSettings;
  notifEnabled?: boolean;
  mts?: number;
  cts?: number;
  mig3?: number;
}

export interface UserRoleState {
  ok: boolean;
  role: 'trainer' | 'athlete';
  admin: boolean;
  sub: { status?: SubscriptionStatus; plan?: string | null; currentPeriodEnd?: number | null; provider?: string | null } | null;
  ath?: string;
  err: string;
}

export interface InviteItem {
  id: string;
  to: string;
  coachUid: string;
  coachName: string;
  ts: number;
}

export interface AdminUserRow {
  uid: string;
  name: string;
  email: string;
  last: number;
  src: string;
  role: 'trainer' | 'athlete';
  admin: boolean;
  has: boolean;
  sub: SubscriptionStatus;
  draftRole: 'trainer' | 'athlete' | null;
  draftSub: SubscriptionStatus | null;
}

export interface RestTimerState {
  end: number;
  tot: number;
  base: number;
  done: boolean;
  doneAt?: number;
  paused: boolean;
  left: number;
  phase?: 'work' | 'rest';
  workLabel?: string;
  nextRestSec?: number;
  workLink?: {
    sid: string;
    exIdx: number;
    setIdx: number;
    workSec: number;
  };
}

export interface SetStopwatchState {
  sid: string;
  i: number;
  j: number;
  t0: number;
}

export interface IntervalPhase {
  k: 'prep' | 'work' | 'rest';
  d: number;
  r: number;
  label?: string;
  station?: string;
}

export interface CircuitIntervalTarget {
  id: string;
  title: string;
  subtitle?: string;
  rounds: number;
  roundRestSec: number;
  workSec: number;
  transSec: number;
  prepSec: number;
  sessionId?: string;
  groupId?: string;
  autoComplete?: boolean;
  exercises: Array<{
    name: string;
    workSec?: number;
  }>;
}

export interface ActiveIntervalRunner {
  mode: 'run';
  m: IntervalMode;
  plan: IntervalPhase[];
  cum: number[];
  total: number;
  acc: number;
  st: number;
  running: boolean;
  done: boolean;
  last: number;
  sec: number;
  circuit?: {
    title: string;
    rounds: number;
    sessionId?: string;
    groupId?: string;
    autoComplete?: boolean;
  };
}

export type NotificationKind = 'plan_change' | 'session_done' | 'next_session';
export type NotifPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  sessionId?: string;
  date?: string;
  athleteName?: string;
}

