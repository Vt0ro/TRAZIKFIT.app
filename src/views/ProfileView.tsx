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
  LogOut,
  Palette,
  Settings,
  Shield,
  Sun,
  Trophy,
  Volume2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { LineChart } from '../components/Charts';
import { PWAInstallButton } from '../components/PWABanners';
import {
  DEFAULT_SOUND_SETTINGS,
  haptic,
  playTimerStart,
  unlockAudio,
} from '../lib/audioHaptics';
import { add, cleanName, fdate, fmt, getLabels, iso, setM, todayStr } from '../lib/metrics';
import type {
  ActiveView,
  AppState,
  NotifPermissionState,
  SoundPreset,
  UserRoleState,
} from '../types/trazik';

interface ProfileViewProps {
  S: AppState;
  me: User | null;
  roleState: UserRoleState;
  myDoc: { cn?: Record<string, string> };
  pendingInvitesCount: number;
  unreadNotifCount: number;
  notifPermission: NotifPermissionState;
  onRequestNotificationPermission: () => void;
  onOpenNotifications: () => void;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onNavigate: (view: ActiveView) => void;
  onOpenCloud: () => void;
  onGoogleLogin: () => void;
  onSignOut: () => void;
  onAddBodyWeight: (rawKg: string, date: string) => boolean;
  onDeleteBodyWeight: (id: string) => void;
  onAddAthlete: (name: string) => string | null;
  onDeleteAthlete: (name: string) => void;
}

