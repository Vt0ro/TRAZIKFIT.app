import { useState } from 'react';
import { Cloud } from 'lucide-react';
import type { User } from 'firebase/auth';
import { BottomSheet } from './BottomSheet';
import { haptic } from '../lib/audioHaptics';
import { todayStr } from '../lib/metrics';
import type { AppState, InviteItem, ResolvedOS } from '../types/trazik';

const BK_KEYS = ['sessions', 'users', 'plans', 'annex', 'prs', 'prx', 'bwt', 'bwh', 'axs'] as const;

interface CloudSheetProps {
  open: boolean;
  onClose: () => void;
  S: AppState;
  os: ResolvedOS;
  me: User | null;
  ready: boolean;
  isCoach: boolean;
  cloudMsg: string;
  myDoc: { coaches?: string[]; cn?: Record<string, string> };
  invIn: InviteItem[];
  invOut: InviteItem[];
  onGoogleLogin: () => void;
  onSignOut: () => void;
  onInviteStudent: (email: string) => void;
  onAcceptInvite: (id: string) => void;
  onDeleteInvite: (id: string) => void;
  onUnlinkCoach: (uid: string) => void;
  onRestoreBackup: (data: Partial<AppState>) => void;
}

export function CloudSheet({
  open,
  onClose,
  S,
  os,
  me,
  ready,
  isCoach,
  cloudMsg,
  myDoc,
  invIn,
  invOut,
  onGoogleLogin,
  onSignOut,
  onInviteStudent,
  onAcceptInvite,
  onDeleteInvite,
  onUnlinkCoach,
  onRestoreBackup,
}: CloudSheetProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmUnlinkUid, setConfirmUnlinkUid] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<Partial<AppState> | null>(null);
  const [backupErr, setBackupErr] = useState('');

  const coaches = myDoc.coaches || [];
  const linkedStudents = Object.keys(S.linked || {});

  const handleDownloadBackup = () => {
    const payload = {
      app: 'trazikfit',
      v: 2,
      d: Object.fromEntries(BK_KEYS.map((k) => [k, S[k]])),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(payload)], { type: 'application/json' })
    );
    a.download = `trazik-fit-copia-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  const handleFileSelect = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result));
        if (parsed.app !== 'trazikfit' || !parsed.d) throw new Error('invalid');
        setBackupErr('');
        setRestoreConfirm(parsed.d);
      } catch {
        setBackupErr('Ese archivo no es una copia válida de Trazik Fit.');
      }
    };
    r.readAsText(file);
  };

  return (
    <BottomSheet open={open} onClose={onClose} os={os} maxWidthClass="max-w-lg">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <Cloud className="w-5 h-5 text-[var(--ac2)]" />
            <span>Cuenta y nube</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--mut)] px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {!me ? (
          <div className="tf-card p-4 space-y-3">
            <p className="text-xs text-[var(--mut)] leading-relaxed">
              Inicia sesión para guardar tus datos en la nube y compartirlos con tu entrenador o
              tus alumnos.
            </p>
            <button
              type="button"
              onClick={onGoogleLogin}
              className="tf-btn-pri w-full min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer"
            >
              Iniciar sesión con Google
            </button>
            {cloudMsg && <p className="text-xs text-[var(--mut)]">{cloudMsg}</p>}
          </div>
        ) : (
          <>
            <div className="tf-card p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    ready && !cloudMsg
                      ? 'bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]'
                      : 'bg-[var(--mut)]'
                  }`}
                />
                <span>{ready ? 'Sincronizado' : 'Conectando…'}</span>
              </div>
              <p className="text-xs text-[var(--mut)] break-all" data-selectable="true">
                {me.displayName || ''} · {me.email || ''}
              </p>

              {confirmLogout ? (
                <div className="pt-1 space-y-2">
                  <p className="text-xs text-[var(--mut)]">
                    ¿Cerrar sesión? Tus datos seguirán guardados en este dispositivo y en la nube.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmLogout(false);
                        onSignOut();
                      }}
                      className="flex-1 min-h-[38px] rounded-xl bg-[var(--danger)]/20 text-[var(--danger)] text-xs font-semibold cursor-pointer"
                    >
                      Sí, cerrar sesión
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmLogout(false)}
                      className="flex-1 min-h-[38px] rounded-xl border border-[var(--line)] text-xs font-medium cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmLogout(true)}
                  className="text-xs font-medium text-[var(--danger)] py-1 cursor-pointer"
                >
                  Cerrar sesión
                </button>
              )}

              {cloudMsg && (
                <p className="text-xs text-[var(--ac2)] pt-1" data-selectable="true">
                  {cloudMsg}
                </p>
              )}
            </div>

            {invIn.length > 0 && (
              <div className="tf-card p-4 space-y-2.5">
                <b className="text-sm block">Invitaciones recibidas</b>
                {invIn.map((iv) => (
                  <div
                    key={iv.id}
                    className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--line)]/60 text-xs"
                  >
                    <span>{iv.coachName} quiere ser tu entrenador</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          haptic('success');
                          onAcceptInvite(iv.id);
                        }}
                        className="tf-btn-pri px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteInvite(iv.id)}
                        className="px-2 py-1.5 text-[var(--danger)] text-xs cursor-pointer"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isCoach && (
              <div className="tf-card p-4 space-y-2.5">
                <div>
                  <b className="text-sm block">Mis alumnos</b>
                  <p className="text-xs text-[var(--mut)] mt-0.5">
                    Escribe el correo de Google de tu alumno. Cuando inicie sesión y acepte,
                    aparecerá en «Atletas».
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="tf-input flex-1 px-3 py-2 text-sm"
                    placeholder="correo@gmail.com"
                    autoComplete="off"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light');
                      onInviteStudent(inviteEmail);
                      setInviteEmail('');
                    }}
                    className="tf-btn-pri px-4 rounded-xl text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Invitar
                  </button>
                </div>

                {linkedStudents.map((a) => (
                  <div
                    key={a}
                    className="flex items-center justify-between pt-2 border-t border-[var(--line)]/60 text-xs"
                  >
                    <span>{a}</span>
                  </div>
                ))}

                {invOut.map((iv) => (
                  <div
                    key={iv.id}
                    className="flex items-center justify-between pt-2 border-t border-[var(--line)]/60 text-xs"
                  >
                    <span>
                      {iv.to} <small className="text-[var(--mut)]">(pendiente)</small>
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteInvite(iv.id)}
                      className="text-[var(--danger)] px-2 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="tf-card p-4 space-y-2">
              <b className="text-sm block">Mi entrenador</b>
              {coaches.length > 0 ? (
                coaches.map((u) => (
                  <div
                    key={u}
                    className="pt-2 border-t border-[var(--line)]/60 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span>{myDoc.cn?.[u] || 'Entrenador'}</span>
                      <button
                        type="button"
                        onClick={() => setConfirmUnlinkUid(u)}
                        className="text-[var(--danger)] px-2 cursor-pointer"
                      >
                        Quitar
                      </button>
                    </div>
                    {confirmUnlinkUid === u && (
                      <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] space-y-2">
                        <p className="text-[11px] text-[var(--mut)] leading-relaxed">
                          {coaches.length === 1
                            ? 'Al quitar a tu único entrenador necesitarás una nueva invitación por correo para volver a entrar.'
                            : '¿Desvincular a este entrenador?'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmUnlinkUid(null);
                              onUnlinkCoach(u);
                            }}
                            className="flex-1 min-h-[34px] rounded-lg bg-[var(--danger)]/20 text-[var(--danger)] font-semibold cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnlinkUid(null)}
                            className="flex-1 min-h-[34px] rounded-lg border border-[var(--line)] cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--mut)]">
                  Si tu entrenador te invita, la invitación aparecerá aquí al iniciar sesión.
                </p>
              )}
            </div>
          </>
        )}

        <div className="tf-card p-4 space-y-2.5">
          <div>
            <b className="text-sm block">Copia de seguridad</b>
            <p className="text-xs text-[var(--mut)] mt-0.5">
              Un archivo con todos tus datos de este dispositivo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="min-h-[40px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium cursor-pointer"
            >
              Descargar copia
            </button>
            <label className="min-h-[40px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-medium inline-flex items-center cursor-pointer">
              Restaurar copia
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </label>
          </div>
          {backupErr && <p className="text-xs text-[var(--danger)]">{backupErr}</p>}
          {restoreConfirm && (
            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] space-y-2">
              <p className="text-xs">
                Esto reemplaza los datos de este dispositivo por los de la copia. ¿Continuar?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onRestoreBackup(restoreConfirm);
                    setRestoreConfirm(null);
                  }}
                  className="tf-btn-pri flex-1 min-h-[36px] rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreConfirm(null)}
                  className="flex-1 min-h-[36px] rounded-lg border border-[var(--line)] text-xs cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </BottomSheet>
  );
}
