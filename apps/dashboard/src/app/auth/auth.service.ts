import { Injectable, computed, inject, signal } from '@angular/core';
import {
  getUserProfile,
  onAuthChange,
  sendReset,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  type FirebaseUser,
  type User,
  type UserRole,
} from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

export type AuthStatus = 'initializing' | 'authed' | 'anon';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly fb = inject(FIREBASE);

  private readonly _firebaseUser = signal<FirebaseUser | null>(null);
  private readonly _profile = signal<User | null>(null);
  private readonly _status = signal<AuthStatus>('initializing');

  readonly firebaseUser = this._firebaseUser.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly status = this._status.asReadonly();
  readonly role = computed<UserRole | null>(() => this._profile()?.role ?? null);

  private resolveReady!: () => void;
  private readyResolved = false;
  /** Resolves after the first auth resolution INCLUDING the profile fetch. */
  readonly ready = new Promise<void>((resolve) => (this.resolveReady = resolve));

  constructor() {
    onAuthChange(this.fb.auth, async (user) => {
      this._firebaseUser.set(user);
      if (user) {
        try {
          this._profile.set(await getUserProfile(this.fb.firestore, user.uid));
        } catch {
          this._profile.set(null);
        }
        this._status.set('authed');
      } else {
        this._profile.set(null);
        this._status.set('anon');
      }
      if (!this.readyResolved) {
        this.readyResolved = true;
        this.resolveReady();
      }
    });
  }

  async loginEmail(email: string, password: string): Promise<void> {
    const cred = await signInWithEmail(this.fb.auth, email, password);
    await this.refreshProfile(cred.user.uid);
  }

  async loginGoogle(): Promise<void> {
    const cred = await signInWithGoogle(this.fb.auth);
    await this.refreshProfile(cred.user.uid);
  }

  /** Load the Firestore profile eagerly so guards see a fresh role right after login. */
  private async refreshProfile(uid: string): Promise<void> {
    try {
      this._profile.set(await getUserProfile(this.fb.firestore, uid));
    } catch {
      this._profile.set(null);
    }
  }

  logout() {
    return signOutUser(this.fb.auth);
  }

  reset(email: string) {
    return sendReset(this.fb.auth, email);
  }
}
