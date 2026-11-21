import { useState } from 'react';
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  Cloud,
  Edit3,
  LogOut,
  Scale,
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
import type { ActiveView, AppState, ResolvedOS, UserRoleState } from '../types/trazik';

interface ProfileSheetProps {
  open: boolean;
  onClose: () => void;
  S: AppState;
  os: ResolvedOS;
  me: User | null;
  roleState: UserRoleState;
  myDoc: { cn?: Record<string, string> };
  pendingInvitesCount: number;
  onNavigate: (view: ActiveView) => void;
  onToggleTheme: () => void;
  onToggleSound: () => void;
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
  onNavigate,
  onToggleTheme,
  onToggleSound,
  onOpenCloud,
  onGoogleLogin,
  onSignOut,
  onAddBodyWeight,
}: ProfileSheetProps) {
  const today = todayStr();
  const [kgInput, setKgInput] = useState('');
  const [dateInput, setDateInput] = useState(today);
  const [err, setErr] = useState('');

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

  const go = (v: ActiveView) => {
    haptic('light');
    onClose();
    onNavigate(v);
  };

  return (
    <BottomSheet open={open} onClose={onClose} os={os} maxWidthClass="max-w-xl">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Perfil</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--mut)] hover:text-[var(--tx)] cursor-pointer"
          >
            ✕
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

        <button
          type="button"
          onClick={() => {
            haptic('light');
            onClose();
            if (me) onOpenCloud();
            else onGoogleLogin();
          }}
          className="w-full flex items-center gap-3.5 p-4 rounded-[20px] text-left text-white border border-[#E0C8FF]/35 bg-gradient-to-br from-[#A259FF]/80 via-[#6D28D9]/85 to-[#321C6A]/95 shadow-lg shadow-[#A259FF]/25 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <span className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Cloud className="w-6 h-6" />
          </span>
          <span className="flex-1 min-w-0">
            <b className="block text-sm">Guardar cuenta / Sincronizar con Google</b>
            <small className="block text-xs text-white/80 mt-0.5 break-all">
              {pendingInvitesCount > 0
                ? `Tienes ${pendingInvitesCount} invitación(es) pendiente(s) · ábrela para responder`
                : me
                ? `Cuenta vinculada · ${me.email || ''}`
                : 'Vincula tu cuenta y respalda tu progreso en la nube'}
            </small>
          </span>
          <ChevronRight className="w-5 h-5 text-white/80 shrink-0" />
        </button>

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

            <div className="tf-card overflow-hidden">
              <button
                type="button"
                onClick={() => go('perfil')}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)]/50 cursor-pointer"
              >
                <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                  <Scale className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <b className="block text-sm">Peso corporal</b>
                  <small className="block text-xs text-[var(--mut)]">Historial y gráfica</small>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
              </button>
            </div>
          </>
        )}

        <div className="tf-card divide-y divide-[var(--line)]/60 overflow-hidden">
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
        </div>

        <div className="tf-card divide-y divide-[var(--line)]/60 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <b className="block text-sm">Tipo de cuenta</b>
              <small className="block text-xs text-[var(--mut)]">
                {accountTypeText} · lo define el administrador
              </small>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCloud();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
          >
            <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
              <Cloud className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <b className="block text-sm">Cuenta y copias de seguridad</b>
              <small className="block text-xs text-[var(--mut)]">
                Vínculos, código para compartir y respaldo
              </small>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
          </button>

          {me && roleState.admin && (
            <button
              type="button"
              onClick={() => go('admin')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
            >
              <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <b className="block text-sm">Administración</b>
                <small className="block text-xs text-[var(--mut)]">Usuarios y roles</small>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
            </button>
          )}
        </div>

        {S.role === 'coach' && (
          <div className="tf-card overflow-hidden">
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
                  Agregar o quitar atletas y cambiar nombres
                </small>
              </div>
              <ChevronRight className="w-5 h-5 text-[var(--mut)]" />
            </button>
          </div>
        )}

        <div className="tf-card divide-y divide-[var(--line)]/60 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onToggleTheme();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
          >
            <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
              <Sun className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <b className="block text-sm">Tema claro</b>
              <small className="block text-xs text-[var(--mut)]">
                Toca para cambiar el modo de la app
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

          {(() => {
            const sndOn = (S.snd || DEFAULT_SOUND_SETTINGS).enabled;
            return (
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  if (!sndOn) {
                    unlockAudio();
                    playTimerStart(true);
                  }
                  onToggleSound();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
              >
                <span className="w-8 h-8 rounded-xl bg-[var(--ac)]/20 text-[var(--ac2)] flex items-center justify-center shrink-0">
                  <Volume2 className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <b className="block text-sm">Sonidos del temporizador</b>
                  <small className="block text-xs text-[var(--mut)]">
                    Alertas de inicio, pausa y últimos segundos
                  </small>
                </div>
                <span
                  className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${
                    sndOn ? 'bg-[var(--ac)]' : 'bg-[var(--mut)]/30'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                      sndOn ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>
            );
          })()}
        </div>

        {me && profStatus !== 'locked' && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="w-full min-h-[46px] rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-medium text-[var(--mut)] hover:text-[var(--tx)] flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
