import { useState } from 'react';
import {
  BarChart3,
  Bell,
  BellRing,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Cloud,
  Edit3,
  LogOut,
  Palette,
  Scale,
  Settings,
  Shield,
  Sun,
  Trophy,
  Users,
  Volume2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BottomSheet } from './BottomSheet';
import {
  DEFAULT_SOUND_SETTINGS,
  haptic,
  playTimerStart,
  unlockAudio,
} from '../lib/audioHaptics';
import { fdate, fmt, getLabels, setM, todayStr } from '../lib/metrics';
import type {
  ActiveView,
  AppState,
  NotifPermissionState,
  ResolvedOS,
  SoundPreset,
  UserRoleState,
} from '../types/trazik';

interface ProfileSheetProps {
  open: boolean;
  onClose: () => void;
  S: AppState;
  os: ResolvedOS;
  me: User | null;
  roleState: UserRoleState;
  myDoc: { cn?: Record<string, string> };
  pendingInvitesCount: number;
  unreadNotifCount: number;
  notifPermission: NotifPermissionState;
  onNavigate: (view: ActiveView) => void;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onOpenNotifications: () => void;
  onRequestNotificationPermission: () => void;
  onOpenCloud: () => void;
  onGoogleLogin: () => void;
  onSignOut: () => void;
  onAddBodyWeight: (rawKg: string, date: string) => boolean;
}

