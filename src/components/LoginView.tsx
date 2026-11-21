import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronRight, Cloud, Copy, MailCheck, ShieldAlert } from 'lucide-react';
import { haptic } from '../lib/audioHaptics';
import { BrandMark, BrandSlogan, BrandWordmark } from './BrandMark';
import { PWAInstallButton } from './PWABanners';

interface LoginViewProps {
  onGoogleLogin: () => void;
  errorMsg?: string;
}

export function LoginView({ onGoogleLogin, errorMsg }: LoginViewProps) {
  const [copiedHost, setCopiedHost] = useState(false);
  const currentHost =
    typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '';
  const isDomainError =
    Boolean(errorMsg) &&
    (errorMsg!.includes('Dominio no autorizado') || errorMsg!.includes('unauthorized-domain'));

  const handleCopyHost = async () => {
    if (!currentHost) return;
    haptic('light');
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      window.setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // ignore if clipboard blocked by iframe permissions
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md space-y-5"
      >
        <div className="space-y-2.5 text-center sm:text-left">
          <div className="inline-flex items-center justify-center sm:justify-start mb-1">
            <BrandMark className="w-20 h-auto drop-shadow-[0_10px_28px_rgba(162,89,255,0.36)]" />
          </div>
          <h1 className="leading-none">
            <BrandWordmark className="text-4xl" />
          </h1>
          <BrandSlogan className="text-[10.5px] tracking-[0.18em]" />
          <p className="text-sm text-[var(--mut)] pt-1">
            Inicia sesión con tu cuenta de Google para acceder a tu entrenamiento.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            haptic('light');
            onGoogleLogin();
          }}
          className="tf-tap w-full flex items-center gap-4 p-4 rounded-[22px] text-left text-white border border-[#E0C8FF]/35 bg-gradient-to-br from-[#A259FF] via-[#6D28D9] to-[#321C6A] shadow-lg shadow-[#A259FF]/30 hover:brightness-110 cursor-pointer"
        >
          <span className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Cloud className="w-6 h-6" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-base leading-tight">
              Continuar con Google
            </span>
            <span className="block text-xs text-white/80 mt-0.5">
              Acceso verificado y sincronizado en la nube
            </span>
          </span>
          <ChevronRight className="w-5 h-5 text-white/80 shrink-0" />
        </button>

        {errorMsg && !errorMsg.startsWith('✓') && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--danger)] px-1" data-selectable="true">
              {errorMsg}
            </p>
            {isDomainError && currentHost && (
              <div className="tf-card p-4 space-y-3 border-[var(--danger)]/40 bg-[var(--danger)]/10">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--tx)] leading-relaxed">
                    Firebase bloquea el inicio de sesión por el <b>dominio web actual</b> (no por los permisos de tu correo). Autoriza este dominio en tu consola de Firebase:
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                  <code
                    className="flex-1 min-w-0 text-[11px] text-[var(--ac2)] break-all"
                    data-selectable="true"
                  >
                    {currentHost}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyHost}
                    className="min-h-[32px] px-2.5 rounded-lg bg-[var(--ac)]/20 text-[var(--ac2)] text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedHost ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <ol className="text-[11.5px] text-[var(--mut)] space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Abre <b>Firebase Console</b> y selecciona el proyecto <b>trazikfit-5fafa</b>.</li>
                  <li>Ve a <b>Authentication → Settings → Authorized domains</b>.</li>
                  <li>Pulsa <b>Add domain</b>, pega el dominio de arriba y guarda.</li>
                  <li>Vuelve aquí y pulsa <b>Continuar con Google</b>.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        <div className="tf-card p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MailCheck className="w-4 h-4 text-[var(--ac2)] shrink-0" />
            <span>Acceso solo por invitación</span>
          </div>
          <p className="text-xs text-[var(--mut)] leading-relaxed">
            Para utilizar TrazikFit es obligatorio iniciar sesión con Google y contar con una
            invitación enviada a tu correo por tu entrenador.
          </p>
        </div>

        <PWAInstallButton />
      </motion.div>
    </div>
  );
}
