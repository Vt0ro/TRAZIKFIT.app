import { AlertTriangle, Trash2, Users } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { haptic } from '../lib/audioHaptics';
import type { AppState, ResolvedOS } from '../types/trazik';

interface DeleteAthleteModalProps {
  athleteName: string | null;
  S: AppState;
  os: ResolvedOS;
  busy: boolean;
  onClose: () => void;
  onConfirmDelete: (name: string) => void;
}

export function DeleteAthleteModal({
  athleteName,
  S,
  os,
  busy,
  onClose,
  onConfirmDelete,
}: DeleteAthleteModalProps) {
  if (!athleteName) return null;

  const isLinked = Boolean(S.linked?.[athleteName]);
  const isOnlyLocalProfile = !isLinked && S.users.filter((u) => !S.linked?.[u]).length <= 1 && S.users.length <= 1;

  const sessionsCount = S.sessions.filter((s) => s.user === athleteName).length;
  const plansList = S.plans[athleteName] || [];
  const plansCount = plansList.length;
  const prCount =
    S.prs.filter((p) => p.user === athleteName).length +
    S.prx.filter((p) => p.user === athleteName).length;
  const bwCount = S.bwh.filter((b) => b.user === athleteName).length;

  const monthIds = new Set(plansList.map((m) => m.id).filter(Boolean));
  const sharedMonthIds = new Set<string>();
  Object.entries(S.plans || {}).forEach(([u, list]) => {
    if (u === athleteName) return;
    (list || []).forEach((m) => {
      if (m.id) sharedMonthIds.add(m.id);
    });
  });
  const exclusiveAnnexesCount = S.annex.filter(
    (a) => a.m && monthIds.has(a.m) && !sharedMonthIds.has(a.m)
  ).length;

  return (
    <BottomSheet
      open={Boolean(athleteName)}
      onClose={() => {
        if (!busy) onClose();
      }}
      os={os}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-2xl bg-[var(--danger)]/15 text-[var(--danger)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold leading-snug">
              Eliminar a «{athleteName}»
            </h3>
            <p className="text-xs text-[var(--mut)] mt-0.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[var(--ac2)] shrink-0" />
              <span>
                {isLinked
                  ? 'Cuenta de atleta vinculada con Google'
                  : 'Perfil gestionado por el entrenador'}
              </span>
            </p>
          </div>
        </div>

        <div className="tf-card p-3.5 space-y-2 text-xs">
          <b className="block text-[var(--tx)]">Elementos asociados detectados en Firebase:</b>
          <div className="grid grid-cols-2 gap-2 text-[var(--mut)]">
            <div>
              Sesiones registradas: <b className="text-[var(--tx)] tabular-nums">{sessionsCount}</b>
            </div>
            <div>
              Meses de plan: <b className="text-[var(--tx)] tabular-nums">{plansCount}</b>
            </div>
            <div>
              Marcas PR: <b className="text-[var(--tx)] tabular-nums">{prCount}</b>
            </div>
            <div>
              Pesos y anexos:{' '}
              <b className="text-[var(--tx)] tabular-nums">
                {bwCount + exclusiveAnnexesCount}
              </b>
            </div>
          </div>
          {sharedMonthIds.size > 0 && exclusiveAnnexesCount === 0 && (
            <p className="text-[11px] text-[var(--mut)] pt-1 border-t border-[var(--line)]/60">
              Los anexos compartidos con otros atletas no se eliminarán.
            </p>
          )}
        </div>

        {isOnlyLocalProfile ? (
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-xs text-amber-200 leading-relaxed">
            Debe permanecer al menos un perfil activo en la aplicación. Crea otro atleta primero si
            deseas eliminar a «{athleteName}».
          </div>
        ) : isLinked ? (
          <div className="rounded-2xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 p-3.5 text-xs text-[var(--tx)] space-y-1.5 leading-relaxed">
            <p>
              Esta acción eliminará en Cloud Firestore las{' '}
              <b>{sessionsCount} sesiones</b>, el <b>plan asignado</b> y cualquier archivo propio
              en Storage bajo la gestión del entrenador.
            </p>
            <p className="text-[var(--mut)]">
              Por seguridad de Firebase, la cuenta de Google del atleta es privada y no se elimina:
              si también desea romper el vínculo, el atleta debe pulsar «Quitar» en Perfil → Mi
              entrenador.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 p-3.5 text-xs text-[var(--tx)] leading-relaxed">
            Se eliminarán definitivamente en Cloud Firestore y Storage este perfil, sus{' '}
            <b>{sessionsCount} sesiones</b>, planes, PRs, historial de peso y archivos exclusivos
            sin dejar registros huérfanos.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="tf-tap flex-1 min-h-[46px] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          {!isOnlyLocalProfile && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                haptic('medium');
                onConfirmDelete(athleteName);
              }}
              className="tf-tap flex-1 min-h-[46px] rounded-xl bg-[var(--danger)] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{busy ? 'Eliminando…' : 'Confirmar borrado'}</span>
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