export function ProfileSheet({
  open,
  onClose,
  S,
  os,
  me,
  roleState,
  myDoc,
  pendingInvitesCount,
  unreadNotifCount,
  notifPermission,
  onNavigate,
  onUpdateState,
  onOpenNotifications,
  onRequestNotificationPermission,
  onOpenCloud,
  onGoogleLogin,
  onSignOut,
  onAddBodyWeight,
}: ProfileSheetProps) {
  const today = todayStr();
  const [kgInput, setKgInput] = useState('');
  const [dateInput, setDateInput] = useState(today);
  const [err, setErr] = useState('');
  const [configOpen, setConfigOpen] = useState(false);

  const profStatus = (() => {
    if (S.role === 'coach') return 'ok';
    if (!me) return 'nologin';
    const P = (S.prof || {})[S.user];
    return P && P.uid && P.uid !== me.uid ? 'locked' : 'ok';
  })();

  const labels = getLabels(S.lbl);
  const P = (S.prof || {})[S.user];
  const displayName = me?.displayName || P?.name || S.user;
  const displayEmail = me?.email || P?.email || '';
  const coachNames = myDoc?.cn ? Object.values(myDoc.cn).filter(Boolean) : [];

  const stats = (() => {
    let ses = 0;
    let ser = 0;
    let ton = 0;
    const mySess = S.sessions.filter((s) => s.sport === S.sport && s.user === S.user);
    mySess.forEach((z) => {
      const bw = parseFloat(String(z.bw || 0)) || 0;
      let any = false;
      z.exercises.forEach((e) =>
        e.sets.forEach((x) => {
          if (x.done) {
            any = true;
            ser++;
            ton += setM(e, x, bw).ton;
          }
        })
      );
      if (any) ses++;
    });
    return { ses, ser, ton };
  })();

  const H = (S.bwh || [])
    .filter((x) => x.user === S.user)
    .sort((a, b) => a.date.localeCompare(b.date));
  const curBw = H.length ? H[H.length - 1] : null;

  const accountTypeText = !me
    ? 'Cuenta requerida'
    : roleState.role === 'trainer'
    ? roleState.admin
      ? 'Entrenador · Administrador'
      : 'Entrenador'
    : 'Atleta invitado';

  const isLight = S.theme === 'light';
  const snd = S.snd || DEFAULT_SOUND_SETTINGS;
  const notifOn = S.notifEnabled !== false;

  const go = (v: ActiveView) => {
    haptic('light');
    onClose();
    onNavigate(v);
  };

  return (
    <BottomSheet open={open} onClose={onClose} os={os} maxWidthClass="max-w-xl">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Mi perfil</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptic('light');
                onClose();
                onOpenNotifications();
              }}
              aria-label="Notificaciones"
              className={`tf-tap relative w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer ${
                unreadNotifCount > 0
                  ? 'border-[var(--ac2)]/65 bg-[var(--ac)]/20 text-[var(--ac2)]'
                  : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--mut)] hover:text-[var(--ac2)]'
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[#A259FF] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--bg)] tabular-nums">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {profStatus === 'ok' ? (
          <div className="tf-card p-4 flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#A259FF] to-[#321C6A] text-white text-2xl font-bold flex items-center justify-center shrink-0">
              {String(displayName || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <b className="text-lg block truncate">{displayName}</b>
              {displayEmail && (
                <span className="text-xs text-[var(--mut)] block break-all">{displayEmail}</span>
              )}
              <span className="text-xs text-[var(--mut)] block mt-0.5">
                {S.role === 'coach'
                  ? `Entrenador · ${labels.sing} seleccionado: ${S.user}`
                  : `Atleta · ${S.user}`}
              </span>
              {coachNames.length > 0 && S.role !== 'coach' && (
                <span className="text-xs text-[var(--mut)] block">
                  Entrenador: {coachNames.join(', ')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="tf-card p-4 space-y-2">
            <b className="text-base block">
              {profStatus === 'locked' ? 'Perfil de otra cuenta' : 'Perfil protegido'}
            </b>
            <p className="text-xs text-[var(--mut)] leading-relaxed">
              {profStatus === 'locked'
                ? 'Este perfil pertenece a otra cuenta de Google. Cierra sesión y entra con la cuenta registrada de este atleta.'
                : 'Tu perfil y tu peso corporal solo se muestran al iniciar sesión con tu cuenta de Google. Tus datos no se modifican.'}
            </p>
            {profStatus === 'locked' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className="w-full min-h-[40px] rounded-xl border border-[var(--line)] text-sm font-medium cursor-pointer"
              >
                Cerrar sesión
              </button>
            )}
          </div>
        )}

        {pendingInvitesCount > 0 && (
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onClose();
              onOpenCloud();
            }}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left text-white border border-[#E0C8FF]/35 bg-gradient-to-r from-[#A259FF]/85 to-[#6D28D9]/90 cursor-pointer"
          >
            <Cloud className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-xs font-semibold">
              Tienes {pendingInvitesCount} invitación(es) pendiente(s) · Toca para responder
            </span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        )}

        {profStatus === 'ok' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="tf-card p-3">
                <span className="block text-[10px] font-semibold text-[var(--mut)] tracking-wider">
                  SESIONES
                </span>
                <b className="block text-xl font-bold tabular-nums mt-0.5">{stats.ses}</b>
              </div>
              <div className="tf-card p-3">
                <span className="block text-[10px] font-semibold text-[var(--mut)] tracking-wider">
                  VOLUMEN
                </span>
                <b className="block text-xl font-bold tabular-nums mt-0.5">{fmt(stats.ton)} kg</b>
              </div>
              <div className="tf-card p-3">
                <span className="block text-[10px] font-semibold text-[var(--mut)] tracking-wider">
                  SERIES
                </span>
                <b className="block text-xl font-bold tabular-nums mt-0.5">{stats.ser}</b>
              </div>
            </div>

            <div className="tf-card p-4 space-y-2.5">
              <b className="text-sm block">Peso corporal</b>
              <div className="font-display text-4xl font-extrabold text-[var(--ac2)] tabular-nums">
                {curBw ? (
                  <>
                    {fmt(curBw.kg)} <span className="text-base">kg</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
              {curBw && (
                <span className="block text-xs text-[var(--mut)]">{fdate(curBw.date)}</span>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  className="tf-input px-3 py-2 text-sm"
                  placeholder="Peso (kg)"
                  value={kgInput}
                  onChange={(e) => {
                    setKgInput(e.target.value);
                    if (err) setErr('');
                  }}
                />
                <input
                  type="date"
                  className="tf-input px-3 py-2 text-sm"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                />
              </div>
              {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
              <button
                type="button"
                onClick={() => {
                  if (onAddBodyWeight(kgInput, dateInput || today)) {
                    haptic('success');
                    setKgInput('');
                    setErr('');
                  } else {
                    setErr('Ingresa un peso válido (entre 20 y 400 kg).');
                  }
                }}
                className="tf-btn-pri w-full min-h-[42px] rounded-xl text-sm font-semibold cursor-pointer"
              >
                Guardar peso
              </button>
            </div>
          </>
        )}

        <div className="tf-card divide-y divide-[var(--line)]/60 overflow-hidden">
          {profStatus === 'ok' && (
            <button
              type="button"
              onClick={() => go('perfil')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)]/50 cursor-pointer"
            >
              <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <b className="block text-sm">Peso corporal e historial</b>
                <small className="block text-xs text-[var(--mut)]">Gráfica y perfil completo</small>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
            </button>
          )}

          <button
            type="button"
            onClick={() => go('pr')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
          >
            <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </span>
            <span className="flex-1 text-sm font-semibold">Récords personales (PR)</span>
            <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
          </button>

          <button
            type="button"
            onClick={() => go('prog')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
          >
            <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </span>
            <span className="flex-1 text-sm font-semibold">Progreso</span>
            <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
          </button>

          <button
            type="button"
            onClick={() => go('plan')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
          >
            <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" />
            </span>
            <span className="flex-1 text-sm font-semibold">
              {S.role === 'coach' ? 'Plan' : 'Mi programa'}
            </span>
            <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
          </button>

          {S.role === 'coach' && (
            <button
              type="button"
              onClick={() => go('perfil')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                <Edit3 className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <b className="block text-sm">Atletas y nombres</b>
                <small className="block text-xs text-[var(--mut)]">
                  Agregar o quitar atletas y personalizar etiquetas
                </small>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
            </button>
          )}
        </div>

        {/* Configuraciones Section (Apariencia/Colores, Sonido, Volumen, Notificaciones, Cuenta) */}
        <div className="tf-card overflow-hidden">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setConfigOpen((v) => !v);
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-2)]/40 cursor-pointer"
          >
            <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <b className="block text-sm font-bold">Configuraciones</b>
              <small className="block text-xs text-[var(--mut)] truncate">
                Apariencia, colores, sonido, volumen, notificaciones y cuenta
              </small>
            </div>
            {configOpen ? (
              <ChevronUp className="w-5 h-5 text-[var(--mut)] shrink-0" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[var(--mut)] shrink-0" />
            )}
          </button>

          {configOpen && (
            <div className="border-t border-[var(--line)]/60 divide-y divide-[var(--line)]/60">
              {/* Apariencia y colores */}
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  onUpdateState((prev) => ({
                    ...prev,
                    theme: isLight ? 'dark' : 'light',
                  }));
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
              >
                <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/15 text-[var(--ac2)] flex items-center justify-center shrink-0">
                  {isLight ? <Sun className="w-4 h-4" /> : <Palette className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <b className="block text-sm">Apariencia y colores (Tema claro)</b>
                  <small className="block text-xs text-[var(--mut)]">
                    {isLight
                      ? 'Modo claro activo · Toca para volver al violeta oscuro'
                      : 'Modo oscuro oficial TrazikFit · Toca para tema claro'}
                  </small>
                </div>
                <span
                  className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${
                    isLight ? 'bg-[var(--ac)]' : 'bg-[var(--mut)]/30'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                      isLight ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>

              {/* Sonido y volumen */}
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/15 text-[var(--ac2)] flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <b className="block text-sm">Sonido y volumen</b>
                    <small className="block text-xs text-[var(--mut)]">
                      Alertas de inicio, pausa y fin de descanso
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      const nextEnabled = !snd.enabled;
                      onUpdateState((prev) => ({
                        ...prev,
                        snd: { ...(prev.snd || DEFAULT_SOUND_SETTINGS), enabled: nextEnabled },
                      }));
                      if (nextEnabled) {
                        unlockAudio();
                        playTimerStart(true);
                      }
                    }}
                    aria-label="Activar o desactivar sonidos"
                    className={`w-12 h-7 rounded-full relative transition-colors shrink-0 cursor-pointer ${
                      snd.enabled ? 'bg-[var(--ac)]' : 'bg-[var(--mut)]/30'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                        snd.enabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center gap-3 pl-11">
                  <span className="text-xs text-[var(--mut)] w-14 shrink-0">Volumen</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(snd.volume * 100)}
                    onChange={(e) => {
                      const vol = Math.min(1, Math.max(0, Number(e.target.value) / 100));
                      onUpdateState((prev) => ({
                        ...prev,
                        snd: { ...(prev.snd || DEFAULT_SOUND_SETTINGS), volume: vol },
                      }));
                    }}
                    className="tf-range flex-1"
                    aria-label="Volumen de sonidos"
                  />
                  <span className="text-xs font-mono-num w-9 text-right text-[var(--mut)]">
                    {Math.round(snd.volume * 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-2 pl-11">
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--surface-2)] flex-1">
                    {(
                      [
                        ['athletic', 'Atlético'],
                        ['chime', 'Campana'],
                        ['pulse', 'Pulso'],
                      ] as [SoundPreset, string][]
                    ).map(([k, lbl]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          haptic('light');
                          onUpdateState((prev) => ({
                            ...prev,
                            snd: { ...(prev.snd || DEFAULT_SOUND_SETTINGS), preset: k },
                          }));
                        }}
                        className={`tf-tap py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                          snd.preset === k
                            ? 'bg-[var(--ac)] text-white shadow-sm'
                            : 'text-[var(--mut)]'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      unlockAudio();
                      playTimerStart(true);
                    }}
                    className="tf-tap min-h-[32px] px-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Probar
                  </button>
                </div>
              </div>

              {/* Notificaciones */}
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/15 text-[var(--ac2)] flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <b className="block text-sm">Notificaciones</b>
                    <small className="block text-xs text-[var(--mut)]">
                      {S.role === 'coach'
                        ? 'Avisos cuando tus atletas terminan sesiones'
                        : 'Cambios en planificación y recordatorios de sesión'}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      const nextVal = !notifOn;
                      onUpdateState((prev) => ({ ...prev, notifEnabled: nextVal }));
                      if (nextVal && notifPermission === 'default') {
                        onRequestNotificationPermission();
                      }
                    }}
                    aria-label="Activar o desactivar notificaciones"
                    className={`w-12 h-7 rounded-full relative transition-colors shrink-0 cursor-pointer ${
                      notifOn ? 'bg-[var(--ac)]' : 'bg-[var(--mut)]/30'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                        notifOn ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-11">
                  {notifPermission === 'default' && (
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        onRequestNotificationPermission();
                      }}
                      className="tf-tap px-3 py-1.5 rounded-xl bg-[var(--ac)]/20 border border-[var(--ac2)]/35 text-xs font-semibold text-[var(--ac2)] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      Activar avisos del dispositivo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onClose();
                      onOpenNotifications();
                    }}
                    className="tf-tap px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium text-[var(--tx)] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5 text-[var(--ac2)]" />
                    Centro de avisos{unreadNotifCount > 0 ? ` (${unreadNotifCount})` : ''}
                  </button>
                </div>
              </div>

              {/* Cuenta y respaldos */}
              <div className="divide-y divide-[var(--line)]/60">
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    onClose();
                    if (me) onOpenCloud();
                    else onGoogleLogin();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/15 text-[var(--ac2)] flex items-center justify-center shrink-0">
                    <Cloud className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <b className="block text-sm">Cuenta y copias de seguridad</b>
                    <small className="block text-xs text-[var(--mut)] truncate">
                      {me ? `${me.email || ''} · Vínculos y respaldo` : 'Sincronizar con Google'}
                    </small>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
                </button>

                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/15 text-[var(--ac2)] flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <b className="block text-sm">Tipo de cuenta</b>
                    <small className="block text-xs text-[var(--mut)]">
                      {accountTypeText} · lo define el administrador
                    </small>
                  </div>
                </div>

                {me && roleState.admin && (
                  <button
                    type="button"
                    onClick={() => go('admin')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/15 text-[var(--ac2)] flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <b className="block text-sm">Administración</b>
                      <small className="block text-xs text-[var(--mut)]">Usuarios y roles</small>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
                  </button>
                )}

                {me && profStatus !== 'locked' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSignOut();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-[var(--mut)] hover:text-[var(--danger)] cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-xl bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                      <LogOut className="w-4 h-4" />
                    </span>
                    <span className="flex-1 text-sm font-semibold">Cerrar sesión</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
