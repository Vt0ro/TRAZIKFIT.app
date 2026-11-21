import {
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Maximize2,
  Trash2,
  X,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { haptic } from '../lib/audioHaptics';
import { formatNotifTime } from '../lib/notifications';
import type {
  AppNotification,
  NotifPermissionState,
  ResolvedOS,
} from '../types/trazik';

interface NotificationsSheetProps {
  open: boolean;
  os: ResolvedOS;
  isCoach: boolean;
  notifications: AppNotification[];
  notifEnabled: boolean;
  permission: NotifPermissionState;
  onClose: () => void;
  onToggleNotifEnabled: () => void;
  onRequestPermission: () => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onClickNotification: (item: AppNotification) => void;
}

export function NotificationsSheet({
  open,
  os,
  isCoach,
  notifications,
  notifEnabled,
  permission,
  onClose,
  onToggleNotifEnabled,
  onRequestPermission,
  onMarkAllRead,
  onClearAll,
  onClickNotification,
}: NotificationsSheetProps) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderIcon = (kind: AppNotification['kind']) => {
    if (kind === 'plan_change') {
      return (
        <span className="w-9 h-9 rounded-xl bg-[#A259FF]/20 text-[#E0C8FF] flex items-center justify-center shrink-0">
          <ClipboardList className="w-4.5 h-4.5" />
        </span>
      );
    }
    if (kind === 'session_done') {
      return (
        <span className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4.5 h-4.5" />
        </span>
      );
    }
    return (
      <span className="w-9 h-9 rounded-xl bg-[#6D28D9]/25 text-[#A259FF] flex items-center justify-center shrink-0">
        <CalendarClock className="w-4.5 h-4.5" />
      </span>
    );
  };

  return (
    <BottomSheet open={open} onClose={onClose} os={os} maxWidthClass="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold leading-tight">Notificaciones</h3>
              <p className="text-[11px] text-[var(--mut)]">
                {isCoach
                  ? 'Avisos cuando tus atletas finalizan sesiones'
                  : 'Cambios en planificación y recordatorios de sesión'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar notificaciones"
            className="w-9 h-9 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toggle & Device Notification Permission */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]/80 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {notifEnabled ? (
                <Bell className="w-4 h-4 text-[var(--ac2)] shrink-0" />
              ) : (
                <BellOff className="w-4 h-4 text-[var(--mut)] shrink-0" />
              )}
              <div className="min-w-0">
                <b className="block text-xs font-semibold">Alertas activas</b>
                <span className="block text-[11px] text-[var(--mut)]">
                  {notifEnabled
                    ? 'Recibes avisos en la app y del dispositivo'
                    : 'Notificaciones pausadas'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onToggleNotifEnabled();
              }}
              aria-label="Activar o desactivar notificaciones"
              className={`w-11 h-6 rounded-full relative transition-colors shrink-0 cursor-pointer ${
                notifEnabled ? 'bg-[var(--ac)]' : 'bg-[var(--mut)]/30'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  notifEnabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {permission === 'default' && notifEnabled && (
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onRequestPermission();
              }}
              className="tf-btn-pri w-full min-h-[40px] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <BellRing className="w-4 h-4" />
              Permitir notificaciones del navegador / dispositivo
            </button>
          )}

          {permission === 'granted' && notifEnabled && (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Notificaciones del dispositivo habilitadas.
            </p>
          )}

          {permission === 'denied' && notifEnabled && (
            <p className="text-[11px] text-amber-300 leading-snug">
              El navegador bloqueó los avisos externos; seguirás viendo todas las alertas aquí dentro de la app.
            </p>
          )}
        </div>

        {/* Actions row */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--mut)]">
              {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    onMarkAllRead();
                  }}
                  className="text-xs font-medium text-[var(--ac2)] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--ac)]/15 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar leídas
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  onClearAll();
                }}
                className="text-xs font-medium text-[var(--mut)] hover:text-[var(--danger)] flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar
              </button>
            </div>
          </div>
        )}

        {/* Notifications List */}
        {notifications.length > 0 ? (
          <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-0.5">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  haptic('light');
                  onClickNotification(item);
                }}
                className={`w-full text-left rounded-2xl border p-3 flex items-start gap-3 transition-colors cursor-pointer ${
                  item.read
                    ? 'border-[var(--line)]/60 bg-[var(--surface-2)]/50 opacity-85'
                    : 'border-[var(--ac2)]/45 bg-[var(--ac)]/12'
                }`}
              >
                {renderIcon(item.kind)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-xs sm:text-sm font-semibold truncate">{item.title}</b>
                    <span className="text-[10px] text-[var(--mut)] whitespace-nowrap shrink-0">
                      {formatNotifTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--mut)] mt-0.5 leading-snug">{item.body}</p>
                  {item.sessionId && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ac2)] mt-1.5">
                      <Maximize2 className="w-3 h-3" />
                      {isCoach ? 'Ver sesión del atleta' : 'Abrir sesión en pantalla completa'}
                    </span>
                  )}
                </div>
                {!item.read && (
                  <span className="w-2 h-2 rounded-full bg-[#A259FF] shrink-0 mt-1.5" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--line)] py-8 px-4 text-center space-y-1.5">
            <Bell className="w-7 h-7 text-[var(--mut)] mx-auto opacity-60" />
            <b className="block text-sm font-semibold">Sin notificaciones nuevas</b>
            <p className="text-xs text-[var(--mut)] max-w-xs mx-auto">
              {isCoach
                ? 'Te avisaremos automáticamente aquí cada vez que uno de tus atletas termine un entrenamiento.'
                : 'Te avisaremos aquí ante cualquier cambio en tu planificación y con el recordatorio de tu próxima sesión.'}
            </p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
