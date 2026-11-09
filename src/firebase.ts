import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig';

/** Em desenvolvimento, aponta para os emuladores locais (npm run emuladores). */
export const USAR_EMULADOR = import.meta.env.VITE_EMULADOR === '1';
/** Firebase configurado (ou emulador): dados na nuvem com login. Caso contrário, só neste aparelho. */
export const FIREBASE_ATIVO = USAR_EMULADOR || !!firebaseConfig.projectId;

export const CONFIG_EMULADOR = { projectId: 'demo-silagem', apiKey: 'demo', authDomain: 'localhost' };

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let firestore: Firestore | undefined;

export function obterFirebase() {
  if (!app) {
    app = getApps()[0] ?? initializeApp(USAR_EMULADOR ? CONFIG_EMULADOR : firebaseConfig);
    auth = getAuth(app);
    firestore = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (USAR_EMULADOR) {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(firestore, 'localhost', 8080);
    }
  }
  return { app, auth: auth!, firestore: firestore! };
}
