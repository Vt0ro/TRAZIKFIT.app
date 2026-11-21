import { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { haptic } from '../lib/audioHaptics';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic('light');
          void install();
        }}
        className={`tf-tap flex items-center justify-center gap-2 rounded-2xl border border-[var(--ac2)]/35 bg-[var(--surface-2)] text-sm font-semibold text-[var(--tx)] hover:border-[var(--ac2)]/60 cursor-pointer ${
          compact ? 'px-3.5 py-2.5 text-xs' : 'w-full min-h-[48px] px-4'
        }`}
      >
        <Download className="w-4 h-4 text-[var(--ac2)] shrink-0" />
        <span>Instalar aplicación en el dispositivo</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            haptic('light');
            setShowIOSGuide(true);
          }}
          className={`tf-tap flex items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--tx)] cursor-pointer ${
            compact ? 'px-3.5 py-2.5 text-xs' : 'w-full min-h-[48px] px-4'
          }`}
        >
          <Smartphone className="w-4 h-4 text-[var(--ac2)] shrink-0" />
          <span>Instalar app en iPhone / iPad</span>
        </button>

        {showIOSGuide && (
          <div
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="tf-card w-full max-w-sm p-5 space-y-3"
            >
              <h3 className="font-display text-lg font-bold">Instalar TrazikFit en iOS</h3>
              <p className="text-xs text-[var(--mut)] leading-relaxed">
                1. Toca el botón <strong className="text-[var(--tx)]">Compartir</strong> en la barra inferior de Safari.
                <br />
                2. Desliza y selecciona <strong className="text-[var(--tx)]">Agregar a inicio</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="tf-btn-pri w-full min-h-[42px] rounded-xl text-sm font-semibold cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-[calc(10px+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/90 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg whitespace-nowrap">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span>Sin conexión · usando datos guardados</span>
      </div>
    </div>
  );
}
