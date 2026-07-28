import {
  type Auth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User as FirebaseUser,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth';

export type { FirebaseUser, UserCredential, Unsubscribe };

/**
 * Framework-agnostic wrappers over the Firebase Auth SDK.
 * Each takes an `Auth` instance explicitly so the dashboard's secondary-app
 * provisioning flow can reuse them with a non-primary Auth.
 */

export function signUpWithEmail(auth: Auth, email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInWithEmail(auth: Auth, email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signInWithGoogle(auth: Auth): Promise<UserCredential> {
  return signInWithPopup(auth, new GoogleAuthProvider());
}

export function signOutUser(auth: Auth): Promise<void> {
  return signOut(auth);
}

export function sendReset(auth: Auth, email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export function onAuthChange(auth: Auth, cb: (user: FirebaseUser | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, cb);
}

export function getCurrentUser(auth: Auth): FirebaseUser | null {
  return auth.currentUser;
}
