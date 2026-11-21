import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import rawFirebaseConfig from '../../firebase-applet-config.json';
import type { AppState, TrainingSession } from '../types/trazik';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || rawFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || rawFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || rawFirebaseConfig.projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || rawFirebaseConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || rawFirebaseConfig.appId,
};

const app = initializeApp(firebaseConfig);
// Original trazikfit-5fafa uses the default Firestore database
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Cuentas propietarias definidas en firestore.rules de trazikfit-5fafa
export const OWNER_EMAILS = ['vicentetorojeldres@gmail.com', 'torowkozbeats@gmail.com'];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function friendlyFirestoreError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err || '');
  if (code === 'auth/unauthorized-domain') {
    const host =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : '';
    return host
      ? `Dominio no autorizado en Firebase (${host}). Agrégalo en Authentication → Settings → Authorized domains del proyecto trazikfit-5fafa.`
      : 'Este dominio no está autorizado en Firebase.';
  }
  if (
    code === 'permission-denied' ||
    msg.includes('permission-denied') ||
    msg.includes('Missing or insufficient permissions')
  ) {
    return 'Firestore rechazó el acceso: verifica permisos o sesión verificada.';
  }
  if (msg.includes('Quota exceeded')) {
    return 'Se alcanzó la cuota diaria gratuita de Firestore. Se restablecerá mañana.';
  }
  return code || msg || 'Error de conexión';
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export function stripUndefined<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map(stripUndefined) as unknown as T;
  }
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return val;
}

export function isProjectStorageUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();
  const bucket = firebaseConfig.storageBucket || 'trazikfit-5fafa.firebasestorage.app';
  const project = firebaseConfig.projectId || 'trazikfit-5fafa';
  return (
    u.startsWith(`gs://${bucket}`) ||
    u.startsWith(`gs://${project}`) ||
    (u.includes('firebasestorage.googleapis.com') &&
      (u.includes(bucket) || u.includes(`${project}.appspot.com`) || u.includes(project)))
  );
}

export async function uploadAnnexImage(
  uid: string,
  monthId: string,
  annexId: string,
  blob: Blob
): Promise<string> {
  const path = `users/${uid}/annexes/${monthId || 'general'}/${annexId}.jpg`;
  const r = storageRef(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(r);
}

export function collectStorageUrlsFromSessions(sessions: TrainingSession[]): string[] {
  const urls: string[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      if (isProjectStorageUrl(ex.link)) urls.push(ex.link);
    }
  }
  return urls;
}

export function collectStorageUrlsFromState(state: AppState): Set<string> {
  const refs = new Set<string>();
  for (const a of state.annex || []) {
    if (isProjectStorageUrl(a.src)) refs.add(a.src);
  }
  for (const s of state.sessions || []) {
    for (const ex of s.exercises || []) {
      if (isProjectStorageUrl(ex.link)) refs.add(ex.link);
    }
  }
  for (const plans of Object.values(state.plans || {})) {
    for (const m of plans || []) {
      for (const d of m.d || []) {
        for (const b of d.b || []) {
          for (const ex of b[1] || []) {
            if (isProjectStorageUrl(ex.l)) refs.add(ex.l);
          }
        }
      }
    }
  }
  return refs;
}

export async function deleteUnusedStorageUrls(
  candidateUrls: string[],
  stillReferenced: Set<string>
): Promise<{ deleted: number; failed: number }> {
  const unique = Array.from(
    new Set(candidateUrls.filter((u) => isProjectStorageUrl(u) && !stillReferenced.has(u)))
  );
  let deleted = 0;
  let failed = 0;
  for (const url of unique) {
    try {
      await deleteObject(storageRef(storage, url));
      deleted += 1;
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'storage/object-not-found') {
        continue;
      }
      failed += 1;
    }
  }
  return { deleted, failed };
}

export async function batchDeleteSessionDocs(
  uid: string,
  sessionIds: string[]
): Promise<void> {
  const uniqueIds = Array.from(new Set(sessionIds.filter(Boolean)));
  for (let i = 0; i < uniqueIds.length; i += 400) {
    const chunk = uniqueIds.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const sid of chunk) {
      batch.delete(doc(db, 'users', uid, 'sessions', sid));
    }
    await batch.commit();
  }
}
