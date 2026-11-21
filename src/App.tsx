import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, CheckCircle2, Maximize2, X } from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  batchDeleteSessionDocs,
  collectStorageUrlsFromSessions,
  collectStorageUrlsFromState,
  db,
  deleteUnusedStorageUrls,
  friendlyFirestoreError,
  googleProvider,
  isProjectStorageUrl,
  OWNER_EMAILS,
  stripUndefined,
  testConnection,
  uploadAnnexImage,
} from './lib/firebase';
import {
  beepRestFinished,
  DEFAULT_SOUND_SETTINGS,
  haptic,
  ivAlarm,
  playActionCue,
  playCountdownTick,
  playTimerPause,
  playTimerStart,
  releaseWakeLock,
  requestWakeLock,
  setSoundConfig,
  unlockAudio,
} from './lib/audioHaptics';
import {
  add,
  buildCircuitIntervalPlan,
  cleanName,
  createEmptyAuthState,
  exFrom,
  extractCircuitTargets,
  fdateShort,
  fm,
  iso,
  loadInitialState,
  mon,
  newEx,
  normalizeState,
  nz,
  parseWorkSeconds,
  pd,
  pRest,
  sanRemote,
  tmEl,
  todayStr,
  uid,
} from './lib/metrics';
import {
  buildSessionAlertSignature,
  dispatchSystemNotification,
  formatRelativeDayLabel,
  getNotificationPermission,
  isSessionFullyDone,
  loadNotificationWatermark,
  loadUserNotifications,
  requestNotificationPermission,
  saveNotificationWatermark,
  saveUserNotifications,
  type NotificationWatermark,
} from './lib/notifications';
import { usePlatform } from './hooks/usePlatform';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { InviteGateView } from './components/InviteGateView';
import { SplashScreen } from './components/SplashScreen';
import { OfflineIndicator } from './components/PWABanners';
import { NavigationShell } from './components/Navigation';
import { NotificationsSheet } from './components/NotificationsSheet';
import { DayPickerSheet } from './components/DayPickerSheet';
import { ProfileSheet } from './components/ProfileSheet';
import { CloudSheet } from './components/CloudSheet';
import { ImportRoutineSheet } from './components/ImportRoutineSheet';
import { AthleteWorkoutView } from './components/AthleteWorkoutView';
import { DeleteAthleteModal } from './components/DeleteAthleteModal';
import { TeamView } from './views/TeamView';
import { CalendarView } from './views/CalendarView';
import { PlanView } from './views/PlanView';
import { ProgressView } from './views/ProgressView';
import { PRView } from './views/PRView';
import { buildIntervalPlan, IVDEF, IntervalsView } from './views/IntervalsView';
import { ProfileView } from './views/ProfileView';
import { AdminView } from './views/AdminView';
import type {
  ActiveIntervalRunner,
  ActiveView,
  AppNotification,
  AppState,
  Block,
  BlockConfig,
  CircuitIntervalTarget,
  DayPlan,
  IntervalMode,
  InviteItem,
  MetricKey,
  MonthPlan,
  NotifPermissionState,
  PlanExercise,
  RestTimerState,
  SoundSettings,
  TrainingSession,
  UserRoleState,
} from './types/trazik';

const ROLE_CACHE_KEY = 'plan_v1_role';
const REST_STORAGE_KEY = 'plan_v1_rest';
const PENDING_SIGNUP_NAME_KEY = 'plan_v1_pending_signup_name';

const EMPTY_ROLE: UserRoleState = {
  ok: false,
  role: 'athlete',
  admin: false,
  sub: null,
  err: '',
};

function loadSavedRestTimer(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(REST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestTimerState;
    if (!parsed || typeof parsed.tot !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function encodeBlockForFirestore(b: Block): Record<string, unknown> {
  const ex = Array.isArray(b?.[1]) ? b[1] : [];
  const cfg = b?.[2];
  return stripUndefined({
    t: String(b?.[0] || ''),
    ex,
    ...(cfg ? { c: cfg } : {}),
  });
}

function decodeBlockFromFirestore(raw: unknown): Block {
  if (Array.isArray(raw)) {
    return [
      String(raw[0] || ''),
      Array.isArray(raw[1]) ? (raw[1] as PlanExercise[]) : [],
      raw[2] as BlockConfig | undefined,
    ];
  }
  if (raw && typeof raw === 'object') {
    const o = raw as { t?: unknown; title?: unknown; ex?: unknown; c?: unknown; cfg?: unknown };
    const ex = Array.isArray(o.ex) ? (o.ex as PlanExercise[]) : [];
    const cfg = (o.c ?? o.cfg) as BlockConfig | undefined;
    return cfg !== undefined
      ? [String(o.t ?? o.title ?? ''), ex, cfg]
      : [String(o.t ?? o.title ?? ''), ex];
  }
  return ['', []];
}

function encodeMonthListForFirestore(list: MonthPlan[]): Array<Record<string, unknown>> {
  return (Array.isArray(list) ? list : []).map((m) =>
    stripUndefined({
      ...m,
      d: (Array.isArray(m?.d) ? m.d : []).map((day: DayPlan) =>
        stripUndefined({
          ...day,
          b: (Array.isArray(day?.b) ? day.b : []).map(encodeBlockForFirestore),
        })
      ),
    })
  );
}

function decodeMonthListFromFirestore(raw: unknown): MonthPlan[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object'))
    .map((m) => ({
      id: String(m.id || uid()),
      n: String(m.n || ''),
      f: String(m.f || ''),
      d: (Array.isArray(m.d) ? m.d : []).map((dayRaw) => {
        const day = (dayRaw && typeof dayRaw === 'object' ? dayRaw : {}) as Record<
          string,
          unknown
        >;
        return {
          n: String(day.n || ''),
          wd: Number(day.wd || 0),
          t: String(day.t || ''),
          note: String(day.note || ''),
          b: (Array.isArray(day.b) ? day.b : []).map(decodeBlockFromFirestore),
        };
      }),
    }));
}

function encodePlansMapForFirestore(
  plansMap: Record<string, MonthPlan[]> | undefined
): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const [k, list] of Object.entries(plansMap || {})) {
    if (!k) continue;
    out[k] = encodeMonthListForFirestore(list || []);
  }
  return out;
}

function decodePlansMapFromFirestore(rawPlans: unknown): Record<string, MonthPlan[]> {
  if (!rawPlans || typeof rawPlans !== 'object') return {};
  const out: Record<string, MonthPlan[]> = {};
  for (const [k, v] of Object.entries(rawPlans as Record<string, unknown>)) {
    out[k] = decodeMonthListFromFirestore(v);
  }
  return out;
}

function buildFirestoreMetaMap(metaObj: {
  users: string[];
  plans: Record<string, MonthPlan[]>;
  prs: AppState['prs'];
  prx: AppState['prx'];
  bwh: AppState['bwh'];
  annex: AppState['annex'];
  axs: number;
}): Record<string, unknown> {
  return stripUndefined({
    users: metaObj.users,
    plans: encodePlansMapForFirestore(metaObj.plans),
    prs: metaObj.prs,
    prx: metaObj.prx,
    bwh: metaObj.bwh,
    annex: metaObj.annex,
    axs: metaObj.axs,
  });
}

function unwrapRawFirestoreObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.j === 'string') {
      try {
        const parsed = JSON.parse(obj.j);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : obj;
      } catch {
        return obj;
      }
    }
    return obj;
  }
  return null;
}

function safeDocDataToMeta(raw: unknown): Record<string, unknown> | null {
  const obj = unwrapRawFirestoreObject(raw);
  if (!obj) return null;
  if (obj.plans && typeof obj.plans === 'object') {
    return {
      ...obj,
      plans: decodePlansMapFromFirestore(obj.plans),
    };
  }
  return obj;
}

function safeDocDataToCplans(raw: unknown): Record<string, MonthPlan[]> | null {
  const obj = unwrapRawFirestoreObject(raw);
  if (!obj) return null;
  return decodePlansMapFromFirestore(obj);
}