export function ProfileView({
  S,
  me,
  roleState,
  myDoc,
  pendingInvitesCount,
  unreadNotifCount,
  notifPermission,
  onRequestNotificationPermission,
  onOpenNotifications,
  onUpdateState,
  onNavigate,
  onOpenCloud,
  onGoogleLogin,
  onSignOut,
  onAddBodyWeight,
  onDeleteBodyWeight,
  onAddAthlete,
  onDeleteAthlete,
}: ProfileViewProps) {
  const today = todayStr();
  const [bwInput, setBwInput] = useState('');
  const [bwDate, setBwDate] = useState(today);
  const [bwError, setBwError] = useState('');
  const [newAth, setNewAth] = useState('');
  const [athError, setAthError] = useState('');
  const [lblSing, setLblSing] = useState(S.lbl?.sing || '');
  const [lblPlu, setLblPlu] = useState(S.lbl?.plu || '');
  const [lblAdd, setLblAdd] = useState(S.lbl?.add || '');
  const [configOpen, setConfigOpen] = useState(true);

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

  // Lifetime stats
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
  const lim30 = iso(add(new Date(), -30));
  const p30 = H.filter((x) => x.date <= lim30).pop() || H[0];
  const last20 = H.slice(-20);

  const deltaLabel = (a: number, b: number) => {
    const x = Math.round((a - b) * 10) / 10;
    return (
      <span className="text-[var(--ac2)] tabular-nums">
        {x > 0 ? '▲ +' : x < 0 ? '▼ −' : '• '}
        {fmt(Math.abs(x))} kg
      </span>
    );
  };

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

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">Mi perfil</h2>
        <button
          type="button"
          onClick={() => {
            haptic('light');
            onOpenNotifications();
          }}
          aria-label="Notificaciones"
          className={`tf-tap relative w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer ${
            unreadNotifCount > 0
              ? 'border-[var(--ac2)]/65 bg-[var(--ac)]/20 text-[var(--ac2)]'
              : 'border-[var(--line)] bg-[var(--surface)] text-[var(--mut)] hover:text-[var(--ac2)]'
          }`}
        >
          <Bell className="w-5 h-5" />
          {unreadNotifCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#A259FF] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--bg)] tabular-nums">
              {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
            </span>
          )}
        </button>
      </div>

      {profStatus === 'ok' ? (
        <div className="tf-card p-4 flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#A259FF] to-[#321C6A] text-white text-2xl font-bold flex items-center justify-center shrink-0">
            {String(displayName || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <b className="text-lg block truncate">{displayName}</b>
            {displayEmail && (
              <span className="text-xs text-[var(--mut)] block break-all" data-selectable="true">
                {displayEmail}
              </span>
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
              onClick={onSignOut}
              className="w-full min-h-[42px] rounded-xl border border-[var(--line)] text-sm font-medium cursor-pointer"
            >
              Cerrar sesión
            </button>
          )}
        </div>
      )}

      {profStatus === 'ok' && (
        <>
          {/* Lifetime Stats */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="tf-card p-3.5">
              <span className="block text-[10.5px] font-semibold text-[var(--mut)] tracking-wider">
                SESIONES
              </span>
              <b className="block text-2xl font-bold tabular-nums mt-1">{stats.ses}</b>
            </div>
            <div className="tf-card p-3.5">
              <span className="block text-[10.5px] font-semibold text-[var(--mut)] tracking-wider">
                VOLUMEN
              </span>
              <b className="block text-2xl font-bold tabular-nums mt-1">{fmt(stats.ton)} kg</b>
            </div>
            <div className="tf-card p-3.5">
              <span className="block text-[10.5px] font-semibold text-[var(--mut)] tracking-wider">
                SERIES
              </span>
              <b className="block text-2xl font-bold tabular-nums mt-1">{stats.ser}</b>
            </div>
          </div>

          {/* Bodyweight Card */}
          <div className="tf-card p-4 space-y-3">
            <b className="text-base block">Peso corporal</b>
            <div>
              <span className="text-xs text-[var(--mut)]">Peso corporal actual</span>
              <div className="font-display text-4xl font-extrabold text-[var(--ac2)] tabular-nums mt-0.5">
                {curBw ? (
                  <>
                    {fmt(curBw.kg)} <span className="text-lg">kg</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
              {curBw ? (
                <span className="text-xs text-[var(--mut)]">
                  Registrado el {fdate(curBw.date)}
                </span>
              ) : (
                <p className="text-xs text-[var(--mut)]">Aún no registras tu peso.</p>
              )}
            </div>

            {H.length > 1 && curBw && (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-[var(--surface-2)] p-3">
                  <span className="block text-[11px] text-[var(--mut)]">Desde el primer registro</span>
                  <b className="text-base font-bold">{deltaLabel(curBw.kg, H[0].kg)}</b>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] p-3">
                  <span className="block text-[11px] text-[var(--mut)]">Últimos 30 días</span>
                  <b className="text-base font-bold">{deltaLabel(curBw.kg, p30.kg)}</b>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 min-w-0">
              <input
                type="text"
                inputMode="decimal"
                className="tf-input w-full min-w-0 px-3 py-2.5 text-sm"
                placeholder="Peso (kg)"
                value={bwInput}
                onChange={(e) => {
                  setBwInput(e.target.value);
                  if (bwError) setBwError('');
                }}
              />
              <input
                type="date"
                className="tf-input w-full min-w-0 max-w-full px-3 py-2.5 text-sm"
                value={bwDate}
                onChange={(e) => setBwDate(e.target.value)}
              />
            </div>
            {bwError && <p className="text-xs text-[var(--danger)]">{bwError}</p>}
            <button
              type="button"
              onClick={() => {
                if (onAddBodyWeight(bwInput, bwDate || today)) {
                  haptic('success');
                  setBwInput('');
                  setBwError('');
                } else {
                  setBwError('Ingresa un peso válido (entre 20 y 400 kg).');
                }
              }}
              className="tf-btn-pri w-full min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer"
            >
              Guardar peso
            </button>
            <p className="text-xs text-[var(--mut)]">
              Si registras otro peso el mismo día, se actualiza.
            </p>
          </div>

          {/* Evolution Chart */}
          <div className="tf-card p-4 space-y-2">
            <b className="text-base block">Evolución</b>
            {H.length > 1 ? (
              <LineChart
                values={last20.map((x) => x.kg)}
                labels={last20.map((x) => `${x.date.slice(8)}/${x.date.slice(5, 7)}`)}
              />
            ) : (
              <p className="text-xs text-[var(--mut)]">
                Registra al menos 2 pesos para ver la gráfica.
              </p>
            )}
          </div>

          {/* History */}
          <div className="tf-card p-4 space-y-2">
            <b className="text-base block">Historial</b>
            {H.length ? (
              <div className="divide-y divide-[var(--line)]/60">
                {H.slice()
                  .reverse()
                  .map((x, idx, arr) => {
                    const prev = arr[idx + 1];
                    return (
                      <div key={x.id} className="flex items-center justify-between py-2 text-sm">
                        <span className="flex-1 tabular-nums text-[var(--mut)]">{fdate(x.date)}</span>
                        <b className="flex-1 tabular-nums">{fmt(x.kg)} kg</b>
                        <span className="flex-1 text-xs">{prev ? deltaLabel(x.kg, prev.kg) : ''}</span>
                        <button
                          type="button"
                          onClick={() => onDeleteBodyWeight(x.id)}
                          className="text-[var(--danger)] px-2 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-xs text-[var(--mut)]">Sin registros.</p>
            )}
          </div>
        </>
      )}

      {/* Navigation List Rows */}
      <div className="tf-card divide-y divide-[var(--line)]/60 overflow-hidden">
        <button
          type="button"
          onClick={() => onNavigate('pr')}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-2)]/50 cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </span>
          <span className="flex-1 font-semibold text-sm">Récords personales (PR)</span>
          <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('prog')}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-2)]/50 cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </span>
          <span className="flex-1 font-semibold text-sm">Progreso</span>
          <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('plan')}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-2)]/50 cursor-pointer"
        >
          <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </span>
          <span className="flex-1 font-semibold text-sm">
            {S.role === 'coach' ? 'Plan' : 'Mi programa'}
          </span>
          <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
        </button>
      </div>

      {/* Coach Athletes */}
      {S.role === 'coach' && (
        <div className="tf-card p-4 space-y-3">
          <div>
            <b className="text-base block">Mis {labels.plu}</b>
            <p className="text-xs text-[var(--mut)] mt-0.5">
              Toca un nombre para seleccionarlo. Para borrar, selecciónalo y pulsa ✕.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {S.users.map((u) => (
              <div key={u} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    haptic('light');
                    onUpdateState((prev) => ({ ...prev, user: u, pm: 0, cdel: '' }));
                  }}
                  className={`min-h-[38px] px-3.5 rounded-xl text-sm font-medium border cursor-pointer ${
                    u === S.user
                      ? 'bg-[var(--ac)] border-[var(--ac)] text-white'
                      : 'bg-[var(--surface-2)] border-[var(--line)]'
                  }`}
                >
                  {u}
                </button>
                {u === S.user && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onDeleteAthlete(u);
                    }}
                    title={`Eliminar a ${u}`}
                    aria-label={`Eliminar a ${u}`}
                    className="ml-1 text-xs text-[var(--danger)] px-2 py-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 min-w-0">
            <input
              type="text"
              className="tf-input flex-1 min-w-0 w-full px-3 py-2 text-sm"
              placeholder={`Nombre del ${labels.sing}`}
              value={newAth}
              onChange={(e) => {
                setNewAth(e.target.value);
                if (athError) setAthError('');
              }}
            />
            <button
              type="button"
              onClick={() => {
                const cleaned = cleanName(newAth);
                if (!cleaned) {
                  setAthError('Escribe un nombre.');
                  return;
                }
                const err = onAddAthlete(cleaned);
                if (err) setAthError(err);
                else {
                  haptic('success');
                  setNewAth('');
                  setAthError('');
                }
              }}
              className="tf-btn-pri px-4 rounded-xl text-sm font-semibold cursor-pointer"
            >
              Agregar
            </button>
          </div>
          {athError && <p className="text-xs text-[var(--danger)]">{athError}</p>}
        </div>
      )}

      {/* Configuraciones Section */}
      <section aria-label="Configuraciones" className="tf-card overflow-hidden">
        <button
          type="button"
          onClick={() => {
            haptic('light');
            setConfigOpen((v) => !v);
          }}
          className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-[var(--surface-2)]/40 cursor-pointer"
        >
          <span className="w-10 h-10 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
            <Settings className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <b className="block text-base font-bold">Configuraciones</b>
            <small className="block text-xs text-[var(--mut)]">
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
                onUpdateState((prev) => ({ ...prev, theme: isLight ? 'dark' : 'light' }));
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer"
            >
              <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                {isLight ? <Sun className="w-5 h-5" /> : <Palette className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0">
                <b className="block text-sm font-semibold">Apariencia y colores (Tema claro)</b>
                <small className="block text-xs text-[var(--mut)]">
                  {isLight
                    ? 'Tema claro activo · Toca para volver al modo oscuro violeta'
                    : 'Modo oscuro TrazikFit · Toca para activar tema claro'}
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
            <div className="px-4 py-3.5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                  <Volume2 className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <b className="block text-sm font-semibold">Sonidos del temporizador</b>
                  <small className="block text-xs text-[var(--mut)]">
                    Inicio, pausa, últimos segundos y fin de fase
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

              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--mut)] w-16 shrink-0">Volumen</span>
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

              <div className="flex items-center gap-2">
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--surface-2)] flex-1">
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
                      className={`tf-tap py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
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
                  className="tf-tap min-h-[34px] px-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold cursor-pointer shrink-0"
                >
                  Probar
                </button>
              </div>
            </div>

            {/* Notificaciones */}
            <div className="px-4 py-3.5 space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <b className="block text-sm font-semibold">Notificaciones</b>
                  <small className="block text-xs text-[var(--mut)]">
                    {S.role === 'coach'
                      ? 'Avisos cuando tus atletas terminan sesiones'
                      : 'Cambios en planificación y recordatorios de próxima sesión'}
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
              <div className="flex flex-wrap items-center gap-2 pl-12">
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
                    onOpenNotifications();
                  }}
                  className="tf-tap px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium text-[var(--tx)] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5 text-[var(--ac2)]" />
                  Ver centro de avisos{unreadNotifCount > 0 ? ` (${unreadNotifCount})` : ''}
                </button>
              </div>
            </div>

            {/* Cuenta, sincronización y administración */}
            <button
              type="button"
              onClick={() => {
                haptic('light');
                if (me) onOpenCloud();
                else onGoogleLogin();
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-2)]/50 cursor-pointer"
            >
              <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                <Cloud className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <b className="block text-sm font-semibold">
                  Cuenta, Google y copias de seguridad
                </b>
                <small className="block text-xs text-[var(--mut)] break-all">
                  {pendingInvitesCount > 0
                    ? `Tienes ${pendingInvitesCount} invitación(es) pendiente(s) · Toca para responder`
                    : me
                    ? `Vinculada (${me.email || ''}) · Vínculos y respaldo JSON`
                    : 'Vincula tu cuenta de Google y respalda tu progreso'}
                </small>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
            </button>

            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <b className="block text-sm font-semibold">Tipo de cuenta</b>
                <small className="block text-xs text-[var(--mut)]">
                  {accountTypeText} · lo define el administrador
                </small>
              </div>
            </div>

            {me && roleState.admin && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-2)]/50 cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <b className="block text-sm font-semibold">Administración</b>
                  <small className="block text-xs text-[var(--mut)]">Usuarios y roles</small>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
              </button>
            )}

            {S.role === 'coach' && (
              <div className="p-4 space-y-3">
                <div>
                  <b className="text-sm block">Personalizar nombres</b>
                  <p className="text-xs text-[var(--mut)] mt-0.5">
                    Cambia cómo se llaman estas partes en la pestaña del entrenador. Solo cambia los textos, no tus datos.
                  </p>
                </div>
                <label className="block text-xs text-[var(--mut)]">
                  Nombre (singular)
                  <input
                    type="text"
                    className="tf-input w-full mt-1 px-3 py-2 text-sm"
                    placeholder="atleta"
                    value={lblSing}
                    onChange={(e) => setLblSing(e.target.value)}
                  />
                </label>
                <label className="block text-xs text-[var(--mut)]">
                  Nombre (plural)
                  <input
                    type="text"
                    className="tf-input w-full mt-1 px-3 py-2 text-sm"
                    placeholder={labels.plu}
                    value={lblPlu}
                    onChange={(e) => setLblPlu(e.target.value)}
                  />
                </label>
                <label className="block text-xs text-[var(--mut)]">
                  Texto de agregar
                  <input
                    type="text"
                    className="tf-input w-full mt-1 px-3 py-2 text-sm"
                    placeholder={labels.add}
                    value={lblAdd}
                    onChange={(e) => setLblAdd(e.target.value)}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      haptic('success');
                      onUpdateState((prev) => ({
                        ...prev,
                        lbl: { sing: lblSing, plu: lblPlu, add: lblAdd },
                      }));
                    }}
                    className="tf-btn-pri flex-1 min-h-[42px] rounded-xl text-sm font-semibold cursor-pointer"
                  >
                    Aplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLblSing('');
                      setLblPlu('');
                      setLblAdd('');
                      onUpdateState((prev) => ({ ...prev, lbl: {} }));
                    }}
                    className="flex-1 min-h-[42px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-medium cursor-pointer"
                  >
                    Restablecer
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 space-y-3">
              <PWAInstallButton />
              <div className="space-y-1">
                <b className="text-sm block">¿Cómo se usa tu peso?</b>
                <p className="text-xs text-[var(--mut)] leading-relaxed" data-selectable="true">
                  En los ejercicios con «Usar mi peso corporal» (dominadas, fondos, flexiones…), el
                  tonelaje es (peso corporal + lastre) × repeticiones. Se usa el peso que tenías en la
                  fecha de cada sesión. Sin esa opción: carga × repeticiones. En ejercicios por tiempo,
                  10 s cuentan como 1 repetición.
                </p>
              </div>
            </div>

            {me && (
              <button
                type="button"
                onClick={onSignOut}
                className="w-full min-h-[48px] px-4 text-sm font-medium text-[var(--mut)] hover:text-[var(--danger)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
