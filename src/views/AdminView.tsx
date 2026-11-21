import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDocs, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, friendlyFirestoreError, handleFirestoreError, OperationType } from '../lib/firebase';
import { haptic } from '../lib/audioHaptics';
import type { AdminUserRow, SubscriptionStatus } from '../types/trazik';

const SUBL: Record<SubscriptionStatus, string> = {
  none: 'Sin suscripción',
  trial: 'Prueba',
  active: 'Activa',
  past_due: 'Vencida',
  canceled: 'Cancelada',
};

interface AdminViewProps {
  me: User | null;
  isAdmin: boolean;
}

export function AdminView({ me, isAdmin }: AdminViewProps) {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const loadDirectory = async (withUsers: boolean) => {
    if (!me || !isAdmin) return;
    setBusy(true);
    setMsg('');
    try {
      const [dr, rr] = await Promise.all([
        getDocs(collection(db, 'directory')),
        getDocs(collection(db, 'roles')),
      ]);
      const R: Record<string, { role?: string; admin?: boolean; subscription?: { status?: SubscriptionStatus } }> = {};
      const M: Record<string, { uid: string; name: string; email: string; last: number; src: string }> = {};

      rr.forEach((d) => {
        R[d.id] = d.data();
      });
      dr.forEach((d) => {
        const o = d.data();
        M[d.id] = {
          uid: d.id,
          name: o.name || '',
          email: o.email || '',
          last: o.lastLogin || 0,
          src: 'directorio',
        };
      });

      if (withUsers) {
        const us = await getDocs(collection(db, 'users'));
        us.forEach((d) => {
          if (!M[d.id]) {
            const o = d.data();
            M[d.id] = {
              uid: d.id,
              name: o.name || '',
              email: String(o.email || '').toLowerCase(),
              last: o.ts || 0,
              src: 'usuarios',
            };
          }
        });
      }

      Object.keys(R).forEach((id) => {
        if (!M[id]) M[id] = { uid: id, name: '', email: '', last: 0, src: 'roles' };
      });

      const list: AdminUserRow[] = Object.values(M)
        .map((x) => {
          const r = R[x.uid];
          return {
            ...x,
            role: r?.role === 'trainer' ? ('trainer' as const) : ('athlete' as const),
            admin: !!r?.admin,
            has: !!r,
            sub: r?.subscription?.status || 'none',
            draftRole: null,
            draftSub: null,
          };
        })
        .sort(
          (a, b) =>
            Number(b.admin) - Number(a.admin) ||
            Number(b.role === 'trainer') - Number(a.role === 'trainer') ||
            String(a.email).localeCompare(String(b.email))
        );

      setRows(list);
      setLoaded(true);
    } catch (err) {
      setMsg(friendlyFirestoreError(err));
      try {
        handleFirestoreError(err, OperationType.LIST, 'directory');
      } catch {
        // surfaced in UI message
      }
    }
    setBusy(false);
  };

  useEffect(() => {
    if (me && isAdmin && !loaded && !busy) {
      loadDirectory(false);
    }
  }, [me, isAdmin]);

  const handleSave = async (uid: string) => {
    const r = rows.find((x) => x.uid === uid);
    if (!r || !me || !isAdmin) return;
    if (uid === me.uid) {
      setMsg('Tu cuenta propietaria no se puede modificar.');
      return;
    }
    const role = r.draftRole || r.role;
    const sub = r.draftSub || r.sub;
    const prev = { role: r.role, sub: r.sub };
    setBusy(true);
    setMsg('');
    try {
      await setDoc(doc(db, 'roles', uid), {
        role,
        admin: role === 'trainer' ? !!r.admin : false,
        subscription: {
          status: sub,
          plan: null,
          currentPeriodEnd: null,
          provider: null,
        },
        updatedAt: Date.now(),
        updatedBy: me.uid,
      });
      await addDoc(collection(db, 'roleAudit'), {
        uid,
        email: r.email || '',
        from: prev,
        to: { role, sub },
        by: me.uid,
        at: Date.now(),
      });
      setRows((prevRows) =>
        prevRows.map((it) =>
          it.uid === uid
            ? {
                ...it,
                role,
                sub,
                has: true,
                admin: role !== 'trainer' ? false : it.admin,
                draftRole: null,
                draftSub: null,
              }
            : it
        )
      );
      haptic('success');
      setMsg('✓ Guardado: ' + (r.email || uid));
    } catch (err) {
      setMsg(friendlyFirestoreError(err));
    }
    setBusy(false);
  };

  if (!me || !isAdmin) {
    return <p className="text-sm text-[var(--mut)]">Sin permiso.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight">Administración</h2>
        <p className="text-xs text-[var(--mut)] mt-1">
          Gestiona los roles de los usuarios. Quien no tenga rol es atleta por defecto. Los cambios
          los valida el servidor.
        </p>
      </div>

      {msg && (
        <p
          className={`text-sm font-medium ${
            msg.startsWith('✓') ? 'text-[var(--ac2)]' : 'text-[var(--danger)]'
          }`}
        >
          {msg}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => loadDirectory(false)}
          className="flex-1 min-h-[42px] rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm font-medium cursor-pointer"
        >
          {busy ? 'Cargando…' : 'Actualizar'}
        </button>
        <button
          type="button"
          onClick={() => loadDirectory(true)}
          className="flex-1 min-h-[42px] rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm font-medium cursor-pointer"
        >
          Incluir usuarios existentes
        </button>
      </div>

      {!loaded ? (
        <p className="text-sm text-[var(--mut)]">Cargando usuarios…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--mut)]">
          Aún no hay usuarios en el directorio. Aparecen cuando inician sesión; usa «Incluir
          usuarios existentes» para ver los ya registrados.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const own = r.uid === me.uid;
            const lock = own || r.admin;
            const dirty =
              (r.draftRole && r.draftRole !== r.role) ||
              (r.draftSub && r.draftSub !== r.sub);
            const initial = String(r.name || r.email || '?').trim().charAt(0).toUpperCase();

            return (
              <div key={r.uid} className="tf-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#A259FF] to-[#321C6A] text-white text-lg font-bold flex items-center justify-center shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block text-sm truncate">
                      {r.name || '(sin nombre)'}
                      {own ? ' · tú' : ''}
                    </b>
                    <small className="block text-xs text-[var(--mut)] break-all">
                      {r.email || r.uid}
                    </small>
                  </div>
                </div>

                <label className="block text-xs text-[var(--mut)]">
                  Tipo de cuenta
                  <select
                    className="tf-input w-full mt-1 px-3 py-2 text-sm"
                    disabled={lock}
                    value={r.draftRole || r.role}
                    onChange={(e) => {
                      const val = e.target.value as 'athlete' | 'trainer';
                      setRows((prev) =>
                        prev.map((it) => (it.uid === r.uid ? { ...it, draftRole: val } : it))
                      );
                    }}
                  >
                    <option value="athlete">
                      Atleta{r.has ? '' : ' (por defecto)'}
                    </option>
                    <option value="trainer">
                      Entrenador{r.admin ? ' · Administrador' : ''}
                    </option>
                  </select>
                </label>

                <label className="block text-xs text-[var(--mut)]">
                  Suscripción (solo estructura, sin cobros)
                  <select
                    className="tf-input w-full mt-1 px-3 py-2 text-sm"
                    disabled={own}
                    value={r.draftSub || r.sub}
                    onChange={(e) => {
                      const val = e.target.value as SubscriptionStatus;
                      setRows((prev) =>
                        prev.map((it) => (it.uid === r.uid ? { ...it, draftSub: val } : it))
                      );
                    }}
                  >
                    {(Object.keys(SUBL) as SubscriptionStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {SUBL[k]}
                      </option>
                    ))}
                  </select>
                </label>

                {own ? (
                  <p className="text-xs text-[var(--mut)]">
                    Cuenta propietaria: no se puede modificar.
                  </p>
                ) : r.admin ? (
                  <p className="text-xs text-[var(--mut)]">
                    Administrador: se gestiona desde la consola.
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={!dirty || busy}
                    onClick={() => handleSave(r.uid)}
                    className={`w-full min-h-[42px] rounded-xl text-sm font-semibold cursor-pointer ${
                      dirty
                        ? 'tf-btn-pri'
                        : 'bg-[var(--surface-2)] text-[var(--mut)] border border-[var(--line)] opacity-55 cursor-not-allowed'
                    }`}
                  >
                    Guardar cambios
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