function sanitizeSessionId(rawId: string): string {
  const cleaned = String(rawId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || uid();
}

function resolveAthleteCanonicalName(params: {
  user: User;
  userData?: Record<string, unknown> | null;
  remoteMeta?: Record<string, unknown> | null;
  remoteCplans?: Record<string, unknown> | null;
  fallbackName?: string;
}): string {
  const { user, userData, remoteMeta, remoteCplans, fallbackName } = params;

  const cplanKeys = remoteCplans
    ? Object.keys(remoteCplans)
        .map((k) => cleanName(k))
        .filter(Boolean)
    : [];
  if (cplanKeys.length > 0) return cplanKeys[0];

  const athField = cleanName(String(userData?.ath || ''));
  if (athField) return athField;

  const metaUsers = Array.isArray(remoteMeta?.users)
    ? (remoteMeta.users as unknown[]).map((u) => cleanName(String(u || ''))).filter(Boolean)
    : [];
  if (metaUsers.length > 0) return metaUsers[0];

  const docName = cleanName(String(userData?.name || ''));
  if (docName) return docName;

  const displayName = cleanName(user.displayName || '');
  if (displayName) return displayName;

  const emailName = cleanName((user.email || '').split('@')[0] || '');
  if (emailName) return emailName;

  const fb = cleanName(fallbackName || '');
  if (fb) return fb;

  return 'Atleta';
}

function parseFirestoreSession(
  id: string,
  raw: Record<string, unknown> | undefined,
  forcedUser?: string
): TrainingSession | null {
  if (!raw || typeof raw !== 'object') return null;
  try {
    let parsed: unknown = raw;
    if (typeof raw.j === 'string') {
      parsed = JSON.parse(raw.j);
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const clean = sanRemote(parsed) as TrainingSession;
    const tmExtra = clean.tm as (TrainingSession['tm'] & { fin?: number; by?: 'coach' | 'atleta' }) | undefined;
    const restoredFinishedAt =
      clean.finishedAt ?? (typeof tmExtra?.fin === 'number' ? tmExtra.fin : undefined);
    const restoredUpdatedBy =
      clean.updatedBy ??
      (tmExtra?.by === 'coach' || tmExtra?.by === 'atleta' ? tmExtra.by : undefined);
    return {
      ...clean,
      id: sanitizeSessionId(clean.id || id),
      ...(forcedUser ? { user: forcedUser } : {}),
      ...(restoredFinishedAt ? { finishedAt: restoredFinishedAt } : {}),
      ...(restoredUpdatedBy ? { updatedBy: restoredUpdatedBy } : {}),
    };
  } catch {
    return null;
  }
}

function buildFirestoreSessionPayload(s: TrainingSession, fixedTs?: number) {
  const safeId = sanitizeSessionId(s.id);
  const safeDate =
    s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : todayStr();

  const rawRpe = s.rpe !== undefined && s.rpe !== null && String(s.rpe) !== '' ? Number(s.rpe) : NaN;
  const safeRpe = Number.isFinite(rawRpe) ? Math.min(10, Math.max(0, rawRpe)) : undefined;

  const rawFeel = s.feel !== undefined && s.feel !== null && String(s.feel) !== '' ? Number(s.feel) : NaN;
  const safeFeel = Number.isFinite(rawFeel) ? Math.min(5, Math.max(0, rawFeel)) : undefined;

  const rawBw = s.bw !== undefined && s.bw !== null && String(s.bw) !== '' ? Number(s.bw) : NaN;
  const safeBw = Number.isFinite(rawBw) ? Math.min(500, Math.max(0, rawBw)) : undefined;

  const safeExercises = (Array.isArray(s.exercises) ? s.exercises : [])
    .filter((ex) => ex && typeof ex === 'object')
    .slice(0, 80);

  const hasTimerOrMeta = Boolean(s.tm || s.finishedAt || s.updatedBy);
  const safeTm = hasTimerOrMeta
    ? stripUndefined({
        st: Number(s.tm?.st || 0),
        acc: Number(s.tm?.acc || 0),
        ...(s.tm?.auto ? { auto: Number(s.tm.auto) } : {}),
        ...(s.finishedAt ? { fin: Number(s.finishedAt) } : {}),
        ...(s.updatedBy ? { by: s.updatedBy } : {}),
      })
    : undefined;

  // Strictly match firestore.rules isValidSession allowed keys:
  // ['id', 'user', 'date', 'sport', 'name', 'mid', 'exercises', 'rpe', 'feel', 'notes', 'tm', 'bw', 'ts']
  return stripUndefined({
    id: safeId,
    user: String(s.user || 'Atleta').slice(0, 60),
    date: safeDate,
    sport: String(s.sport || 'Gimnasio').slice(0, 40),
    name: typeof s.name === 'string' ? s.name.slice(0, 140) : undefined,
    mid: typeof s.mid === 'string' ? s.mid.slice(0, 64) : undefined,
    exercises: safeExercises,
    rpe: safeRpe,
    feel: safeFeel,
    notes: typeof s.notes === 'string' ? s.notes.slice(0, 2000) : undefined,
    tm: safeTm,
    bw: safeBw,
    ts: fixedTs !== undefined ? fixedTs : Number(s.ts || Date.now()),
  });
}

function buildFirestoreSessionSignature(s: TrainingSession): string {
  return JSON.stringify(buildFirestoreSessionPayload(s, 0));
}

function getSyncableAnnexes(annex: AppState['annex']) {
  return (annex || []).filter(
    (a) =>
      a.kind === 'vid' ||
      (a.kind === 'img' &&
        (isProjectStorageUrl(a.src) || String(a.src || '').startsWith('https://')))
  );
}

function MainApp() {
  const [S, setS] = useState<AppState>(() => loadInitialState());
  const { resolvedOS } = usePlatform('auto');

  const [me, setMe] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [splashMinDone, setSplashMinDone] = useState(false);
  const [bootSplashDone, setBootSplashDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [roleState, setRoleState] = useState<UserRoleState>(EMPTY_ROLE);
  const [cloudMsg, setCloudMsg] = useState('');
  const [storageWarn, setStorageWarn] = useState('');
  const [myDoc, setMyDoc] = useState<{
    coaches?: string[];
    cn?: Record<string, string>;
  }>({});
  const [invIn, setInvIn] = useState<InviteItem[]>([]);
  const [invOut, setInvOut] = useState<InviteItem[]>([]);
  const [invLoaded, setInvLoaded] = useState(false);

  // Modal & sheet states
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastActiveSessionId, setLastActiveSessionId] = useState<string | null>(null);
  const [dayPickerDate, setDayPickerDate] = useState<string | null>(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [cloudSheetOpen, setCloudSheetOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [deleteAthleteTarget, setDeleteAthleteTarget] = useState<string | null>(null);
  const [deleteAthleteBusy, setDeleteAthleteBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsSheetOpen, setNotificationsSheetOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotifPermissionState>(() =>
    getNotificationPermission()
  );
  const [notifBanner, setNotifBanner] = useState<AppNotification | null>(null);

  // Live timers state
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(() => loadSavedRestTimer());
  const [intervalRunner, setIntervalRunner] = useState<ActiveIntervalRunner | null>(null);
  const [lastCircuitTarget, setLastCircuitTarget] = useState<CircuitIntervalTarget | null>(null);
  const [intervalFlash, setIntervalFlash] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Refs for sync & debounced writes
  const stateRef = useRef(S);
  stateRef.current = S;
  const restTimerRef = useRef(restTimer);
  restTimerRef.current = restTimer;
  const meRef = useRef(me);
  meRef.current = me;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const roleRef = useRef(roleState);
  roleRef.current = roleState;
  const myDocRef = useRef(myDoc);
  myDocRef.current = myDoc;

  const cloudUnsubsRef = useRef<Unsubscribe[]>([]);
  const studentUnsubsRef = useRef<Record<string, Unsubscribe>>({});
  const lastPushedSessionsRef = useRef<Map<string, string>>(new Map());
  const lastPushedMetaRef = useRef<string>('');
  const lastPushedPlansRef = useRef<Record<string, string>>({});
  const pushTimerRef = useRef<number | null>(null);
  const pushInFlightRef = useRef(false);
  const pushAgainRef = useRef(false);
  const remoteStatesRef = useRef<WeakSet<AppState>>(new WeakSet());
  const toastTimerRef = useRef<number | null>(null);
  const notifBannerTimerRef = useRef<number | null>(null);
  const notifWmRef = useRef<NotificationWatermark>({});
  const lastRestTickSecRef = useRef<number>(-1);
  const handledRestEndRef = useRef<number | null>(null);
  const completedCircuitSessionRef = useRef<string | null>(null);
  const athleteNameRef = useRef<string>('');
  const studentNameByUidRef = useRef<Record<string, string>>({});
  const pendingSignupNameRef = useRef<string>('');
  const autoAcceptSignupRef = useRef(false);
  const autoAcceptBusyRef = useRef(false);
  const prevAuthUidRef = useRef<string | null>(null);
  const authEpochRef = useRef(0);

  const markRemoteState = useCallback((stateObj: AppState): AppState => {
    remoteStatesRef.current.add(stateObj);
    return stateObj;
  }, []);

  // Interval config derived from S.iv
  const ivMode: IntervalMode = S.iv?.m || 'tabata';
  const ivCfg: Record<string, number> = useMemo(() => {
    const stored = S.iv?.cfg?.[ivMode] || {};
    return { ...IVDEF[ivMode], ...stored };
  }, [S.iv, ivMode]);

  const circuitTargets = useMemo(
    () => extractCircuitTargets(S),
    [S.sessions, S.plans, S.user, S.sport]
  );

  // Persist localStorage whenever S changes
  useEffect(() => {
    try {
      localStorage.setItem('plan_v1', JSON.stringify(S));
      setStorageWarn('');
    } catch {
      setStorageWarn('Memoria del navegador llena: elimina anexos de imagen o exporta una copia.');
    }
    const isLight = S.theme === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isLight ? '#F6F2FC' : '#0A051A');
    }
  }, [S]);

  // Persist rest timer
  useEffect(() => {
    try {
      if (restTimer) {
        localStorage.setItem(REST_STORAGE_KEY, JSON.stringify(restTimer));
      } else {
        localStorage.removeItem(REST_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [restTimer]);

  // Sync sound preferences to Web Audio engine
  useEffect(() => {
    setSoundConfig(S.snd);
  }, [S.snd]);

  // Remember last opened session for mini-bar resume
  useEffect(() => {
    if (activeSessionId) {
      setLastActiveSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  // Cleanup toast & notification banner timers
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (notifBannerTimerRef.current) window.clearTimeout(notifBannerTimerRef.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
    }, 2200);
  }, []);

  const pushNotification = useCallback(
    (targetUid: string, draft: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => {
      if (!targetUid || stateRef.current.notifEnabled === false) return;
      const item: AppNotification = {
        ...draft,
        id: uid(),
        createdAt: Date.now(),
        read: false,
      };
      setNotifications((prev) => {
        const next = [item, ...prev].slice(0, 40);
        saveUserNotifications(targetUid, next);
        return next;
      });
      setNotifBanner(item);
      if (notifBannerTimerRef.current) window.clearTimeout(notifBannerTimerRef.current);
      notifBannerTimerRef.current = window.setTimeout(() => {
        setNotifBanner(null);
      }, 5200);
      playActionCue('save');
      void dispatchSystemNotification(draft.title, draft.body, `tf-${draft.kind}`);
    },
    []
  );

  const handleRequestNotifPermission = useCallback(async () => {
    const res = await requestNotificationPermission();
    setNotifPermission(res);
    if (res === 'granted') {
      playActionCue('save');
      showToast('Notificaciones activadas');
      void dispatchSystemNotification(
        'TrazikFit',
        'Avisos de planificación, sesiones y recordatorios activados.'
      );
    } else if (res === 'denied') {
      showToast('Permiso bloqueado en el navegador; verás avisos dentro de la app.');
    }
  }, [showToast]);

  const handleMarkAllNotifsRead = useCallback(() => {
    const u = meRef.current;
    setNotifications((prev) => {
      const next = prev.map((n) => (n.read ? n : { ...n, read: true }));
      if (u) saveUserNotifications(u.uid, next);
      return next;
    });
  }, []);

  const handleClearAllNotifs = useCallback(() => {
    const u = meRef.current;
    setNotifications([]);
    if (u) saveUserNotifications(u.uid, []);
  }, []);

  const handleClickNotification = useCallback((item: AppNotification) => {
    const u = meRef.current;
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === item.id ? { ...n, read: true } : n));
      if (u) saveUserNotifications(u.uid, next);
      return next;
    });
    setNotifBanner(null);
    setNotificationsSheetOpen(false);
    if (item.athleteName && stateRef.current.role === 'coach') {
      setS((prev) =>
        prev.users.includes(item.athleteName!)
          ? { ...prev, user: item.athleteName!, pm: 0 }
          : prev
      );
    }
    if (item.sessionId) {
      setActiveSessionId(item.sessionId);
    } else if (item.date) {
      setS((prev) => ({ ...prev, view: 'month', anchor: item.date! }));
    } else if (item.kind === 'plan_change') {
      setS((prev) => ({ ...prev, view: 'plan' }));
    }
  }, []);

  // Auto-mark linked circuit exercises done when a linked circuit interval run finishes
  useEffect(() => {
    if (!intervalRunner?.done || !intervalRunner.circuit) return;
    const { sessionId, groupId, autoComplete, title } = intervalRunner.circuit;
    if (!autoComplete || !sessionId || !groupId) return;
    const key = `${sessionId}:${groupId}:${intervalRunner.total}`;
    if (completedCircuitSessionRef.current === key) return;
    completedCircuitSessionRef.current = key;
    setS((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              exercises: s.exercises.map((ex) =>
                ex.circ?.g === groupId
                  ? { ...ex, sets: ex.sets.map((st) => ({ ...st, done: true })) }
                  : ex
              ),
              ts: Date.now(),
            }
          : s
      ),
    }));
    showToast(`Circuito completado ✓ (${title})`);
  }, [intervalRunner?.done, intervalRunner?.circuit, intervalRunner?.total, showToast]);

  // Test Firebase connection once on mount & ensure smooth official splash entrance
  useEffect(() => {
    testConnection().catch(() => {});
    const timer = window.setTimeout(() => setSplashMinDone(true), 1100);
    return () => window.clearTimeout(timer);
  }, []);

  // Safe state updater
  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setS((prev) => updater(prev));
  }, []);

  const handleUpdateSound = useCallback((patch: Partial<SoundSettings>) => {
    setS((prev) => ({
      ...prev,
      snd: { ...DEFAULT_SOUND_SETTINGS, ...(prev.snd || {}), ...patch },
    }));
  }, []);

  const handleToggleSound = useCallback(() => {
    setS((prev) => {
      const cur = prev.snd || DEFAULT_SOUND_SETTINGS;
      return { ...prev, snd: { ...cur, enabled: !cur.enabled } };
    });
  }, []);

  // Schedule cloud push on state changes when signed in & authorized (compatible with trazikfit-5fafa schema)
  const performCloudPush = useCallback(async () => {
    const user = meRef.current;
    if (!user || !readyRef.current || !user.emailVerified) return;
    const cur = stateRef.current;
    const r = roleRef.current;
    const isTrainer = r.role === 'trainer';
    const hasAccess =
      isTrainer || r.admin || (myDocRef.current.coaches?.length || 0) > 0;
    if (!hasAccess) return;

    const effectiveAth = !isTrainer
      ? athleteNameRef.current ||
        cur.user ||
        resolveAthleteCanonicalName({ user, fallbackName: 'Atleta' })
      : cur.user;
    if (!isTrainer && !effectiveAth) return;

    if (pushInFlightRef.current) {
      pushAgainRef.current = true;
      return;
    }
    pushInFlightRef.current = true;

    try {
      // 1. Sync own user meta if changed (stored strictly as Firestore map to satisfy firestore.rules)
      const cleanAnnex = getSyncableAnnexes(cur.annex);
      const ownPlans: Record<string, MonthPlan[]> = {};
      if (isTrainer) {
        for (const [k, v] of Object.entries(cur.plans || {})) {
          if (!cur.linked?.[k]) ownPlans[k] = v;
        }
      } else {
        ownPlans[effectiveAth] = cur.plans?.[effectiveAth] || [];
      }
      const ownUsers = isTrainer
        ? cur.users.filter((u) => !cur.linked?.[u])
        : [effectiveAth];
      const ownPrs = isTrainer
        ? cur.prs || []
        : (cur.prs || []).filter((p) => p.user === effectiveAth);
      const ownPrx = isTrainer
        ? cur.prx || []
        : (cur.prx || []).filter((p) => p.user === effectiveAth);
      const ownBwh = isTrainer
        ? cur.bwh || []
        : (cur.bwh || []).filter((b) => b.user === effectiveAth);

      const metaObj = stripUndefined({
        users: ownUsers,
        plans: ownPlans,
        prs: ownPrs,
        prx: ownPrx,
        bwh: ownBwh,
        annex: cleanAnnex,
        axs: cur.axs ?? 1,
      });
      const metaSerialized = JSON.stringify(metaObj);
      if (metaSerialized !== lastPushedMetaRef.current) {
        const nowTs = Date.now();
        const fallbackAthName =
          cleanName(user.displayName || '') ||
          (user.email || '').split('@')[0] ||
          'Atleta';
        const effectiveProfileName = isTrainer
          ? fallbackAthName
          : String(effectiveAth || fallbackAthName);
        await updateDoc(
          doc(db, 'users', user.uid),
          stripUndefined({
            name: effectiveProfileName.slice(0, 100),
            email: (user.email || '').toLowerCase(),
            ath: String(effectiveAth || fallbackAthName).slice(0, 60),
            ts: nowTs,
            meta: buildFirestoreMetaMap(metaObj),
          })
        );
        lastPushedMetaRef.current = metaSerialized;
      }

      // 2. Sync trainer-modified plans for linked athletes (Firestore map with encoded blocks)
      if (isTrainer) {
        for (const [ath, stuUid] of Object.entries(cur.linked || {})) {
          const athPlans = cur.plans[ath] || [];
          const serialized = JSON.stringify(athPlans);
          if (lastPushedPlansRef.current[ath] !== serialized) {
            await updateDoc(
              doc(db, 'users', stuUid),
              stripUndefined({
                cplans: encodePlansMapForFirestore({ [ath]: athPlans }),
                cts: Date.now(),
              })
            );
            lastPushedPlansRef.current[ath] = serialized;
          }
        }
      }

      // 3. Sync sessions diff using flat Firestore schema matching firestore.rules isValidSession
      const nextSessionMap = new Map<string, string>();
      for (const s of cur.sessions) {
        if (!s.id) continue;
        if (!isTrainer && s.user !== effectiveAth) continue;
        const targetUid = isTrainer ? cur.linked?.[s.user] || user.uid : user.uid;
        if (targetUid !== user.uid && !isTrainer) continue;
        const safeSid = sanitizeSessionId(s.id);
        const sessionForTarget = isTrainer ? s : { ...s, user: effectiveAth };
        const payload = buildFirestoreSessionPayload(sessionForTarget);
        const key = `${targetUid}/${safeSid}`;
        const sig = buildFirestoreSessionSignature(sessionForTarget);
        nextSessionMap.set(key, sig);
        if (lastPushedSessionsRef.current.get(key) !== sig) {
          await setDoc(doc(db, 'users', targetUid, 'sessions', safeSid), payload);
          lastPushedSessionsRef.current.set(key, sig);
        }
      }

      for (const prevKey of Array.from(lastPushedSessionsRef.current.keys())) {
        if (!nextSessionMap.has(prevKey)) {
          const slash = prevKey.indexOf('/');
          if (slash > 0) {
            const tUid = prevKey.slice(0, slash);
            const sid = prevKey.slice(slash + 1);
            await deleteDoc(doc(db, 'users', tUid, 'sessions', sid));
            lastPushedSessionsRef.current.delete(prevKey);
          }
        }
      }
      lastPushedSessionsRef.current = nextSessionMap;
    } catch (err) {
      setCloudMsg(friendlyFirestoreError(err));
    } finally {
      pushInFlightRef.current = false;
      if (pushAgainRef.current) {
        pushAgainRef.current = false;
        window.setTimeout(() => {
          void performCloudPush();
        }, 250);
      }
    }
  }, []);

  useEffect(() => {
    if (!me || !ready) return;
    if (remoteStatesRef.current.has(S)) {
      remoteStatesRef.current.delete(S);
      return;
    }
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      void performCloudPush();
    }, 250);
    return () => {
      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [S, me, ready, performCloudPush]);

  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden' && pushTimerRef.current && meRef.current && readyRef.current) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
        void performCloudPush();
      }
    };
    const flushBeforeUnload = () => {
      if (pushTimerRef.current && meRef.current && readyRef.current) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
        void performCloudPush();
      }
    };
    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('pagehide', flushBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flushBeforeUnload);
    };
  }, [performCloudPush]);

  const stopCloudListeners = useCallback(() => {
    cloudUnsubsRef.current.forEach((u) => u());
    cloudUnsubsRef.current = [];
    Object.values(studentUnsubsRef.current).forEach((u) => u());
    studentUnsubsRef.current = {};
  }, []);

  const clearAccountState = useCallback(
    (clearStorage: boolean, prevUid?: string | null) => {
      stopCloudListeners();
      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      pushAgainRef.current = false;
      lastPushedSessionsRef.current = new Map();
      lastPushedMetaRef.current = '';
      lastPushedPlansRef.current = {};
      athleteNameRef.current = '';
      studentNameByUidRef.current = {};
      autoAcceptSignupRef.current = false;
      autoAcceptBusyRef.current = false;
      myDocRef.current = {};
      notifWmRef.current = {};
      completedCircuitSessionRef.current = null;

      setActiveSessionId(null);
      setLastActiveSessionId(null);
      setDayPickerDate(null);
      setProfileSheetOpen(false);
      setCloudSheetOpen(false);
      setImportSheetOpen(false);
      setDeleteAthleteTarget(null);
      setNotificationsSheetOpen(false);
      setNotifBanner(null);
      setRestTimer(null);
      handledRestEndRef.current = null;
      setIntervalRunner(null);
      setLastCircuitTarget(null);
      releaseWakeLock();

      try {
        localStorage.removeItem(REST_STORAGE_KEY);
        localStorage.removeItem(ROLE_CACHE_KEY);
        if (prevUid) {
          localStorage.removeItem(`${ROLE_CACHE_KEY}_${prevUid}`);
        }
        if (clearStorage) {
          localStorage.removeItem('plan_v1');
          localStorage.removeItem('plan_v1_cloud_ctx');
          localStorage.removeItem('plan_v1_demo4');
          localStorage.removeItem(PENDING_SIGNUP_NAME_KEY);
          pendingSignupNameRef.current = '';
        }
      } catch {
        // ignore storage errors
      }

      setS((prev) => markRemoteState(createEmptyAuthState(prev)));
    },
    [stopCloudListeners, markRemoteState]
  );

  // Firebase Auth listener + cloud bootstrap
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      const myEpoch = ++authEpochRef.current;
      const prevUid = prevAuthUidRef.current;
      setAuthResolved(true);
      stopCloudListeners();
      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }

      if (!user) {
        prevAuthUidRef.current = null;
        setMe(null);
        setReady(false);
        setInvLoaded(false);
        setRoleState(EMPTY_ROLE);
        setMyDoc({});
        setInvIn([]);
        setInvOut([]);
        setNotifications([]);
        clearAccountState(true, prevUid);
        return;
      }

      const cloudCtx = `trazikfit-5fafa:${user.uid}`;
      let storedCtx: string | null = null;
      try {
        storedCtx = localStorage.getItem('plan_v1_cloud_ctx');
      } catch {
        // ignore
      }
      const isDifferentAccount =
        storedCtx !== cloudCtx || (prevUid !== null && prevUid !== user.uid);

      prevAuthUidRef.current = user.uid;

      if (isDifferentAccount) {
        clearAccountState(false, prevUid);
        setMyDoc({});
        setInvIn([]);
        setInvOut([]);
        try {
          localStorage.setItem('plan_v1_cloud_ctx', cloudCtx);
        } catch {
          // ignore
        }
      }

      setMe(user);
      setReady(false);
      setInvLoaded(false);
      setCloudMsg('');
      setNotifications(loadUserNotifications(user.uid));
      notifWmRef.current = loadNotificationWatermark(user.uid);
      setNotifPermission(getNotificationPermission());

      const emailLower = (user.email || '').trim().toLowerCase();
      const isOwner = user.emailVerified && OWNER_EMAILS.includes(emailLower);

      // Consume pending signup name chosen by the athlete in LoginView ("Crear cuenta")
      let pendingName = cleanName(pendingSignupNameRef.current || '');
      if (!pendingName) {
        try {
          pendingName = cleanName(localStorage.getItem(PENDING_SIGNUP_NAME_KEY) || '');
        } catch {
          // ignore
        }
      }
      const hadPendingSignupName = Boolean(pendingName);
      pendingSignupNameRef.current = '';
      try {
        localStorage.removeItem(PENDING_SIGNUP_NAME_KEY);
      } catch {
        // ignore
      }
      if (pendingName) {
        try {
          await updateProfile(user, { displayName: pendingName });
        } catch {
          // ignore non-fatal auth profile update error
        }
      }
      if (authEpochRef.current !== myEpoch) return;

      // Attach incoming invites listener IMMEDIATELY & unconditionally so invites appear automatically
      if (user.emailVerified && emailLower) {
        const unsubInvIn = onSnapshot(
          query(collection(db, 'invites'), where('to', '==', emailLower)),
          (snap) => {
            if (authEpochRef.current !== myEpoch) return;
            const list: InviteItem[] = [];
            snap.forEach((d) => {
              const o = d.data();
              list.push({
                id: d.id,
                to: String(o.to || ''),
                coachUid: String(o.coachUid || ''),
                coachName: String(o.coachName || 'Entrenador'),
                ts: Number(o.ts || 0),
              });
            });
            setInvIn(list);
            setInvLoaded(true);
          },
          (err) => {
            if (authEpochRef.current !== myEpoch) return;
            setCloudMsg((prev) => prev || friendlyFirestoreError(err));
            setInvLoaded(true);
          }
        );
        cloudUnsubsRef.current.push(unsubInvIn);
      } else {
        setInvLoaded(true);
      }

      try {
        // 1. Owner bootstrap (singleton + role doc only if not yet present in trazikfit-5fafa)
        if (isOwner) {
          try {
            const ownerRef = doc(db, 'config', 'owner');
            const ownerSnap = await getDoc(ownerRef);
            if (authEpochRef.current !== myEpoch) return;
            if (!ownerSnap.exists()) {
              await setDoc(ownerRef, {
                uid: user.uid,
                email: emailLower,
                pinnedAt: Date.now(),
              });
            }
            const roleRef = doc(db, 'roles', user.uid);
            const roleSnap = await getDoc(roleRef);
            if (authEpochRef.current !== myEpoch) return;
            const rData = roleSnap.data();
            if (!roleSnap.exists() || rData?.role !== 'trainer' || !rData?.admin) {
              await setDoc(
                roleRef,
                {
                  role: 'trainer',
                  admin: true,
                  subscription: rData?.subscription || {
                    status: 'none',
                    plan: null,
                    currentPeriodEnd: null,
                    provider: null,
                  },
                  updatedAt: Date.now(),
                  updatedBy: user.uid,
                },
                { merge: true }
              );
            }
          } catch {
            // ignore if already pinned by UID or transient check
          }
        }
        if (authEpochRef.current !== myEpoch) return;

        // 2. Directory upsert (prefer explicit athlete signup name)
        if (user.emailVerified && emailLower) {
          try {
            const dirRef = doc(db, 'directory', user.uid);
            const dirSnap = await getDoc(dirRef);
            if (authEpochRef.current !== myEpoch) return;
            const dispName =
              pendingName ||
              cleanName(user.displayName || '') ||
              emailLower.split('@')[0].slice(0, 30) ||
              'Atleta';
            await setDoc(
              dirRef,
              stripUndefined({
                name: dispName,
                email: emailLower,
                lastLogin: Date.now(),
                ...(dirSnap.exists() ? {} : { createdAt: Date.now() }),
              }),
              { merge: true }
            );
          } catch {
            // ignore directory non-fatal error
          }
        }
        if (authEpochRef.current !== myEpoch) return;

        // 3. Load Role directly from Firestore roles/{uid} (role cache strictly scoped by uid)
        const scopedRoleCacheKey = `${ROLE_CACHE_KEY}_${user.uid}`;
        let resolvedRole: UserRoleState;
        try {
          const rSnap = await getDoc(doc(db, 'roles', user.uid));
          if (authEpochRef.current !== myEpoch) return;
          if (rSnap.exists()) {
            const d = rSnap.data();
            resolvedRole = {
              ok: true,
              role: d.role === 'trainer' ? 'trainer' : 'athlete',
              admin: d.role === 'trainer' && d.admin === true,
              sub: d.subscription || null,
              err: '',
            };
          } else if (isOwner) {
            resolvedRole = {
              ok: true,
              role: 'trainer',
              admin: true,
              sub: { status: 'active' },
              err: '',
            };
          } else {
            resolvedRole = {
              ok: true,
              role: 'athlete',
              admin: false,
              sub: null,
              err: '',
            };
          }
        } catch (err) {
          let cached: UserRoleState | null = null;
          try {
            const raw = localStorage.getItem(scopedRoleCacheKey);
            if (raw) cached = JSON.parse(raw) as UserRoleState;
          } catch {
            // ignore
          }
          resolvedRole =
            cached ||
            (isOwner
              ? { ok: true, role: 'trainer', admin: true, sub: { status: 'active' }, err: '' }
              : {
                  ok: false,
                  role: 'athlete',
                  admin: false,
                  sub: null,
                  err: friendlyFirestoreError(err),
                });
        }
        try {
          localStorage.removeItem(ROLE_CACHE_KEY);
          localStorage.setItem(scopedRoleCacheKey, JSON.stringify(resolvedRole));
        } catch {
          // ignore
        }
        if (authEpochRef.current !== myEpoch) return;
        setRoleState(resolvedRole);

        const isCoachAccount = resolvedRole.role === 'trainer';

        // 4. Read/create users/{uid} cleanly (100% blank state for brand-new accounts, valid Firestore map)
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);
        if (authEpochRef.current !== myEpoch) return;
        const userDocExisted = userSnap.exists();
        let initialUserData: Record<string, unknown> | null = null;

        if (userDocExisted) {
          const existingData = userSnap.data() as Record<string, unknown>;
          initialUserData = existingData;
          if (pendingName && !isCoachAccount && user.emailVerified) {
            await updateDoc(
              userDocRef,
              stripUndefined({
                name: pendingName,
                ath: pendingName.slice(0, 60),
                ts: Date.now(),
              })
            );
            if (authEpochRef.current !== myEpoch) return;
            initialUserData = {
              ...existingData,
              name: pendingName,
              ath: pendingName.slice(0, 60),
            };
          }
          const nextMyDoc = {
            coaches: Array.isArray(initialUserData.coaches)
              ? (initialUserData.coaches as string[])
              : [],
            cn: (initialUserData.cn as Record<string, string>) || {},
          };
          myDocRef.current = nextMyDoc;
          setMyDoc(nextMyDoc);
          // Track existing remote meta signature immediately so local cache never overwrites remote
          const existingMetaObj = safeDocDataToMeta(initialUserData.meta);
          if (existingMetaObj) {
            lastPushedMetaRef.current = JSON.stringify(existingMetaObj);
          }
        } else if (user.emailVerified) {
          const dispName =
            pendingName ||
            cleanName(user.displayName || '') ||
            emailLower.split('@')[0].slice(0, 30) ||
            'Atleta';
          const blankMetaObj = {
            users: isCoachAccount ? [] : [dispName.slice(0, 60)],
            plans: isCoachAccount ? {} : { [dispName.slice(0, 60)]: [] },
            prs: [],
            prx: [],
            bwh: [],
            annex: [],
            axs: 1,
          };
          initialUserData = {
            coaches: [],
            cn: {},
            name: dispName,
            email: emailLower,
            ath: dispName.slice(0, 60),
            ts: 0,
            meta: buildFirestoreMetaMap(blankMetaObj),
          };
          await setDoc(userDocRef, stripUndefined(initialUserData));
          if (authEpochRef.current !== myEpoch) return;
          myDocRef.current = { coaches: [], cn: {} };
          setMyDoc({ coaches: [], cn: {} });
          lastPushedMetaRef.current = JSON.stringify(blankMetaObj);
        }

        // Allow auto-linking when athlete just signed up via "Crear cuenta" or brand-new account with 0 coaches
        const existingCoachesCount = Array.isArray(initialUserData?.coaches)
          ? (initialUserData!.coaches as string[]).length
          : 0;
        autoAcceptSignupRef.current =
          !isCoachAccount &&
          user.emailVerified &&
          existingCoachesCount === 0 &&
          (hadPendingSignupName || !userDocExisted);

        // Resolve canonical athlete identity from authenticated Google account + Firestore users/{uid}
        const initialMetaObj = safeDocDataToMeta(initialUserData?.meta);
        const initialCplansObj = safeDocDataToCplans(initialUserData?.cplans);
        const initialAthName = !isCoachAccount
          ? pendingName ||
            resolveAthleteCanonicalName({
              user,
              userData: initialUserData,
              remoteMeta: initialMetaObj,
              remoteCplans: initialCplansObj,
            })
          : '';
        athleteNameRef.current = initialAthName;

        setS((prev) => {
          const base = isDifferentAccount ? createEmptyAuthState(prev) : prev;
          if (!isCoachAccount) {
            const ownSess = base.sessions.filter((s) => s.user === initialAthName);
            const ownPlans = base.plans[initialAthName] ? { [initialAthName]: base.plans[initialAthName] } : {};
            return markRemoteState({
              ...base,
              ...(isDifferentAccount ? { mts: 0, cts: 0 } : {}),
              linked: {},
              users: [initialAthName],
              user: initialAthName,
              plans: ownPlans,
              sessions: ownSess,
              pm: 0,
              role: 'atleta',
              local: false,
              view: base.view === 'team' ? 'month' : base.view,
            });
          }
          return markRemoteState({
            ...base,
            ...(isDifferentAccount ? { mts: 0, cts: 0, linked: {} } : {}),
            role: 'coach',
            local: false,
          });
        });

        // Readiness gate: wait until initial snapshots resolve before enabling cloud pushes
        let ownDocDone = false;
        let ownSessionsDone = false;
        let studentsDone = !isCoachAccount;
        const checkInitialReady = () => {
          if (
            authEpochRef.current === myEpoch &&
            ownDocDone &&
            ownSessionsDone &&
            studentsDone &&
            meRef.current?.uid === user.uid
          ) {
            setReady(true);
          }
        };
        const readinessFallback = window.setTimeout(() => {
          if (authEpochRef.current === myEpoch && meRef.current?.uid === user.uid) {
            setReady(true);
          }
        }, 7000);

        // 5. Own user doc listener
        const unsubOwnDoc = onSnapshot(
          userDocRef,
          (snap) => {
            if (authEpochRef.current !== myEpoch) return;
            if (!snap.metadata.hasPendingWrites && snap.exists()) {
              const d = snap.data() as Record<string, unknown>;
              const nextMyDoc = {
                coaches: Array.isArray(d.coaches) ? (d.coaches as string[]) : [],
                cn: (d.cn as Record<string, string>) || {},
              };
              myDocRef.current = nextMyDoc;
              setMyDoc(nextMyDoc);

              const remoteMeta = safeDocDataToMeta(d.meta);
              const remoteCplans = safeDocDataToCplans(d.cplans);
              const remoteTs = Number(d.ts || 0);
              const remoteCts = Number(d.cts || 0);

              setS((prev) => {
                if (!isCoachAccount) {
                  const canonicalName = resolveAthleteCanonicalName({
                    user,
                    userData: d,
                    remoteMeta,
                    remoteCplans,
                    fallbackName: athleteNameRef.current || prev.user,
                  });
                  athleteNameRef.current = canonicalName;

                  let changed =
                    prev.user !== canonicalName ||
                    prev.users.length !== 1 ||
                    prev.users[0] !== canonicalName ||
                    Object.keys(prev.linked || {}).length > 0 ||
                    prev.role !== 'atleta' ||
                    prev.sessions.some((sess) => sess.user !== canonicalName);

                  let next: AppState = {
                    ...prev,
                    role: 'atleta',
                    local: false,
                    linked: {},
                    users: [canonicalName],
                    user: canonicalName,
                    sessions: prev.sessions
                      .filter(
                        (sess) =>
                          sess.user === canonicalName ||
                          (Boolean(prev.user) && sess.user === prev.user)
                      )
                      .map((sess) => ({ ...sess, user: canonicalName })),
                  };

                  if (
                    remoteMeta &&
                    (remoteTs > (prev.mts || 0) || (!ownDocDone && remoteTs >= (prev.mts || 0)))
                  ) {
                    const san = sanRemote(remoteMeta) as Partial<AppState>;
                    const localDataImages = (prev.annex || []).filter(
                      (a) => a.kind === 'img' && String(a.src || '').startsWith('data:')
                    );
                    const remoteAnnexes = Array.isArray(san.annex) ? san.annex : [];
                    const mergedAnnex = [...remoteAnnexes];
                    localDataImages.forEach((img) => {
                      if (!mergedAnnex.some((a) => a.id === img.id)) mergedAnnex.push(img);
                    });

                    const sanPlans = (san.plans || {}) as Record<string, MonthPlan[]>;
                    let matchedMetaPlans: MonthPlan[] = [];
                    if (sanPlans[canonicalName]) {
                      matchedMetaPlans = sanPlans[canonicalName];
                    } else {
                      const ciMatch = Object.entries(sanPlans).find(
                        ([k]) => nz(k) === nz(canonicalName)
                      );
                      if (ciMatch) {
                        matchedMetaPlans = ciMatch[1];
                      } else {
                        const firstEntry = Object.values(sanPlans)[0];
                        if (Array.isArray(firstEntry)) matchedMetaPlans = firstEntry;
                      }
                    }

                    const athFieldLower = String(d.ath || '').trim().toLowerCase();
                    const allowNormalizedUser = (u?: string) => {
                      const low = (u || '').trim().toLowerCase();
                      if (!low) return true;
                      if (nz(u || '') === nz(canonicalName)) return true;
                      return Boolean(athFieldLower) && low === athFieldLower;
                    };

                    const ownPrs = Array.isArray(san.prs)
                      ? san.prs
                          .filter((x) => allowNormalizedUser(x.user))
                          .map((x) => ({ ...x, user: canonicalName }))
                      : prev.prs.filter((x) => x.user === canonicalName);
                    const ownPrx = Array.isArray(san.prx)
                      ? san.prx
                          .filter((x) => allowNormalizedUser(x.user))
                          .map((x) => ({ ...x, user: canonicalName }))
                      : prev.prx.filter((x) => x.user === canonicalName);
                    const ownBwh = Array.isArray(san.bwh)
                      ? san.bwh
                          .filter((x) => allowNormalizedUser(x.user))
                          .map((x) => ({ ...x, user: canonicalName }))
                      : prev.bwh.filter((x) => x.user === canonicalName);

                    const existingPlanList = next.plans?.[canonicalName] || [];
                    const combinedPlanList = matchedMetaPlans.length
                      ? matchedMetaPlans
                      : existingPlanList;

                    next = {
                      ...next,
                      plans: { [canonicalName]: combinedPlanList },
                      prs: ownPrs,
                      prx: ownPrx,
                      bwh: ownBwh,
                      annex: mergedAnnex,
                      axs: typeof san.axs === 'number' ? san.axs : prev.axs,
                      mts: remoteTs,
                    };
                    changed = true;
                  }

                  const hasRemoteCplans =
                    remoteCplans !== null &&
                    (remoteCts > (prev.cts || 0) ||
                      (!ownDocDone && remoteCts >= (prev.cts || 0)) ||
                      (Object.keys(remoteCplans).length > 0 &&
                        !(next.plans?.[canonicalName]?.length)));

                  if (hasRemoteCplans && remoteCplans) {
                    const sanCp = sanRemote(remoteCplans) as Record<string, MonthPlan[]>;
                    const mergedPlans: MonthPlan[] = [];
                    const seenPlanIds = new Set<string>();
                    Object.values(sanCp).forEach((arr) => {
                      (arr || []).forEach((m) => {
                        if (!m) return;
                        const pid = m.id || '';
                        if (pid && seenPlanIds.has(pid)) return;
                        if (pid) seenPlanIds.add(pid);
                        mergedPlans.push(m);
                      });
                    });

                    next = {
                      ...next,
                      plans: { [canonicalName]: mergedPlans },
                      cts: Math.max(remoteCts, prev.cts || 0),
                    };
                    changed = true;
                  }

                  if (changed) {
                    lastPushedMetaRef.current = JSON.stringify(
                      stripUndefined({
                        users: [canonicalName],
                        plans: { [canonicalName]: next.plans?.[canonicalName] || [] },
                        prs: next.prs,
                        prx: next.prx,
                        bwh: next.bwh,
                        annex: getSyncableAnnexes(next.annex),
                        axs: next.axs,
                      })
                    );
                    return markRemoteState(normalizeState(next));
                  }
                  return prev;
                }

                // Coach/Trainer doc sync
                let changed = false;
                let next = { ...prev };

                if (
                  remoteMeta &&
                  (remoteTs > (prev.mts || 0) || (!ownDocDone && remoteTs >= (prev.mts || 0)))
                ) {
                  const san = sanRemote(remoteMeta) as Partial<AppState>;
                  const localDataImages = (prev.annex || []).filter(
                    (a) => a.kind === 'img' && String(a.src || '').startsWith('data:')
                  );
                  const remoteAnnexes = Array.isArray(san.annex) ? san.annex : [];
                  const mergedAnnex = [...remoteAnnexes];
                  localDataImages.forEach((img) => {
                    if (!mergedAnnex.some((a) => a.id === img.id)) mergedAnnex.push(img);
                  });

                  // Replace own/unlinked plans cleanly with remote plans, preserving linked student cplans
                  const nextPlans: Record<string, MonthPlan[]> = { ...(san.plans || {}) };
                  for (const linkedAth of Object.keys(prev.linked || {})) {
                    if (prev.plans[linkedAth]) {
                      nextPlans[linkedAth] = prev.plans[linkedAth];
                    }
                  }

                  const remoteUsers = Array.isArray(san.users) ? san.users : prev.users;
                  const mergedUsers = Array.from(
                    new Set([...remoteUsers, ...Object.keys(prev.linked || {})])
                  );

                  const validUsersSet = new Set(mergedUsers);
                  const filteredSessions = prev.sessions.filter((sess) => validUsersSet.has(sess.user));

                  next = {
                    ...next,
                    users: mergedUsers,
                    user: mergedUsers.includes(prev.user)
                      ? prev.user
                      : mergedUsers.includes(String(d.ath || ''))
                      ? String(d.ath)
                      : mergedUsers[0] || '',
                    plans: nextPlans,
                    sessions: filteredSessions,
                    prs: Array.isArray(san.prs) ? san.prs : prev.prs,
                    prx: Array.isArray(san.prx) ? san.prx : prev.prx,
                    bwh: Array.isArray(san.bwh) ? san.bwh : prev.bwh,
                    annex: mergedAnnex,
                    axs: typeof san.axs === 'number' ? san.axs : prev.axs,
                    mts: remoteTs,
                  };
                  lastPushedMetaRef.current = JSON.stringify(
                    stripUndefined({
                      users: next.users.filter((u) => !next.linked?.[u]),
                      plans: Object.fromEntries(
                        Object.entries(next.plans || {}).filter(([k]) => !next.linked?.[k])
                      ),
                      prs: next.prs,
                      prx: next.prx,
                      bwh: next.bwh,
                      annex: getSyncableAnnexes(next.annex),
                      axs: next.axs,
                    })
                  );
                  changed = true;
                }

                if (remoteCplans && remoteCts > (prev.cts || 0)) {
                  const sanCp = sanRemote(remoteCplans) as Record<string, MonthPlan[]>;
                  next = {
                    ...next,
                    plans: { ...(next.plans || {}), ...sanCp },
                    cts: remoteCts,
                  };
                  changed = true;
                }

                if (changed) {
                  return markRemoteState(normalizeState(next));
                }
                return prev;
              });

              if (!isCoachAccount && remoteCplans) {
                const wm = notifWmRef.current;
                if (wm.planInitialized && remoteCts > (wm.cts || 0)) {
                  pushNotification(user.uid, {
                    kind: 'plan_change',
                    title: 'Cambio en tu planificación',
                    body: 'Tu entrenador actualizó tu programa de entrenamiento.',
                  });
                }
                wm.cts = remoteCts;
                wm.planInitialized = true;
                saveNotificationWatermark(user.uid, wm);
              }
            }
            if (!ownDocDone) {
              ownDocDone = true;
              checkInitialReady();
            }
          },
          (err) => {
            setCloudMsg(friendlyFirestoreError(err));
            if (!ownDocDone) {
              ownDocDone = true;
              checkInitialReady();
            }
          }
        );
        cloudUnsubsRef.current.push(unsubOwnDoc);

        // 6. Own sessions listener (authoritative per-UID subcollection)
        const unsubOwnSessions = onSnapshot(
          collection(db, 'users', user.uid, 'sessions'),
          (snap) => {
            if (authEpochRef.current !== myEpoch) return;
            if (!snap.metadata.hasPendingWrites) {
              const athCanonical = !isCoachAccount
                ? athleteNameRef.current ||
                  stateRef.current.user ||
                  resolveAthleteCanonicalName({ user, userData: initialUserData })
                : undefined;

              const remoteList: TrainingSession[] = [];
              snap.forEach((docSnap) => {
                const rawDoc = docSnap.data() as Record<string, unknown>;
                const rawParsed = parseFirestoreSession(docSnap.id, rawDoc);
                if (!rawParsed) return;
                remoteList.push(
                  athCanonical ? { ...rawParsed, user: athCanonical } : rawParsed
                );
              });

              setS((prev) => {
                if (!isCoachAccount) {
                  const activeAth = athleteNameRef.current || prev.user || athCanonical || 'Atleta';
                  const normalizedOwn = remoteList.map((s) => ({ ...s, user: activeAth }));
                  const dirtyLocalById = new Map<string, TrainingSession>();
                  prev.sessions.forEach((ls) => {
                    if (!ls.id || ls.user !== activeAth) return;
                    const safeSid = sanitizeSessionId(ls.id);
                    const key = `${user.uid}/${safeSid}`;
                    const localSig = buildFirestoreSessionSignature(ls);
                    if (lastPushedSessionsRef.current.get(key) !== localSig) {
                      dirtyLocalById.set(safeSid, ls);
                    }
                  });

                  for (const key of Array.from(lastPushedSessionsRef.current.keys())) {
                    if (key.startsWith(`${user.uid}/`)) {
                      lastPushedSessionsRef.current.delete(key);
                    }
                  }
                  const mergedOwn = normalizedOwn.map((rs) => {
                    const safeSid = sanitizeSessionId(rs.id);
                    const key = `${user.uid}/${safeSid}`;
                    lastPushedSessionsRef.current.set(
                      key,
                      buildFirestoreSessionSignature(rs)
                    );
                    const dirty = dirtyLocalById.get(safeSid);
                    if (dirty && Number(dirty.ts || 0) > Number(rs.ts || 0)) {
                      return dirty;
                    }
                    return rs;
                  });
                  dirtyLocalById.forEach((dirty, sid) => {
                    if (!mergedOwn.some((m) => sanitizeSessionId(m.id) === sid)) {
                      mergedOwn.push(dirty);
                    }
                  });
                  return markRemoteState({
                    ...prev,
                    user: activeAth,
                    users: [activeAth],
                    linked: {},
                    sessions: mergedOwn,
                  });
                }

                const linkedUserNames = new Set(Object.keys(prev.linked || {}));
                const studentSessions = prev.sessions.filter((s) => linkedUserNames.has(s.user));
                const remoteOwn = remoteList.filter((s) => !linkedUserNames.has(s.user));

                const dirtyOwnById = new Map<string, TrainingSession>();
                prev.sessions.forEach((ls) => {
                  if (!ls.id || linkedUserNames.has(ls.user)) return;
                  const safeSid = sanitizeSessionId(ls.id);
                  const key = `${user.uid}/${safeSid}`;
                  const localSig = buildFirestoreSessionSignature(ls);
                  if (lastPushedSessionsRef.current.get(key) !== localSig) {
                    dirtyOwnById.set(safeSid, ls);
                  }
                });

                for (const key of Array.from(lastPushedSessionsRef.current.keys())) {
                  if (key.startsWith(`${user.uid}/`)) {
                    lastPushedSessionsRef.current.delete(key);
                  }
                }
                const mergedOwnCoach = remoteOwn.map((rs) => {
                  const safeSid = sanitizeSessionId(rs.id);
                  const key = `${user.uid}/${safeSid}`;
                  lastPushedSessionsRef.current.set(
                    key,
                    buildFirestoreSessionSignature(rs)
                  );
                  const dirty = dirtyOwnById.get(safeSid);
                  if (dirty && Number(dirty.ts || 0) > Number(rs.ts || 0)) {
                    return dirty;
                  }
                  return rs;
                });
                dirtyOwnById.forEach((dirty, sid) => {
                  if (!mergedOwnCoach.some((m) => sanitizeSessionId(m.id) === sid)) {
                    mergedOwnCoach.push(dirty);
                  }
                });

                if (userDocExisted || mergedOwnCoach.length > 0 || isDifferentAccount) {
                  return markRemoteState({
                    ...prev,
                    sessions: [...studentSessions, ...mergedOwnCoach],
                  });
                }
                return prev;
              });

              if (!isCoachAccount) {
                const wm = notifWmRef.current;
                const prevMap = wm.coachSessionMap || {};
                const nextMap: Record<string, string> = {};
                const coachChanged: TrainingSession[] = [];
                remoteList.forEach((s) => {
                  const sig = buildSessionAlertSignature(s);
                  nextMap[s.id] = sig;
                  if (wm.sessionsInitialized && s.updatedBy !== 'atleta' && prevMap[s.id] !== sig) {
                    coachChanged.push(s);
                  }
                });
                const removedByCoach = wm.sessionsInitialized
                  ? Object.keys(prevMap).filter((id) => !nextMap[id])
                  : [];

                if (wm.sessionsInitialized && (coachChanged.length > 0 || removedByCoach.length > 0)) {
                  if (coachChanged.length === 1) {
                    const s = coachChanged[0];
                    pushNotification(user.uid, {
                      kind: 'plan_change',
                      title: 'Cambio en tu calendario',
                      body: `${s.name || 'Sesión'} · ${fdateShort(s.date)}`,
                      sessionId: s.id,
                      date: s.date,
                    });
                  } else if (coachChanged.length > 1) {
                    pushNotification(user.uid, {
                      kind: 'plan_change',
                      title: 'Planificación actualizada',
                      body: `Tu entrenador actualizó ${coachChanged.length} sesiones en tu calendario.`,
                      sessionId: coachChanged[0].id,
                      date: coachChanged[0].date,
                    });
                  } else if (removedByCoach.length > 0) {
                    pushNotification(user.uid, {
                      kind: 'plan_change',
                      title: 'Cambio en tu calendario',
                      body: 'Tu entrenador ajustó las sesiones programadas en tu calendario.',
                    });
                  }
                }
                wm.coachSessionMap = nextMap;
                wm.sessionsInitialized = true;
                saveNotificationWatermark(user.uid, wm);
              }
            }
            if (!ownSessionsDone) {
              ownSessionsDone = true;
              checkInitialReady();
            }
          },
          (err) => {
            setCloudMsg(friendlyFirestoreError(err));
            if (!ownSessionsDone) {
              ownSessionsDone = true;
              checkInitialReady();
            }
          }
        );
        cloudUnsubsRef.current.push(unsubOwnSessions);

        // 7. Trainer listeners (outgoing invites + linked students + student sessions)
        if (isCoachAccount) {
          const unsubInvOut = onSnapshot(
            query(collection(db, 'invites'), where('coachUid', '==', user.uid)),
            (snap) => {
              if (authEpochRef.current !== myEpoch) return;
              const list: InviteItem[] = [];
              snap.forEach((d) => {
                const o = d.data();
                list.push({
                  id: d.id,
                  to: String(o.to || ''),
                  coachUid: String(o.coachUid || ''),
                  coachName: String(o.coachName || ''),
                  ts: Number(o.ts || 0),
                });
              });
              setInvOut(list);
            },
            () => {}
          );
          cloudUnsubsRef.current.push(unsubInvOut);

          const unsubStudents = onSnapshot(
            query(collection(db, 'users'), where('coaches', 'array-contains', user.uid)),
            (snap) => {
              if (authEpochRef.current !== myEpoch || snap.metadata.hasPendingWrites) return;
              const nextLinked: Record<string, string> = {};
              const studentPlansMerge: Record<string, MonthPlan[]> = {};
              const studentHasRemoteCplans: Record<string, boolean> = {};
              const renamedPairs: Array<{ from: string; to: string }> = [];

              snap.forEach((stuDoc) => {
                if (stuDoc.id === user.uid) return;
                const d = stuDoc.data();
                const rawAth = cleanName(String(d.ath || ''));
                let resolvedStuAth =
                  rawAth ||
                  cleanName(String(d.name || '')) ||
                  cleanName(String(d.email || '').split('@')[0]) ||
                  `Atleta_${stuDoc.id.slice(0, 4)}`;

                if (nextLinked[resolvedStuAth] && nextLinked[resolvedStuAth] !== stuDoc.id) {
                  const emailTag = cleanName(String(d.email || '').split('@')[0]);
                  resolvedStuAth = `${resolvedStuAth} (${emailTag || stuDoc.id.slice(0, 4)})`;
                }

                const prevStuAth = studentNameByUidRef.current[stuDoc.id];
                if (prevStuAth && prevStuAth !== resolvedStuAth) {
                  renamedPairs.push({ from: prevStuAth, to: resolvedStuAth });
                }
                studentNameByUidRef.current[stuDoc.id] = resolvedStuAth;
                nextLinked[resolvedStuAth] = stuDoc.id;

                const meta = safeDocDataToMeta(d.meta);
                const cp = safeDocDataToCplans(d.cplans);
                const metaPlans = (meta?.plans as Record<string, MonthPlan[]>) || {};
                const cpPlans = cp || {};
                const cpKeys = Object.keys(cpPlans);
                const firstCpPlans = cpKeys.length ? cpPlans[cpKeys[0]] : undefined;
                const metaFallback = metaPlans[resolvedStuAth] || metaPlans[d.ath || ''] || [];
                const chosenPlans =
                  cpPlans[resolvedStuAth] ??
                  (prevStuAth ? cpPlans[prevStuAth] : undefined) ??
                  cpPlans[d.ath || ''] ??
                  firstCpPlans ??
                  metaFallback;
                studentHasRemoteCplans[resolvedStuAth] = cp !== null && cpKeys.length > 0;
                studentPlansMerge[resolvedStuAth] = sanRemote(chosenPlans);

                // Attach session listener for this student if not yet attached
                if (!studentUnsubsRef.current[stuDoc.id]) {
                  studentUnsubsRef.current[stuDoc.id] = onSnapshot(
                    collection(db, 'users', stuDoc.id, 'sessions'),
                    (sSnap) => {
                      if (authEpochRef.current !== myEpoch || sSnap.metadata.hasPendingWrites) return;
                      const liveAthName = studentNameByUidRef.current[stuDoc.id] || resolvedStuAth;
                      const stuSess: TrainingSession[] = [];
                      sSnap.forEach((sd) => {
                        const rawParsed = parseFirestoreSession(
                          sd.id,
                          sd.data() as Record<string, unknown>
                        );
                        if (!rawParsed) return;
                        stuSess.push({ ...rawParsed, user: liveAthName });
                      });

                      setS((prev) => {
                        const dirtyLocalById = new Map<string, TrainingSession>();
                        prev.sessions.forEach((ls) => {
                          if (!ls.id || ls.user !== liveAthName) return;
                          const safeSid = sanitizeSessionId(ls.id);
                          const key = `${stuDoc.id}/${safeSid}`;
                          const localSig = buildFirestoreSessionSignature(ls);
                          if (lastPushedSessionsRef.current.get(key) !== localSig) {
                            dirtyLocalById.set(safeSid, ls);
                          }
                        });

                        for (const key of Array.from(lastPushedSessionsRef.current.keys())) {
                          if (key.startsWith(`${stuDoc.id}/`)) {
                            lastPushedSessionsRef.current.delete(key);
                          }
                        }
                        const mergedStu = stuSess.map((rs) => {
                          const safeSid = sanitizeSessionId(rs.id);
                          const key = `${stuDoc.id}/${safeSid}`;
                          lastPushedSessionsRef.current.set(
                            key,
                            buildFirestoreSessionSignature(rs)
                          );
                          const dirty = dirtyLocalById.get(safeSid);
                          if (dirty && Number(dirty.ts || 0) > Number(rs.ts || 0)) {
                            return dirty;
                          }
                          return rs;
                        });
                        // Also preserve brand-new local sessions created for this athlete awaiting push
                        dirtyLocalById.forEach((dirty, sid) => {
                          if (!mergedStu.some((m) => sanitizeSessionId(m.id) === sid)) {
                            mergedStu.push(dirty);
                          }
                        });

                        const others = prev.sessions.filter((x) => x.user !== liveAthName);
                        return markRemoteState({ ...prev, sessions: [...others, ...mergedStu] });
                      });

                      const wm = notifWmRef.current;
                      const isStuInit = Boolean(wm.studentBaselines?.[stuDoc.id]);
                      const finishedMap = wm.finishedByAth || (wm.finishedByAth = {});
                      stuSess.forEach((mapped) => {
                        const key = `${stuDoc.id}/${mapped.id}`;
                        const finishedTs =
                          mapped.finishedAt ||
                          (isSessionFullyDone(mapped) && mapped.updatedBy === 'atleta'
                            ? Number(mapped.ts || 0)
                            : 0);
                        const prevFinishedTs = finishedMap[key] || 0;
                        if (finishedTs > prevFinishedTs) {
                          if (isStuInit && mapped.updatedBy === 'atleta') {
                            pushNotification(user.uid, {
                              kind: 'session_done',
                              title: `${liveAthName} finalizó su sesión`,
                              body: `${mapped.name || 'Entrenamiento'} · ${fdateShort(mapped.date)}`,
                              sessionId: mapped.id,
                              date: mapped.date,
                              athleteName: liveAthName,
                            });
                          }
                          finishedMap[key] = finishedTs;
                        }
                      });
                      if (!isStuInit) {
                        wm.studentBaselines = {
                          ...(wm.studentBaselines || {}),
                          [stuDoc.id]: true,
                        };
                      }
                      saveNotificationWatermark(user.uid, wm);
                    },
                    (err) => {
                      setCloudMsg(friendlyFirestoreError(err));
                    }
                  );
                }
              });

              // Clean up unlinked student session listeners & orphaned local linked references
              const activeIds = new Set(Object.values(nextLinked));
              for (const [stuId, unsub] of Object.entries(studentUnsubsRef.current)) {
                if (!activeIds.has(stuId)) {
                  unsub();
                  delete studentUnsubsRef.current[stuId];
                  delete studentNameByUidRef.current[stuId];
                  for (const key of Array.from(lastPushedSessionsRef.current.keys())) {
                    if (key.startsWith(`${stuId}/`)) {
                      lastPushedSessionsRef.current.delete(key);
                    }
                  }
                }
              }

              setS((prev) => {
                const renameMap = new Map(renamedPairs.map((p) => [p.from, p.to]));
                const removedLinkedNames = Object.keys(prev.linked || {}).filter(
                  (ath) => !nextLinked[ath] && !renameMap.has(ath)
                );
                const removedSet = new Set(removedLinkedNames);
                const nextPlans = { ...prev.plans };

                renamedPairs.forEach(({ from, to }) => {
                  if (nextPlans[from] && !nextPlans[to]) {
                    nextPlans[to] = nextPlans[from];
                  }
                  delete nextPlans[from];
                  delete lastPushedPlansRef.current[from];
                });

                Object.entries(studentPlansMerge).forEach(([ath, remoteList]) => {
                  const localList = prev.plans[ath];
                  const localJson = localList ? JSON.stringify(localList) : '';
                  const prevPushed = lastPushedPlansRef.current[ath];
                  const hasPendingCoachEdit =
                    Boolean(localList) &&
                    prevPushed !== undefined &&
                    localJson !== prevPushed &&
                    (pushTimerRef.current !== null || pushInFlightRef.current);
                  const newlyLinkedWithLocalPlan =
                    !prev.linked?.[ath] &&
                    Boolean(localList && localList.length > 0) &&
                    !studentHasRemoteCplans[ath] &&
                    remoteList.length === 0;

                  if (!hasPendingCoachEdit && !newlyLinkedWithLocalPlan) {
                    nextPlans[ath] = remoteList;
                    lastPushedPlansRef.current[ath] = JSON.stringify(remoteList);
                  }
                });

                removedLinkedNames.forEach((ath) => {
                  delete nextPlans[ath];
                  delete lastPushedPlansRef.current[ath];
                });

                const nextUsers = Array.from(
                  new Set([
                    ...prev.users
                      .filter((u) => !removedSet.has(u))
                      .map((u) => renameMap.get(u) || u),
                    ...Object.keys(nextLinked),
                  ])
                );
                let nextSessions = prev.sessions
                  .filter((s) => !removedSet.has(s.user))
                  .map((s) =>
                    renameMap.has(s.user) ? { ...s, user: renameMap.get(s.user)! } : s
                  );
                const nextActiveUser = renameMap.get(prev.user) || prev.user;

                return markRemoteState(
                  normalizeState({
                    ...prev,
                    user: nextActiveUser,
                    linked: nextLinked,
                    users: nextUsers,
                    plans: nextPlans,
                    sessions: nextSessions,
                  })
                );
              });

              if (!studentsDone) {
                studentsDone = true;
                checkInitialReady();
              }
            },
            (err) => {
              setCloudMsg(friendlyFirestoreError(err));
              if (!studentsDone) {
                studentsDone = true;
                checkInitialReady();
              }
            }
          );
          cloudUnsubsRef.current.push(unsubStudents);
        }

        cloudUnsubsRef.current.push(() => window.clearTimeout(readinessFallback));
      } catch (err) {
        setCloudMsg(friendlyFirestoreError(err));
        setReady(true);
      }
    });

    return () => {
      unsubAuth();
      stopCloudListeners();
    };
  }, [stopCloudListeners, clearAccountState, markRemoteState]);

  // Live timer ticks (rest timer, active session timer, set stopwatch, interval runner)
  const activeSession = useMemo(
    () => S.sessions.find((s) => s.id === activeSessionId) || null,
    [S.sessions, activeSessionId]
  );

  const anyRunningSession = useMemo(
    () => S.sessions.some((s) => Boolean(s.tm?.st)),
    [S.sessions]
  );

  const anyTimerRunning = Boolean(
    (restTimer && !restTimer.paused) ||
      (intervalRunner && intervalRunner.running && !intervalRunner.done) ||
      anyRunningSession
  );

  useEffect(() => {
    const ms = anyTimerRunning ? 100 : 1000;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);

      // Work / Rest timer completion, automatic Work->Rest transition & auto-dismiss
      const curRest = restTimerRef.current;
      if (curRest && !curRest.paused && !curRest.done && now >= curRest.end) {
        if (handledRestEndRef.current !== curRest.end) {
          handledRestEndRef.current = curRest.end;
          if (curRest.phase === 'work') {
            const link = curRest.workLink;
            if (link) {
              setS((prev) => ({
                ...prev,
                sessions: prev.sessions.map((sess) => {
                  if (sess.id !== link.sid) return sess;
                  const exs = [...sess.exercises];
                  const targetEx = exs[link.exIdx];
                  if (!targetEx || !targetEx.sets[link.setIdx]) return sess;
                  const sets = [...targetEx.sets];
                  const curSet = sets[link.setIdx];
                  sets[link.setIdx] = {
                    ...curSet,
                    b: String(curSet.b || '').trim() ? curSet.b : fm(link.workSec),
                    done: true,
                  };
                  exs[link.exIdx] = { ...targetEx, sets };
                  return { ...sess, exercises: exs, ts: now };
                }),
              }));
            }
            const nextRest = Math.max(0, Math.round(curRest.nextRestSec ?? 0));
            if (nextRest > 0) {
              ivAlarm('rest');
              lastRestTickSecRef.current = -1;
              setRestTimer({
                end: now + nextRest * 1000,
                tot: nextRest,
                base: nextRest,
                done: false,
                paused: false,
                left: nextRest,
                phase: 'rest',
              });
            } else {
              beepRestFinished();
              setRestTimer((prev) =>
                prev && prev.end === curRest.end
                  ? { ...prev, done: true, doneAt: now, left: 0 }
                  : prev
              );
            }
          } else {
            beepRestFinished();
            setRestTimer((prev) =>
              prev && prev.end === curRest.end
                ? { ...prev, done: true, doneAt: now, left: 0 }
                : prev
            );
          }
        }
      } else if (curRest && curRest.done && curRest.doneAt && now - curRest.doneAt > 20000) {
        setRestTimer(null);
      }

      // Interval runner phase transitions & countdown tones
      setIntervalRunner((prev) => {
        if (!prev || !prev.running || prev.done) return prev;
        const el = prev.acc + (now - prev.st) / 1000;
        if (el >= prev.total) {
          ivAlarm('end');
          releaseWakeLock();
          return { ...prev, acc: prev.total, st: 0, running: false, done: true };
        }
        const P = prev.plan;
        let idx = P.length - 1;
        for (let i = 0; i < P.length; i++) {
          if (el < prev.cum[i + 1]) {
            idx = i;
            break;
          }
        }
        let nextLast = prev.last;
        let nextSec = prev.sec;
        if (idx !== prev.last) {
          nextLast = idx;
          ivAlarm(P[idx].k);
          setIntervalFlash(true);
          window.setTimeout(() => setIntervalFlash(false), 380);
        }
        const rem = Math.ceil(prev.cum[idx + 1] - el);
        if (rem !== prev.sec) {
          nextSec = rem;
          if (rem >= 1 && rem <= 3) playCountdownTick(rem);
        }
        if (nextLast !== prev.last || nextSec !== prev.sec) {
          return { ...prev, last: nextLast, sec: nextSec };
        }
        return prev;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [anyTimerRunning]);

  // Reacquire WakeLock on visibility restore
  useEffect(() => {
    const onVis = () => {
      setNowTick(Date.now());
      if (document.visibilityState === 'visible' && intervalRunner?.running && !intervalRunner.done) {
        void requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [intervalRunner?.running, intervalRunner?.done]);

  // Derived timer displays
  const restLeft = useMemo(() => {
    if (!restTimer) return 0;
    if (restTimer.done) return 0;
    if (restTimer.paused) return Math.max(0, restTimer.left);
    return Math.max(0, Math.ceil((restTimer.end - nowTick) / 1000));
  }, [restTimer, nowTick]);

  // Last 3 seconds countdown cue for session rest timer
  useEffect(() => {
    if (!restTimer || restTimer.paused || restTimer.done) {
      lastRestTickSecRef.current = -1;
      return;
    }
    if (restLeft !== lastRestTickSecRef.current) {
      lastRestTickSecRef.current = restLeft;
      if (restLeft >= 1 && restLeft <= 3) {
        playCountdownTick(restLeft);
      }
    }
  }, [restLeft, restTimer?.paused, restTimer?.done, restTimer]);

  const intervalElapsed = useMemo(() => {
    if (!intervalRunner) return 0;
    const raw =
      intervalRunner.acc +
      (intervalRunner.running && intervalRunner.st ? (nowTick - intervalRunner.st) / 1000 : 0);
    return Math.min(intervalRunner.total, Math.max(0, raw));
  }, [intervalRunner, nowTick]);

  const intervalMiniLeft = useMemo(() => {
    if (!intervalRunner || intervalRunner.done) return null;
    return Math.max(0, Math.ceil(intervalRunner.total - intervalElapsed));
  }, [intervalRunner, intervalElapsed]);

  const restMiniLeft = restTimer && !restTimer.done ? restLeft : null;

  const activeSessionMini = useMemo(() => {
    const runningSess = S.sessions.find((s) => Boolean(s.tm?.st));
    const target =
      runningSess ||
      (restMiniLeft !== null
        ? activeSession ||
          (lastActiveSessionId
            ? S.sessions.find((s) => s.id === lastActiveSessionId) || null
            : null)
        : null);
    if (!target) return null;
    return { id: target.id, elapsed: tmEl(target) };
  }, [S.sessions, restMiniLeft, activeSession, lastActiveSessionId, nowTick]);

  // Auth Handlers
  const handleGoogleLogin = async (signupName?: string) => {
    setCloudMsg('');
    const cleaned = cleanName(signupName || '');
    pendingSignupNameRef.current = cleaned;
    try {
      if (cleaned) {
        localStorage.setItem(PENDING_SIGNUP_NAME_KEY, cleaned);
      } else {
        localStorage.removeItem(PENDING_SIGNUP_NAME_KEY);
      }
    } catch {
      // ignore storage errors
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      pendingSignupNameRef.current = '';
      try {
        localStorage.removeItem(PENDING_SIGNUP_NAME_KEY);
      } catch {
        // ignore
      }
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (code === 'auth/popup-blocked') {
        setCloudMsg('Permite las ventanas emergentes para iniciar sesión con Google.');
        return;
      }
      setCloudMsg(friendlyFirestoreError(err));
    }
  };

  const handleSignOut = async () => {
    const prevUid = meRef.current?.uid || null;
    try {
      clearAccountState(true, prevUid);
      setReady(false);
      setInvLoaded(false);
      setRoleState(EMPTY_ROLE);
      setMyDoc({});
      setInvIn([]);
      setInvOut([]);
      setNotifications([]);
      await signOut(auth);
    } catch (err) {
      setCloudMsg(friendlyFirestoreError(err));
    }
  };

  const handleSaveAthleteName = async (rawName: string) => {
    const u = meRef.current;
    const cleaned = cleanName(rawName);
    if (!u || !u.emailVerified || cleaned.length < 2) return;
    try {
      try {
        await updateProfile(u, { displayName: cleaned });
      } catch {
        // non-fatal
      }
      const emailLower = (u.email || '').trim().toLowerCase();
      await updateDoc(
        doc(db, 'users', u.uid),
        stripUndefined({
          name: cleaned,
          email: emailLower,
          ath: cleaned.slice(0, 60),
          ts: Date.now(),
        })
      );
      try {
        await setDoc(
          doc(db, 'directory', u.uid),
          stripUndefined({
            name: cleaned,
            email: emailLower,
            lastLogin: Date.now(),
          }),
          { merge: true }
        );
      } catch {
        // ignore directory error
      }
      athleteNameRef.current = cleaned;
      setS((prev) =>
        markRemoteState({
          ...prev,
          user: cleaned,
          users: [cleaned],
          plans: { [cleaned]: prev.plans[prev.user] || prev.plans[cleaned] || [] },
          sessions: prev.sessions.map((s) => ({ ...s, user: cleaned })),
        })
      );
      showToast('Nombre actualizado');
    } catch (err) {
      setCloudMsg(friendlyFirestoreError(err));
    }
  };

  // Invite / Coach Link Handlers
  const handleInviteStudent = async (rawEmail: string) => {
    const email = rawEmail.trim().toLowerCase().slice(0, 200);
    if (!me || !me.emailVerified) {
      setCloudMsg('Inicia sesión con una cuenta verificada para invitar.');
      return;
    }
    if (!email || email.length < 3 || !email.includes('@')) {
      setCloudMsg('Ingresa un correo electrónico válido.');
      return;
    }
    if (email === (me.email || '').trim().toLowerCase()) {
      setCloudMsg('No puedes invitarte a ti mismo.');
      return;
    }
    try {
      const id = `${me.uid}_${email}`;
      const coachName = (
        cleanName(me.displayName || '') ||
        (me.email || '').split('@')[0] ||
        'Entrenador'
      ).slice(0, 120);
      await setDoc(doc(db, 'invites', id), {
        to: email,
        coachUid: me.uid,
        coachName,
        ts: Date.now(),
      });
      setCloudMsg('✓ Invitación enviada');
    } catch (err) {
      setCloudMsg(friendlyFirestoreError(err));
    }
  };

  const handleAcceptInvite = useCallback(
    async (inviteId: string, preferredName?: string) => {
      const currentMe = meRef.current;
      if (!currentMe || !currentMe.emailVerified) return;
      const inv = invIn.find((i) => i.id === inviteId);
      const coachUid = inv?.coachUid || inviteId.split('_')[0];
      const coachName = inv?.coachName || 'Entrenador';
      const cleanedPref = cleanName(preferredName || '');
      const canonicalAth =
        (cleanedPref.length >= 2 ? cleanedPref : '') ||
        athleteNameRef.current ||
        resolveAthleteCanonicalName({
          user: currentMe,
          fallbackName: stateRef.current.user,
        });
      const emailLower = (currentMe.email || '').trim().toLowerCase();

      try {
        if (cleanedPref.length >= 2) {
          try {
            await updateProfile(currentMe, { displayName: canonicalAth });
          } catch {
            // non-fatal
          }
          try {
            await setDoc(
              doc(db, 'directory', currentMe.uid),
              stripUndefined({
                name: canonicalAth,
                email: emailLower,
                lastLogin: Date.now(),
              }),
              { merge: true }
            );
          } catch {
            // non-fatal
          }
        }

        const userRef = doc(db, 'users', currentMe.uid);
        const userSnap = await getDoc(userRef);
        let existingCoaches: string[] = [];
        let existingCn: Record<string, string> = {};

        if (!userSnap.exists()) {
          const blankMetaObj = {
            users: [canonicalAth.slice(0, 60)],
            plans: { [canonicalAth.slice(0, 60)]: [] },
            prs: [],
            prx: [],
            bwh: [],
            annex: [],
            axs: 1,
          };
          await setDoc(
            userRef,
            stripUndefined({
              coaches: [],
              cn: {},
              name: canonicalAth,
              email: emailLower,
              ath: canonicalAth.slice(0, 60),
              ts: 0,
              meta: buildFirestoreMetaMap(blankMetaObj),
            })
          );
        } else {
          const uData = userSnap.data() as Record<string, unknown>;
          existingCoaches = Array.isArray(uData.coaches)
            ? (uData.coaches as string[]).filter((c) => typeof c === 'string' && c.length > 0)
            : [];
          existingCn =
            uData.cn && typeof uData.cn === 'object' ? (uData.cn as Record<string, string>) : {};
        }

        const nextCoaches = existingCoaches.includes(coachUid)
          ? existingCoaches
          : [...existingCoaches, coachUid];
        const nextCn = { ...existingCn, [coachUid]: coachName };

        // Must update users/{uid} BEFORE deleting invite because firestore.rules inviteOk() verifies invite existence
        await updateDoc(
          userRef,
          stripUndefined({
            coaches: nextCoaches,
            cn: nextCn,
            name: canonicalAth,
            email: emailLower,
            ath: canonicalAth.slice(0, 60),
            ts: Date.now(),
          })
        );
        await deleteDoc(doc(db, 'invites', inviteId));

        athleteNameRef.current = canonicalAth;
        const nextMyDoc = { coaches: nextCoaches, cn: nextCn };
        myDocRef.current = nextMyDoc;
        setMyDoc(nextMyDoc);
        setS((prev) =>
          markRemoteState({
            ...prev,
            user: canonicalAth,
            users: [canonicalAth],
            plans: { [canonicalAth]: prev.plans[prev.user] || prev.plans[canonicalAth] || [] },
          })
        );
        setCloudMsg('✓ Entrenador vinculado');
        playActionCue('save');
        showToast('Invitación aceptada');
      } catch (err) {
        setCloudMsg(friendlyFirestoreError(err));
      } finally {
        autoAcceptBusyRef.current = false;
      }
    },
    [invIn, markRemoteState, showToast]
  );

  // Automatically accept & link when a brand-new athlete account enters with a coach invitation
  useEffect(() => {
    const isTrainerOrAdminNow = roleState.role === 'trainer' || roleState.admin;
    const hasCoachNow = (myDoc.coaches || []).length > 0;
    if (
      !me ||
      !me.emailVerified ||
      !ready ||
      !invLoaded ||
      isTrainerOrAdminNow ||
      hasCoachNow ||
      invIn.length !== 1 ||
      !autoAcceptSignupRef.current ||
      autoAcceptBusyRef.current
    ) {
      return;
    }
    autoAcceptSignupRef.current = false;
    autoAcceptBusyRef.current = true;
    void handleAcceptInvite(invIn[0].id, athleteNameRef.current || undefined);
  }, [me, ready, invLoaded, roleState.role, roleState.admin, myDoc.coaches, invIn, handleAcceptInvite]);

  const handleDeleteInvite = async (inviteId: string) => {
    try {
      await deleteDoc(doc(db, 'invites', inviteId));
    } catch (err) {
      setCloudMsg(friendlyFirestoreError(err));
    }
  };

  const handleUnlinkCoach = async (coachUid: string) => {
    if (!me) return;
    try {
      const nextCoaches = (myDoc.coaches || []).filter((c) => c !== coachUid);
      const nextCn = { ...(myDoc.cn || {}) };
      delete nextCn[coachUid];
      await updateDoc(doc(db, 'users', me.uid), {
        coaches: nextCoaches,
        cn: nextCn,
        ts: Date.now(),
      });
      setCloudMsg('✓ Entrenador desvinculado');
    } catch (err) {
      setCloudMsg(friendlyFirestoreError(err));
    }
  };

  // Athletes & Bodyweight Handlers
  const handleAddAthlete = (rawName: string): string | null => {
    const n = cleanName(rawName);
    if (!n) return 'Escribe un nombre válido.';
    if (S.users.some((u) => nz(u) === nz(n))) return 'Ya existe un perfil con ese nombre.';
    setS((prev) => ({
      ...prev,
      users: [...prev.users, n],
      user: n,
      plans: { ...prev.plans, [n]: prev.plans[n] || [] },
      pm: 0,
    }));
    return null;
  };

  const handleRequestDeleteAthlete = (name: string) => {
    setDeleteAthleteTarget(name);
  };

  const handleConfirmDeleteAthlete = async (name: string) => {
    const user = meRef.current;
    const cur = stateRef.current;
    const stuUid = cur.linked?.[name];
    const isLinked = Boolean(stuUid);

    if (!isLinked && cur.users.length <= 1) {
      setDeleteAthleteTarget(null);
      showToast('Debe quedar al menos un perfil activo.');
      return;
    }

    setDeleteAthleteBusy(true);
    try {
      if (isLinked && stuUid) {
        // Linked Google athlete: delete coach-managed sessions & cplans in users/{stuUid}
        const stuSessionsSnap = await getDocs(collection(db, 'users', stuUid, 'sessions'));
        const allIds = new Set<string>(
          cur.sessions.filter((s) => s.user === name).map((s) => s.id)
        );
        const remoteSessions: TrainingSession[] = [];
        stuSessionsSnap.forEach((ds) => {
          allIds.add(ds.id);
          const parsed = parseFirestoreSession(
            ds.id,
            ds.data() as Record<string, unknown>,
            name
          );
          if (parsed) remoteSessions.push(parsed);
        });

        await batchDeleteSessionDocs(stuUid, Array.from(allIds));
        await updateDoc(doc(db, 'users', stuUid), {
          cplans: {},
          cts: Date.now(),
        });

        for (const sid of allIds) {
          lastPushedSessionsRef.current.delete(`${stuUid}/${sid}`);
        }
        lastPushedPlansRef.current[name] = JSON.stringify([]);

        const candidateUrls = collectStorageUrlsFromSessions([
          ...cur.sessions.filter((s) => s.user === name),
          ...remoteSessions,
        ]);

        const nextState: AppState = {
          ...cur,
          sessions: cur.sessions.filter((s) => s.user !== name),
          plans: { ...cur.plans, [name]: [] },
        };
        setS(markRemoteState(nextState));
        await deleteUnusedStorageUrls(candidateUrls, collectStorageUrlsFromState(nextState));
        playActionCue('delete');
        showToast('Sesiones y plan del atleta eliminados en Firebase');
      } else if (user && user.emailVerified) {
        // Coach-managed profile: delete every Firestore session doc for this athlete + clean meta & Storage
        const monthIds = new Set((cur.plans[name] || []).map((m) => m.id).filter(Boolean));
        const sharedMonthIds = new Set<string>();
        Object.entries(cur.plans || {}).forEach(([u, list]) => {
          if (u === name) return;
          (list || []).forEach((m) => {
            if (m.id) sharedMonthIds.add(m.id);
          });
        });
        const exclusiveMonthIds = new Set(
          Array.from(monthIds).filter((id) => !sharedMonthIds.has(id))
        );

        const removedSessions = cur.sessions.filter((s) => s.user === name);
        const idsToDelete = new Set<string>(removedSessions.map((s) => s.id));
        const remoteRemovedSessions: TrainingSession[] = [];

        const ownSessSnap = await getDocs(collection(db, 'users', user.uid, 'sessions'));
        ownSessSnap.forEach((ds) => {
          const parsed = parseFirestoreSession(
            ds.id,
            ds.data() as Record<string, unknown>
          );
          if (parsed && parsed.user === name) {
            idsToDelete.add(ds.id);
            remoteRemovedSessions.push(parsed);
          }
        });

        await batchDeleteSessionDocs(user.uid, Array.from(idsToDelete));
        for (const sid of idsToDelete) {
          lastPushedSessionsRef.current.delete(`${user.uid}/${sid}`);
        }

        const removedAnnexes = cur.annex.filter(
          (a) => a.m && exclusiveMonthIds.has(a.m)
        );
        const candidateUrls = [
          ...collectStorageUrlsFromSessions([...removedSessions, ...remoteRemovedSessions]),
          ...removedAnnexes.map((a) => a.src),
        ];

        const nextUsers = cur.users.filter((u) => u !== name);
        const nextPlans = { ...cur.plans };
        delete nextPlans[name];
        const nextBwt = { ...cur.bwt };
        delete nextBwt[name];
        const nextProf = { ...(cur.prof || {}) };
        delete nextProf[name];

        const nextState: AppState = normalizeState({
          ...cur,
          users: nextUsers,
          user: cur.user === name ? nextUsers[0] || '' : cur.user,
          pm: 0,
          cdel: '',
          plans: nextPlans,
          bwt: nextBwt,
          prof: nextProf,
          sessions: cur.sessions.filter((s) => s.user !== name),
          prs: cur.prs.filter((p) => p.user !== name),
          prx: cur.prx.filter((p) => p.user !== name),
          bwh: cur.bwh.filter((b) => b.user !== name),
          annex: cur.annex.filter((a) => !(a.m && exclusiveMonthIds.has(a.m))),
        });

        // Push cleaned meta immediately so nothing remains orphaned in Firestore
        const cleanOwnPlans: Record<string, MonthPlan[]> = {};
        for (const [k, v] of Object.entries(nextState.plans || {})) {
          if (!nextState.linked?.[k]) cleanOwnPlans[k] = v;
        }
        const metaObj = stripUndefined({
          users: nextState.users.filter((u) => !nextState.linked?.[u]),
          plans: cleanOwnPlans,
          prs: nextState.prs || [],
          prx: nextState.prx || [],
          bwh: nextState.bwh || [],
          annex: getSyncableAnnexes(nextState.annex),
          axs: nextState.axs ?? 1,
        });
        const metaSerialized = JSON.stringify(metaObj);
        const nowTs = Date.now();
        await updateDoc(
          doc(db, 'users', user.uid),
          stripUndefined({
            ath: String(nextState.user || 'Usuario').slice(0, 60),
            ts: nowTs,
            meta: buildFirestoreMetaMap(metaObj),
          })
        );
        lastPushedMetaRef.current = metaSerialized;

        setS(markRemoteState({ ...nextState, mts: nowTs }));
        await deleteUnusedStorageUrls(candidateUrls, collectStorageUrlsFromState(nextState));
        playActionCue('delete');
        showToast('Atleta y datos eliminados de Firebase');
      }
      setDeleteAthleteTarget(null);
    } catch (err) {
      setCloudMsg(friendlyFirestoreError(err));
      showToast(friendlyFirestoreError(err));
    } finally {
      setDeleteAthleteBusy(false);
    }
  };

  const handleAddBodyWeight = (rawKg: string, date: string): boolean => {
    const kg = parseFloat(String(rawKg).replace(',', '.'));
    if (!kg || kg < 20 || kg > 400) return false;
    const d = date || todayStr();
    setS((prev) => {
      const filtered = prev.bwh.filter((x) => !(x.user === prev.user && x.date === d));
      return {
        ...prev,
        bwh: [...filtered, { id: uid(), user: prev.user, date: d, kg }],
        bwt: { ...prev.bwt, [prev.user]: kg },
      };
    });
    playActionCue('save');
    showToast('Peso corporal guardado');
    return true;
  };

  const handleDeleteBodyWeight = (id: string) => {
    setS((prev) => ({
      ...prev,
      bwh: prev.bwh.filter((x) => x.id !== id),
    }));
  };

  // Calendar & Session Handlers
  const handleNavigatePeriod = (dir: -1 | 1) => {
    setS((prev) => {
      const d = pd(prev.anchor);
      if (prev.view === 'week') return { ...prev, anchor: iso(add(d, dir * 7)) };
      if (prev.view === 'month') {
        return {
          ...prev,
          anchor: iso(new Date(d.getFullYear(), d.getMonth() + dir, 15)),
        };
      }
      return {
        ...prev,
        anchor: iso(new Date(d.getFullYear(), d.getMonth() + dir * 6, 15)),
      };
    });
  };

  const handleDayTap = (date: string) => {
    const daySessions = S.sessions.filter(
      (s) => s.sport === S.sport && s.user === S.user && s.date === date
    );
    if (daySessions.length === 1) {
      setActiveSessionId(daySessions[0].id);
    } else {
      setDayPickerDate(date);
    }
  };

  const handleCreateManualSession = (date: string) => {
    const newId = uid();
    const author: 'coach' | 'atleta' = stateRef.current.role === 'coach' ? 'coach' : 'atleta';
    const newSession: TrainingSession = {
      id: newId,
      user: S.user,
      date,
      sport: S.sport,
      name: 'Sesión libre',
      exercises: [newEx('fuerza')],
      ts: Date.now(),
      updatedBy: author,
    };
    setS((prev) => ({ ...prev, sessions: [...prev.sessions, newSession] }));
    setDayPickerDate(null);
    setActiveSessionId(newId);
  };

  const handleUpdateActiveSession = (updater: (s: TrainingSession) => TrainingSession) => {
    if (!activeSessionId) return;
    const author: 'coach' | 'atleta' = stateRef.current.role === 'coach' ? 'coach' : 'atleta';
    setS((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === activeSessionId ? { ...updater(s), ts: Date.now(), updatedBy: author } : s
      ),
    }));
  };

  const handleFinishSession = (targetSession: TrainingSession) => {
    const now = Date.now();
    const author: 'coach' | 'atleta' = stateRef.current.role === 'coach' ? 'coach' : 'atleta';
    setS((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== targetSession.id && !s.tm?.st) return s;
        const tm = s.tm;
        const stoppedTm = tm
          ? {
              ...tm,
              acc: (tm.acc || 0) + (tm.st ? (now - tm.st) / 1000 : 0),
              st: 0,
            }
          : undefined;
        if (s.id !== targetSession.id) {
          return { ...s, tm: stoppedTm };
        }
        return {
          ...s,
          tm: stoppedTm,
          exercises: s.exercises.map((e) => ({
            ...e,
            sets: e.sets.map((st) => ({ ...st, done: true })),
          })),
          ts: now,
          finishedAt: now,
          updatedBy: author,
        };
      }),
    }));
    setRestTimer(null);
    handledRestEndRef.current = null;
    setLastActiveSessionId(null);
    releaseWakeLock();
    setIntervalRunner((prev) => {
      if (!prev) return null;
      if (prev.circuit?.sessionId === targetSession.id) {
        return null;
      }
      if (!prev.running) return prev;
      const acc = prev.acc + (prev.st ? (now - prev.st) / 1000 : 0);
      return { ...prev, acc, st: 0, running: false };
    });
    if (lastCircuitTarget?.sessionId === targetSession.id) {
      setLastCircuitTarget(null);
    }
    setActiveSessionId(null);
    playActionCue('save');
    showToast('Entrenamiento finalizado ✓');
  };

  const handleUnfinishSession = (targetSession: TrainingSession) => {
    const now = Date.now();
    const author: 'coach' | 'atleta' = stateRef.current.role === 'coach' ? 'coach' : 'atleta';
    setS((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== targetSession.id) return s;
        const { finishedAt: _omit, ...rest } = s;
        return {
          ...rest,
          exercises: s.exercises.map((e) => ({
            ...e,
            sets: e.sets.map((st) => ({ ...st, done: false })),
          })),
          ts: now,
          updatedBy: author,
        };
      }),
    }));
    playActionCue('delete');
    showToast('Entrenamiento desmarcado');
  };

  const handleDuplicatePlus7 = (s: TrainingSession) => {
    const newId = uid();
    const author: 'coach' | 'atleta' = stateRef.current.role === 'coach' ? 'coach' : 'atleta';
    const copy: TrainingSession = {
      ...structuredClone(s),
      id: newId,
      date: iso(add(pd(s.date), 7)),
      tm: undefined,
      rpe: 0,
      feel: 0,
      finishedAt: undefined,
      updatedBy: author,
      ts: Date.now(),
      exercises: s.exercises.map((e) => ({
        ...e,
        sets: e.sets.map((st) => ({ ...st, done: false })),
      })),
    };
    setS((prev) => ({ ...prev, sessions: [...prev.sessions, copy] }));
    setActiveSessionId(newId);
    playActionCue('save');
    showToast('Sesión duplicada (+7 días)');
  };

  const handleDeleteSession = async (id: string) => {
    const cur = stateRef.current;
    const target = cur.sessions.find((s) => s.id === id);
    const nextSessions = cur.sessions.filter((s) => s.id !== id);
    const nextState: AppState = { ...cur, sessions: nextSessions };
    setS(nextState);
    if (activeSessionId === id) setActiveSessionId(null);

    const user = meRef.current;
    if (target && user && user.emailVerified) {
      const targetUid = cur.linked?.[target.user] || user.uid;
      try {
        lastPushedSessionsRef.current.delete(`${targetUid}/${id}`);
        await deleteDoc(doc(db, 'users', targetUid, 'sessions', id));
        const candidateUrls = collectStorageUrlsFromSessions([target]);
        if (candidateUrls.length) {
          await deleteUnusedStorageUrls(candidateUrls, collectStorageUrlsFromState(nextState));
        }
      } catch (err) {
        setCloudMsg(friendlyFirestoreError(err));
      }
    }
    playActionCue('delete');
    showToast('Eliminada correctamente');
  };

  const handleClearSessions = async (scope: 'month' | 'all') => {
    const cur = stateRef.current;
    const d = pd(cur.anchor);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const shouldRemove = (s: TrainingSession) => {
      if (s.user !== cur.user || s.sport !== cur.sport) return false;
      return scope === 'all' ? true : s.date.startsWith(ym);
    };
    const toRemove = cur.sessions.filter(shouldRemove);
    const nextState: AppState = {
      ...cur,
      sessions: cur.sessions.filter((s) => !shouldRemove(s)),
    };
    setS(nextState);

    const user = meRef.current;
    if (toRemove.length && user && user.emailVerified) {
      const targetUid = cur.linked?.[cur.user] || user.uid;
      try {
        const ids = toRemove.map((s) => s.id);
        ids.forEach((sid) => lastPushedSessionsRef.current.delete(`${targetUid}/${sid}`));
        await batchDeleteSessionDocs(targetUid, ids);
        const candidateUrls = collectStorageUrlsFromSessions(toRemove);
        if (candidateUrls.length) {
          await deleteUnusedStorageUrls(candidateUrls, collectStorageUrlsFromState(nextState));
        }
      } catch (err) {
        setCloudMsg(friendlyFirestoreError(err));
      }
    }
    playActionCue('delete');
    showToast('Eliminadas correctamente');
  };

  const handleUploadAnnexImage = async (
    monthId: string,
    annexId: string,
    blob: Blob,
    fallbackDataUrl: string
  ): Promise<string> => {
    const user = meRef.current;
    if (!user || !user.emailVerified) return fallbackDataUrl;
    try {
      return await uploadAnnexImage(user.uid, monthId, annexId, blob);
    } catch {
      return fallbackDataUrl;
    }
  };

  const handleDeleteMonth = (monthIndex: number) => {
    const cur = stateRef.current;
    const list = [...(cur.plans[cur.user] || [])];
    const target = list[monthIndex];
    if (!target) return;

    const sharedElsewhere =
      target.id &&
      Object.entries(cur.plans || {}).some(
        ([u, pList]) =>
          (u !== cur.user && (pList || []).some((m) => m.id === target.id)) ||
          (u === cur.user && (pList || []).some((m, idx) => idx !== monthIndex && m.id === target.id))
      );

    const removedAnnexes =
      target.id && !sharedElsewhere
        ? cur.annex.filter((a) => a.m === target.id)
        : [];
    const nextList = list.filter((_, idx) => idx !== monthIndex);
    const nextState: AppState = {
      ...cur,
      plans: { ...cur.plans, [cur.user]: nextList },
      annex:
        target.id && !sharedElsewhere
          ? cur.annex.filter((a) => a.m !== target.id)
          : cur.annex,
      pm: 0,
    };
    setS(nextState);
    if (removedAnnexes.length) {
      void deleteUnusedStorageUrls(
        removedAnnexes.map((a) => a.src),
        collectStorageUrlsFromState(nextState)
      );
    }
    playActionCue('delete');
    showToast('Mes eliminado');
  };

  const handleDeleteAnnex = (annexId: string) => {
    const cur = stateRef.current;
    const target = cur.annex.find((a) => a.id === annexId);
    const nextState: AppState = {
      ...cur,
      annex: cur.annex.filter((a) => a.id !== annexId),
    };
    setS(nextState);
    if (target && isProjectStorageUrl(target.src)) {
      void deleteUnusedStorageUrls([target.src], collectStorageUrlsFromState(nextState));
    }
  };

  // Plan Application & Import
  const handleApplyPlan = (startDate: string, weeks: number) => {
    const list = S.plans[S.user] || [];
    const M = list[S.pm] || list[0];
    if (!M) return;

    const startMonday = mon(pd(startDate));
    const author: 'coach' | 'atleta' = stateRef.current.role === 'coach' ? 'coach' : 'atleta';
    const created: TrainingSession[] = [];
    for (let w = 0; w < weeks; w++) {
      const wkMon = add(startMonday, w * 7);
      M.d.forEach((d) => {
        const dt = iso(add(wkMon, (d.wd + 6) % 7));
        const name = `${M.n} · ${d.n}${d.t ? ' · ' + d.t : ''}`;
        created.push({
          id: uid(),
          user: S.user,
          date: dt,
          sport: S.sport,
          name,
          mid: M.id,
          exercises: exFrom(d),
          ts: Date.now(),
          updatedBy: author,
        });
      });
    }

    setS((prev) => {
      const targetDates = new Set(created.map((c) => `${c.date}::${c.name}`));
      const kept = prev.sessions.filter((s) => {
        if (s.user !== prev.user || s.sport !== prev.sport) return true;
        if (!targetDates.has(`${s.date}::${s.name || ''}`)) return true;
        // Preserve already completed sessions
        return s.exercises.some((e) => e.sets.some((st) => st.done));
      });
      const existingKeys = new Set(
        kept
          .filter((s) => s.user === prev.user && s.sport === prev.sport)
          .map((s) => `${s.date}::${s.name || ''}`)
      );
      const toAdd = created.filter((c) => !existingKeys.has(`${c.date}::${c.name || ''}`));
      return {
        ...prev,
        sessions: [...kept, ...toAdd],
        anchor: startDate,
        view: 'month',
      };
    });
    playActionCue('save');
    showToast('Plan aplicado al calendario');
  };

  const handleSaveImportedMonths = (months: MonthPlan[], startToday: boolean) => {
    const newSessions: TrainingSession[] = [];
    const author: 'coach' | 'atleta' = stateRef.current.role === 'coach' ? 'coach' : 'atleta';
    if (startToday && months[0]) {
      const firstMon = mon(new Date());
      months[0].d.forEach((d) => {
        newSessions.push({
          id: uid(),
          user: S.user,
          date: iso(add(firstMon, (d.wd + 6) % 7)),
          sport: S.sport,
          name: `${months[0].n} · ${d.n}${d.t ? ' · ' + d.t : ''}`,
          mid: months[0].id,
          exercises: exFrom(d),
          ts: Date.now(),
          updatedBy: author,
        });
      });
    }

    setS((prev) => {
      const existing = prev.plans[prev.user] || [];
      return {
        ...prev,
        plans: { ...prev.plans, [prev.user]: [...existing, ...months] },
        pm: existing.length,
        sessions: startToday ? [...prev.sessions, ...newSessions] : prev.sessions,
        view: startToday ? 'month' : 'plan',
      };
    });
    setImportSheetOpen(false);
    playActionCue('save');
    showToast('Rutina guardada en tu plan');
  };

  // Session & Work/Rest Timers
  const startRestCountdown = useCallback((seconds: number) => {
    const sec = Math.max(5, Math.round(seconds));
    const now = Date.now();
    handledRestEndRef.current = null;
    setRestTimer({
      end: now + sec * 1000,
      tot: sec,
      base: sec,
      done: false,
      paused: false,
      left: sec,
      phase: 'rest',
    });
  }, []);

  const handleTimerAction = (action: string) => {
    unlockAudio();
    const now = Date.now();

    // Rest/work timer actions (session elapsed timer is never modified here)
    if (action === 'x' || action === 'rz') {
      lastRestTickSecRef.current = -1;
      handledRestEndRef.current = null;
      setRestTimer(null);
      return;
    }
    if (action.startsWith('r') && /^\d+$/.test(action.slice(1))) {
      playTimerStart();
      startRestCountdown(parseInt(action.slice(1), 10));
      return;
    }
    if (action === 'rr') {
      playTimerStart();
      handledRestEndRef.current = null;
      setRestTimer((prev) => {
        const base = prev?.base || 90;
        return {
          ...(prev || {}),
          end: now + base * 1000,
          tot: base,
          base,
          done: false,
          doneAt: undefined,
          paused: false,
          left: base,
          phase: prev?.phase || 'rest',
        };
      });
      return;
    }
    if (action === 'rp') {
      if (restTimer && !restTimer.done) {
        if (restTimer.paused) playTimerStart();
        else playTimerPause();
      }
      setRestTimer((prev) => {
        if (!prev || prev.done) return prev;
        if (prev.paused) {
          return {
            ...prev,
            paused: false,
            end: now + prev.left * 1000,
          };
        }
        const rem = Math.max(0, Math.ceil((prev.end - now) / 1000));
        return { ...prev, paused: true, left: rem };
      });
      return;
    }
    if (action === '+' || action === '-' || action === 'r+60' || action === 'r-60') {
      const delta =
        action === '+' ? 15 : action === '-' ? -15 : action === 'r+60' ? 60 : -60;
      setRestTimer((prev) => {
        if (!prev) {
          if (delta <= 0) return null;
          playTimerStart();
          return {
            end: now + delta * 1000,
            tot: delta,
            base: delta,
            done: false,
            paused: false,
            left: delta,
          };
        }
        const curRem = prev.done
          ? 0
          : prev.paused
          ? Math.max(0, prev.left)
          : Math.max(0, Math.ceil((prev.end - now) / 1000));
        const nextRem = Math.max(0, curRem + delta);
        if (nextRem === 0) {
          lastRestTickSecRef.current = -1;
          return null;
        }
        if (prev.done) {
          playTimerStart();
        }
        if (prev.paused) {
          return {
            ...prev,
            done: false,
            doneAt: undefined,
            left: nextRem,
            tot: Math.max(prev.tot, nextRem),
          };
        }
        return {
          ...prev,
          done: false,
          doneAt: undefined,
          end: now + nextRem * 1000,
          tot: Math.max(prev.tot, nextRem),
          left: nextRem,
        };
      });
      return;
    }

    // Session stopwatch actions (start / pause only; cannot reset to 0 or shift minutes)
    if (!activeSessionId) return;
    if (action === 'go' && !activeSession?.tm?.st) playTimerStart();
    if (action === 'pa' && activeSession?.tm?.st) playTimerPause();

    handleUpdateActiveSession((cur) => {
      const tm = cur.tm || { st: 0, acc: 0 };
      if (action === 'go') {
        if (tm.st) return cur;
        return { ...cur, tm: { ...tm, st: now } };
      }
      if (action === 'pa') {
        if (!tm.st) return cur;
        return {
          ...cur,
          tm: { ...tm, acc: (tm.acc || 0) + (now - tm.st) / 1000, st: 0 },
        };
      }
      return cur;
    });
  };

  const handleAutoTimer = (s: TrainingSession, exerciseIndex: number) => {
    unlockAudio();
    const restSec = pRest(s.exercises[exerciseIndex]?.rest);
    if (restSec > 0) {
      playTimerStart();
      startRestCountdown(restSec);
    }
    if (!s.tm?.st && !(s.tm?.acc && s.tm.acc > 0)) {
      const now = Date.now();
      setS((prev) => ({
        ...prev,
        sessions: prev.sessions.map((x) =>
          x.id === s.id ? { ...x, tm: { st: now, acc: 0, auto: 1 } } : x
        ),
      }));
    }
  };

  const handleStartWorkTimer = (s: TrainingSession, i: number, j: number) => {
    const ex = s.exercises[i];
    if (!ex || ex.circ) return;
    const cur = restTimerRef.current;
    if (
      cur &&
      cur.phase === 'work' &&
      !cur.done &&
      cur.workLink?.sid === s.id &&
      cur.workLink.exIdx === i &&
      cur.workLink.setIdx === j
    ) {
      handleTimerAction('rp');
      return;
    }
    unlockAudio();
    const now = Date.now();
    const st = ex.sets[j];
    const workSec = Math.max(5, parseWorkSeconds(st?.b, ex.tg, 45));
    const nextRestSec = pRest(ex.rest);
    handledRestEndRef.current = null;
    lastRestTickSecRef.current = -1;
    ivAlarm('work');
    setRestTimer({
      end: now + workSec * 1000,
      tot: workSec,
      base: workSec,
      done: false,
      paused: false,
      left: workSec,
      phase: 'work',
      workLabel: ex.name,
      nextRestSec,
      workLink: { sid: s.id, exIdx: i, setIdx: j, workSec },
    });
    if (!s.tm?.st && !(s.tm?.acc && s.tm.acc > 0)) {
      setS((prev) => ({
        ...prev,
        sessions: prev.sessions.map((x) =>
          x.id === s.id ? { ...x, tm: { st: now, acc: 0, auto: 1 } } : x
        ),
      }));
    }
  };

  // Interval Timer Handlers
  const handleStartIntervals = () => {
    unlockAudio();
    const plan = buildIntervalPlan(ivMode, ivCfg);
    if (!plan.length) return;
    const cum = [0];
    plan.forEach((p) => cum.push(cum[cum.length - 1] + p.d));
    const total = cum[cum.length - 1];
    completedCircuitSessionRef.current = null;
    setLastCircuitTarget(null);
    void requestWakeLock();
    ivAlarm(plan[0].k);
    setIntervalRunner({
      mode: 'run',
      m: ivMode,
      plan,
      cum,
      total,
      acc: 0,
      st: Date.now(),
      running: true,
      done: false,
      last: 0,
      sec: -1,
    });
  };

  const handleStartCircuitIntervals = (target: CircuitIntervalTarget) => {
    unlockAudio();
    const plan = buildCircuitIntervalPlan(target);
    if (!plan.length) return;
    const cum = [0];
    plan.forEach((p) => cum.push(cum[cum.length - 1] + p.d));
    const total = cum[cum.length - 1];
    completedCircuitSessionRef.current = null;
    setLastCircuitTarget(target);
    void requestWakeLock();
    ivAlarm(plan[0].k);
    setIntervalRunner({
      mode: 'run',
      m: 'custom',
      plan,
      cum,
      total,
      acc: 0,
      st: Date.now(),
      running: true,
      done: false,
      last: 0,
      sec: -1,
      circuit: {
        title: target.title,
        rounds: target.rounds,
        sessionId: target.sessionId,
        groupId: target.groupId,
        autoComplete: target.autoComplete,
      },
    });
    setActiveSessionId(null);
    setS((prev) => (prev.view === 'int' ? prev : { ...prev, view: 'int' }));
    showToast(`Circuito vinculado a intervalos`);
  };

  const handleIntervalAction = (action: 'p' | 'r' | 'n' | 'b' | 'c' | 'x') => {
    unlockAudio();
    const now = Date.now();
    if (action === 'c') {
      releaseWakeLock();
      setIntervalRunner(null);
      setLastCircuitTarget(null);
      return;
    }
    if (action === 'x') {
      if (intervalRunner?.circuit && lastCircuitTarget) {
        handleStartCircuitIntervals(lastCircuitTarget);
      } else {
        handleStartIntervals();
      }
      return;
    }
    if (action === 'p' && intervalRunner && !intervalRunner.done) {
      if (intervalRunner.running) playTimerPause();
      else playTimerStart();
    }
    if (action === 'r') {
      completedCircuitSessionRef.current = null;
      playTimerStart();
    }
    setIntervalRunner((prev) => {
      if (!prev) return null;
      const curEl = prev.acc + (prev.running && prev.st ? (now - prev.st) / 1000 : 0);
      if (action === 'p') {
        if (prev.running) {
          releaseWakeLock();
          return { ...prev, acc: curEl, st: 0, running: false };
        }
        void requestWakeLock();
        return { ...prev, st: now, running: true };
      }
      if (action === 'r') {
        void requestWakeLock();
        return { ...prev, acc: 0, st: now, running: true, done: false, last: 0, sec: -1 };
      }
      // Next ('n') or Back ('b') phase
      let idx = prev.plan.length - 1;
      for (let i = 0; i < prev.plan.length; i++) {
        if (curEl < prev.cum[i + 1]) {
          idx = i;
          break;
        }
      }
      const targetIdx =
        action === 'n'
          ? Math.min(prev.plan.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      const nextAcc = prev.cum[targetIdx];
      return {
        ...prev,
        acc: nextAcc,
        st: prev.running ? now : 0,
        last: targetIdx,
        sec: -1,
      };
    });
  };

  const isTrainerOrAdmin = roleState.role === 'trainer' || roleState.admin;
  const hasLinkedCoach = (myDoc.coaches || []).length > 0;
  const isCheckingGate = Boolean(me) && (!ready || (!isTrainerOrAdmin && !hasLinkedCoach && !invLoaded));
  const hasAppAccess = Boolean(
    me && ready && me.emailVerified && (isTrainerOrAdmin || hasLinkedCoach)
  );
  const stillBooting = !authResolved || !splashMinDone || isCheckingGate;

  useEffect(() => {
    if (!stillBooting && !bootSplashDone) {
      const t = window.setTimeout(() => setBootSplashDone(true), 260);
      return () => window.clearTimeout(t);
    }
  }, [stillBooting, bootSplashDone]);

  const showSplash = !bootSplashDone;
  const splashProgress = !authResolved
    ? 40
    : isCheckingGate
    ? 78
    : !splashMinDone
    ? 94
    : 100;

  const isCoach = S.role === 'coach';
  const isAdmin = roleState.admin;
  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Automatic linked reminder notification for athlete's today/tomorrow next session
  useEffect(() => {
    if (!me || !hasAppAccess || isCoach || !ready || S.notifEnabled === false) return;
    const today = todayStr();
    const tomorrow = iso(add(new Date(), 1));
    const upcoming = S.sessions
      .filter(
        (s) =>
          s.sport === S.sport &&
          s.user === S.user &&
          s.date >= today &&
          s.date <= tomorrow &&
          !isSessionFullyDone(s)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const nextSession = upcoming[0];
    if (!nextSession) return;

    const wm = notifWmRef.current;
    const reminderKey = `${today}::${nextSession.id}`;
    if (wm.lastNextReminder === reminderKey) return;
    wm.lastNextReminder = reminderKey;
    saveNotificationWatermark(me.uid, wm);

    const dayLbl = formatRelativeDayLabel(nextSession.date, today).toLowerCase();
    pushNotification(me.uid, {
      kind: 'next_session',
      title: `Próxima sesión ${dayLbl}`,
      body: `${nextSession.name || 'Entrenamiento planificado'} · Toca para entrenar en pantalla completa`,
      sessionId: nextSession.id,
      date: nextSession.date,
    });
  }, [me, hasAppAccess, isCoach, ready, S.sessions, S.user, S.sport, S.notifEnabled, pushNotification]);

  const dayPickerSessions = dayPickerDate
    ? S.sessions.filter(
        (s) => s.sport === S.sport && s.user === S.user && s.date === dayPickerDate
      )
    : [];

  return (
    <>
      <SplashScreen visible={showSplash} progress={splashProgress} />
      <OfflineIndicator />
      {!me ? (
        <LoginView onGoogleLogin={handleGoogleLogin} errorMsg={cloudMsg} />
      ) : !hasAppAccess ? (
        <InviteGateView
          me={me}
          loading={isCheckingGate}
          currentName={S.user || athleteNameRef.current}
          invIn={invIn}
          errorMsg={cloudMsg}
          onSaveName={handleSaveAthleteName}
          onAcceptInvite={handleAcceptInvite}
          onDeleteInvite={handleDeleteInvite}
          onSignOut={handleSignOut}
        />
      ) : (
        <>
          <NavigationShell
        S={S}
        os={resolvedOS}
        isAdmin={isAdmin}
        hasPendingInvites={invIn.length > 0}
        unreadNotifications={unreadNotifCount}
        intervalMiniLeft={intervalMiniLeft}
        restMiniLeft={restMiniLeft}
        restMiniPhase={restTimer?.phase || 'rest'}
        activeSessionMini={activeSessionMini}
        onNavigate={(view: ActiveView) => {
          haptic('light');
          updateState((prev) => ({ ...prev, view }));
        }}
        onOpenProfileSheet={() => setProfileSheetOpen(true)}
        onResumeActiveSession={(id) => setActiveSessionId(id)}
      >
        {storageWarn && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span>{storageWarn}</span>
          <button
            type="button"
            onClick={() => setStorageWarn('')}
            className="px-2 py-0.5 font-semibold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {S.view === 'team' && isCoach && (
        <TeamView
          S={S}
          onSelectAthlete={(user) =>
            updateState((prev) => ({ ...prev, user, pm: 0, view: 'month' }))
          }
          onAddAthlete={handleAddAthlete}
          onRequestDeleteAthlete={handleRequestDeleteAthlete}
        />
      )}

      {(S.view === 'month' || S.view === 'week' || S.view === 'year') && (
        <CalendarView
          S={S}
          notifications={notifications}
          unreadNotifCount={unreadNotifCount}
          notifPermission={notifPermission}
          onChangeView={(view) => updateState((prev) => ({ ...prev, view }))}
          onNavigatePeriod={handleNavigatePeriod}
          onJumpToDate={(anchor) => updateState((prev) => ({ ...prev, anchor }))}
          onChangeMetric={(metric: MetricKey) => updateState((prev) => ({ ...prev, metric }))}
          onOpenSession={(id) => setActiveSessionId(id)}
          onDayTap={handleDayTap}
          onClearSessions={handleClearSessions}
          onOpenNotifications={() => setNotificationsSheetOpen(true)}
          onRequestNotificationPermission={() => {
            void handleRequestNotifPermission();
          }}
        />
      )}

      {S.view === 'plan' && (
        <PlanView
          S={S}
          onUpdateState={updateState}
          onOpenImport={() => setImportSheetOpen(true)}
          onApplyPlan={handleApplyPlan}
          onStartCircuitIntervals={handleStartCircuitIntervals}
          onUploadAnnexImage={handleUploadAnnexImage}
          onDeleteMonth={handleDeleteMonth}
          onDeleteAnnex={handleDeleteAnnex}
        />
      )}

      {S.view === 'prog' && (
        <ProgressView
          S={S}
          onChangeGranularity={(pg) => updateState((prev) => ({ ...prev, pg }))}
          onChangeMetric={(metric) => updateState((prev) => ({ ...prev, metric }))}
          onChangeExercise={(pex) => updateState((prev) => ({ ...prev, pex }))}
        />
      )}

      {S.view === 'pr' && (
        <PRView
          S={S}
          onTrackExercise={(name) =>
            updateState((prev) => {
              if (
                prev.prx.some(
                  (x) => x.user === prev.user && nz(x.name) === nz(name)
                )
              ) {
                return prev;
              }
              return {
                ...prev,
                prx: [...prev.prx, { id: uid(), user: prev.user, name }],
              };
            })
          }
          onTrackAllFromPlan={(names) =>
            updateState((prev) => {
              const existing = new Set(
                prev.prx.filter((x) => x.user === prev.user).map((x) => nz(x.name))
              );
              const added = names
                .filter((n) => !existing.has(nz(n)))
                .map((name) => ({ id: uid(), user: prev.user, name }));
              return { ...prev, prx: [...prev.prx, ...added] };
            })
          }
          onUntrackExercise={(id) =>
            updateState((prev) => ({
              ...prev,
              prx: prev.prx.filter((x) => x.id !== id),
            }))
          }
          onAddManualPR={(name, kg, repsVal, date, isTime) => {
            updateState((prev) => ({
              ...prev,
              prs: [
                ...prev.prs,
                {
                  id: uid(),
                  user: prev.user,
                  name,
                  kg,
                  reps: repsVal,
                  date,
                  ...(isTime ? { mt: 'time' } : {}),
                },
              ],
            }));
            playActionCue('save');
            showToast('Récord personal guardado');
          }}
          onDeleteManualPR={(id) => {
            updateState((prev) => ({
              ...prev,
              prs: prev.prs.filter((x) => x.id !== id),
            }));
            playActionCue('delete');
            showToast('Récord eliminado');
          }}
        />
      )}

      {S.view === 'int' && (
        <IntervalsView
          mode={ivMode}
          cfg={ivCfg}
          runner={intervalRunner}
          elapsed={intervalElapsed}
          flash={intervalFlash}
          sound={S.snd || DEFAULT_SOUND_SETTINGS}
          circuitTargets={circuitTargets}
          onUpdateSound={handleUpdateSound}
          onChangeMode={(m) =>
            updateState((prev) => ({
              ...prev,
              iv: {
                m,
                cfg: prev.iv?.cfg || structuredClone(IVDEF),
              },
            }))
          }
          onUpdateField={(key, val) =>
            updateState((prev) => {
              const curCfg = prev.iv?.cfg || structuredClone(IVDEF);
              return {
                ...prev,
                iv: {
                  m: prev.iv?.m || 'tabata',
                  cfg: {
                    ...curCfg,
                    [ivMode]: { ...(curCfg[ivMode] || IVDEF[ivMode]), [key]: val },
                  },
                },
              };
            })
          }
          onStart={handleStartIntervals}
          onStartCircuit={handleStartCircuitIntervals}
          onAction={handleIntervalAction}
        />
      )}

      {S.view === 'perfil' && (
        <ProfileView
          S={S}
          me={me}
          roleState={roleState}
          myDoc={myDoc}
          pendingInvitesCount={invIn.length}
          unreadNotifCount={unreadNotifCount}
          notifPermission={notifPermission}
          onRequestNotificationPermission={() => {
            void handleRequestNotifPermission();
          }}
          onOpenNotifications={() => setNotificationsSheetOpen(true)}
          onUpdateState={updateState}
          onNavigate={(view) => updateState((prev) => ({ ...prev, view }))}
          onOpenCloud={() => setCloudSheetOpen(true)}
          onGoogleLogin={handleGoogleLogin}
          onSignOut={handleSignOut}
          onAddBodyWeight={handleAddBodyWeight}
          onDeleteBodyWeight={handleDeleteBodyWeight}
          onAddAthlete={handleAddAthlete}
          onDeleteAthlete={handleRequestDeleteAthlete}
        />
      )}

      {S.view === 'admin' && <AdminView me={me} isAdmin={isAdmin} />}
      </NavigationShell>

      {/* Modals & Native Bottom Sheets */}
      <AthleteWorkoutView
        session={activeSession}
        S={S}
        restTimer={restTimer}
        restLeft={restLeft}
        nowTick={nowTick}
        sound={S.snd || DEFAULT_SOUND_SETTINGS}
        onToggleSound={handleToggleSound}
        onClose={() => setActiveSessionId(null)}
        onGoToProfile={() => {
          setActiveSessionId(null);
          updateState((prev) => ({ ...prev, view: 'perfil' }));
        }}
        onUpdateSession={handleUpdateActiveSession}
        onFinishSession={handleFinishSession}
        onUnfinishSession={handleUnfinishSession}
        onStartCircuitIntervals={handleStartCircuitIntervals}
        onDuplicatePlus7={handleDuplicatePlus7}
        onDeleteSession={isCoach ? handleDeleteSession : undefined}
        onTimerAction={handleTimerAction}
        onAutoTimer={handleAutoTimer}
        onStartWorkTimer={handleStartWorkTimer}
      />

      <DayPickerSheet
        date={dayPickerDate}
        sessions={dayPickerSessions}
        os={resolvedOS}
        onClose={() => setDayPickerDate(null)}
        onSelectSession={(id) => {
          setDayPickerDate(null);
          setActiveSessionId(id);
        }}
        onCreateManualSession={handleCreateManualSession}
      />

      <NotificationsSheet
        open={notificationsSheetOpen}
        os={resolvedOS}
        isCoach={isCoach}
        notifications={notifications}
        notifEnabled={S.notifEnabled !== false}
        permission={notifPermission}
        onClose={() => setNotificationsSheetOpen(false)}
        onToggleNotifEnabled={() =>
          updateState((prev) => ({
            ...prev,
            notifEnabled: prev.notifEnabled === false,
          }))
        }
        onRequestPermission={() => {
          void handleRequestNotifPermission();
        }}
        onMarkAllRead={handleMarkAllNotifsRead}
        onClearAll={handleClearAllNotifs}
        onClickNotification={handleClickNotification}
      />

      <ProfileSheet
        open={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        S={S}
        os={resolvedOS}
        me={me}
        roleState={roleState}
        myDoc={myDoc}
        pendingInvitesCount={invIn.length}
        unreadNotifCount={unreadNotifCount}
        notifPermission={notifPermission}
        onNavigate={(view) => updateState((prev) => ({ ...prev, view }))}
        onUpdateState={updateState}
        onOpenNotifications={() => setNotificationsSheetOpen(true)}
        onRequestNotificationPermission={() => {
          void handleRequestNotifPermission();
        }}
        onOpenCloud={() => setCloudSheetOpen(true)}
        onGoogleLogin={handleGoogleLogin}
        onSignOut={handleSignOut}
        onAddBodyWeight={handleAddBodyWeight}
      />

      <CloudSheet
        open={cloudSheetOpen}
        onClose={() => setCloudSheetOpen(false)}
        S={S}
        os={resolvedOS}
        me={me}
        ready={ready}
        isCoach={isCoach}
        cloudMsg={cloudMsg}
        myDoc={myDoc}
        invIn={invIn}
        invOut={invOut}
        onGoogleLogin={handleGoogleLogin}
        onSignOut={handleSignOut}
        onInviteStudent={handleInviteStudent}
        onAcceptInvite={handleAcceptInvite}
        onDeleteInvite={handleDeleteInvite}
        onUnlinkCoach={handleUnlinkCoach}
        onRestoreBackup={(data) => {
          setS((prev) =>
            normalizeState({
              ...prev,
              ...sanRemote(data),
            })
          );
          setCloudSheetOpen(false);
          playActionCue('save');
          showToast('Copia de seguridad restaurada');
        }}
      />

      <ImportRoutineSheet
        open={importSheetOpen}
        onClose={() => setImportSheetOpen(false)}
        os={resolvedOS}
        isLinkedAthlete={Boolean((myDoc.coaches || []).length > 0 && S.role === 'atleta')}
        onSaveMonths={handleSaveImportedMonths}
      />

      <DeleteAthleteModal
        athleteName={deleteAthleteTarget}
        S={S}
        os={resolvedOS}
        busy={deleteAthleteBusy}
        onClose={() => setDeleteAthleteTarget(null)}
        onConfirmDelete={handleConfirmDeleteAthlete}
      />

      <AnimatePresence>
        {notifBanner && !activeSession && (
          <motion.div
            key={notifBanner.id}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-[66px] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-md z-50"
          >
            <div className="flex items-start gap-3 p-3 rounded-2xl border border-[#A259FF]/50 bg-[#0A051A]/95 backdrop-blur-xl shadow-2xl shadow-[#0A051A]/60">
              <button
                type="button"
                onClick={() => handleClickNotification(notifBanner)}
                className="flex-1 min-w-0 flex items-start gap-2.5 text-left cursor-pointer"
              >
                <span className="w-8 h-8 rounded-xl bg-[#A259FF]/20 text-[#E0C8FF] flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-xs font-bold text-white truncate">
                    {notifBanner.title}
                  </b>
                  <span className="block text-[11px] text-[#CFC8DD] leading-snug">
                    {notifBanner.body}
                  </span>
                  {notifBanner.sessionId && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#E0C8FF] mt-1">
                      <Maximize2 className="w-3 h-3" />
                      {isCoach ? 'Abrir sesión' : 'Entrenar en pantalla completa'}
                    </span>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setNotifBanner(null)}
                aria-label="Cerrar aviso"
                className="text-[var(--mut)] hover:text-white p-1 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key={toastMsg}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 -translate-x-1/2 bottom-[calc(82px+env(safe-area-inset-bottom,0px))] z-50 pointer-events-none"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-[var(--ac2)]/35 bg-[var(--surface-3)]/95 backdrop-blur-xl shadow-xl text-xs font-semibold text-[var(--tx)] whitespace-nowrap">
              <CheckCircle2 className="w-4 h-4 text-[var(--ac2)] shrink-0" />
              <span>{toastMsg}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
        </>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
