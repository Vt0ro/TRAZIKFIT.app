import { motion } from 'motion/react';
import { CheckCircle2, LogOut, ShieldAlert, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import { haptic } from '../lib/audioHaptics';
import { BrandMark, BrandSlogan, BrandWordmark } from './BrandMark';
import type { InviteItem } from '../types/trazik';

interface InviteGateViewProps {
  me: User;
  loading: boolean;
  invIn: InviteItem[];
  errorMsg?: string;
  onAcceptInvite: (inviteId: string) => void;
  onDeleteInvite: (inviteId: string) => void;
  onSignOut: () => void;
}

export function InviteGateView({
  me,
  loading,
  invIn,
  errorMsg,
  onAcceptInvite,
  onDeleteInvite,
  onSignOut,
}: InviteGateViewProps) {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5 py-10 bg-[#0A051A]">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center animate-pulse drop-shadow-[0_10px_28px_rgba(162,89,255,0.34)]">
            <BrandMark className="w-24 h-auto" />
          </div>
          <div className="space-y-1.5">
            <h1 className="leading-none">
              <BrandWordmark className="text-3xl" />
            </h1>
            <BrandSlogan className="text-[10px] tracking-[0.2em]" />
            <p className="text-xs text-[#CFC8DD] pt-2">
              Verificando tu cuenta e invitaciones…
            </p>
          </div>
        </div>
      </div>
    );
  }

  const unverified = !me.emailVerified;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md space-y-5"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center justify-center mb-1">
            <BrandMark className="w-16 h-auto drop-shadow-[0_8px_24px_rgba(162,89,255,0.34)]" />
          </div>
          <h1 className="leading-none">
            <BrandWordmark className="text-3xl" />
          </h1>
          <p className="text-sm text-[var(--mut)]">
            {unverified
              ? 'Tu correo de Google debe estar verificado para continuar.'
              : invIn.length > 0
              ? 'Tienes una invitación de entrenador lista para aceptar.'
              : 'Acceso exclusivo por invitación de entrenador.'}
          </p>
        </div>

        {/* Signed-in Google Account Card */}
        <div className="tf-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A259FF] to-[#321C6A] text-white text-sm font-bold flex items-center justify-center shrink-0">
            {(me.displayName || me.email || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <b className="block text-sm truncate">{me.displayName || 'Atleta'}</b>
            <span className="block text-xs text-[var(--mut)] break-all" data-selectable="true">
              {me.email || ''}
            </span>
          </div>
        </div>

        {unverified ? (
          <div className="tf-card p-5 space-y-2.5 border-[var(--danger)]/40">
            <div className="flex items-center gap-2 text-[var(--danger)] font-semibold text-sm">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Correo no verificado</span>
            </div>
            <p className="text-xs text-[var(--mut)] leading-relaxed">
              Por seguridad, solo se permite el acceso con una cuenta de Google con correo verificado.
            </p>
          </div>
        ) : invIn.length > 0 ? (
          <div className="space-y-3">
            {invIn.map((iv) => (
              <div key={iv.id} className="tf-card p-5 space-y-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ok)]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Invitación encontrada
                  </span>
                  <h2 className="font-display text-xl font-bold">{iv.coachName}</h2>
                  <p className="text-xs text-[var(--mut)] leading-relaxed">
                    Te invitó a unirte a TrazikFit como su atleta. Al aceptar se habilitará tu
                    calendario, programa y seguimiento.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      haptic('success');
                      onAcceptInvite(iv.id);
                    }}
                    className="tf-btn-pri flex-1 min-h-[46px] rounded-xl text-sm font-semibold cursor-pointer"
                  >
                    Aceptar invitación y entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onDeleteInvite(iv.id);
                    }}
                    aria-label="Rechazar invitación"
                    className="tf-tap w-12 min-h-[46px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--danger)] flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tf-card p-5 space-y-3">
            <h2 className="font-semibold text-base">Esperando invitación del entrenador</h2>
            <p className="text-xs text-[var(--mut)] leading-relaxed">
              Para usar esta aplicación necesitas una invitación enviada por tu entrenador a tu
              correo de Google (<strong className="text-[var(--tx)]" data-selectable="true">{me.email}</strong>).
            </p>
            <p className="text-xs text-[var(--mut)] leading-relaxed">
              En cuanto tu entrenador envíe la invitación desde su panel, aparecerá aquí
              automáticamente para que puedas entrar.
            </p>
          </div>
        )}

        {errorMsg && !errorMsg.startsWith('✓') && (
          <p className="text-xs text-[var(--danger)] px-1" data-selectable="true">
            {errorMsg}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            haptic('light');
            onSignOut();
          }}
          className="tf-tap w-full min-h-[46px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-sm font-medium text-[var(--mut)] hover:text-[var(--tx)] flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" /> Cambiar cuenta de Google
        </button>
      </motion.div>
    </div>
  );
}
