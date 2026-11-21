import type {
  AppNotification,
  NotifPermissionState,
  TrainingSession,
} from '../types/trazik';

const NOTIF_STORAGE_PREFIX = 'plan_v1_notifs_';
const WATERMARK_STORAGE_PREFIX = 'plan_v1_notif_wm_';
const MAX_NOTIFS = 40;

export interface NotificationWatermark {
  cts?: number;
  planInitialized?: boolean;
  sessionsInitialized?: boolean;
  coachSessionMap?: Record<string, string>;
  studentBaselines?: Record<string, boolean>;
  finishedByAth?: Record<string, number>;
  lastNextReminder?: string;
}

export function getNotificationPermission(): NotifPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotifPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const res = await window.Notification.requestPermission();
    return res;
  } catch {
    return window.Notification.permission || 'denied';
  }
}

export async function dispatchSystemNotification(
  title: string,
  body: string,
  tag?: string
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }
  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/favicon-32x32.png',
    tag: tag || `trazikfit-${Date.now()}`,
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return true;
      }
    }
    new window.Notification(title, options);
    return true;
  } catch {
    try {
      new window.Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }
}

export function loadUserNotifications(uid: string): AppNotification[] {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(`${NOTIF_STORAGE_PREFIX}${uid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_NOTIFS);
  } catch {
    return [];
  }
}

export function saveUserNotifications(uid: string, list: AppNotification[]): void {
  if (!uid) return;
  try {
    localStorage.setItem(
      `${NOTIF_STORAGE_PREFIX}${uid}`,
      JSON.stringify(list.slice(0, MAX_NOTIFS))
    );
  } catch {
    // ignore storage errors
  }
}

export function loadNotificationWatermark(uid: string): NotificationWatermark {
  if (!uid) return {};
  try {
    const raw = localStorage.getItem(`${WATERMARK_STORAGE_PREFIX}${uid}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as NotificationWatermark) : {};
  } catch {
    return {};
  }
}

export function saveNotificationWatermark(uid: string, wm: NotificationWatermark): void {
  if (!uid) return;
  try {
    localStorage.setItem(`${WATERMARK_STORAGE_PREFIX}${uid}`, JSON.stringify(wm));
  } catch {
    // ignore storage errors
  }
}

export function buildSessionAlertSignature(s: TrainingSession): string {
  const exSig = (s.exercises || [])
    .map((e) => `${e.name}:${e.sets.length}:${e.tg || ''}:${e.obs || ''}`)
    .join('|');
  return `${s.date}::${s.name || ''}::${exSig}`;
}

export function formatNotifTime(ts: number): string {
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH} h`;
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function isSessionFullyDone(s: TrainingSession): boolean {
  return (
    s.exercises.length > 0 &&
    s.exercises.every((ex) => ex.sets.length > 0 && ex.sets.every((st) => st.done))
  );
}

export function formatRelativeDayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return 'Hoy';
  const d1 = new Date(`${today}T00:00:00`);
  const d2 = new Date(`${dateStr}T00:00:00`);
  const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays > 1 && diffDays <= 7) return `En ${diffDays} días`;
  if (diffDays < -1 && diffDays >= -30) return `Hace ${Math.abs(diffDays)} días`;
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}
