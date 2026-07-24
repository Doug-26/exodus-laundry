import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

/** Firebase web config — shape matches the console's web app config object. */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  databaseURL?: string;
}

/** The initialized Firebase SDK handles both front-ends share. */
export interface FirebaseServices {
  app: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  database: Database;
}

let services: FirebaseServices | undefined;

/**
 * Initialize Firebase once and return the shared service handles.
 * Safe to call multiple times — subsequent calls return the same instance.
 */
export function initializeFirebase(config: FirebaseConfig): FirebaseServices {
  if (services) {
    return services;
  }

  const app = initializeApp(config);
  services = {
    app,
    firestore: getFirestore(app),
    auth: getAuth(app),
    database: getDatabase(app),
  };
  return services;
}

/** Returns the initialized services, or throws if initializeFirebase has not run. */
export function getFirebaseServices(): FirebaseServices {
  if (!services) {
    throw new Error('Firebase has not been initialized. Call initializeFirebase() at app startup.');
  }
  return services;
}
