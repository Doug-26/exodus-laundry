import { Injectable, computed, inject, signal } from '@angular/core';
import {
  createUserProfile,
  getUserProfile,
  onAuthChange,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  type FirebaseUser,
  type User,
  type UserRole,
} from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

export type AuthStatus = 'initializing' | 'authed' | 'anon';

export interface CustomerSignupInput {
  name: string;
  email: string;
  password: string;
  phoneRaw: string;
}

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
    // Load the profile eagerly so post-login role routing sees a fresh role.
    try {
      this._profile.set(await getUserProfile(this.fb.firestore, cred.user.uid));
    } catch {
      this._profile.set(null);
    }
  }

  /** Self-service registration. Always creates a customer. */
  async signupCustomer(input: CustomerSignupInput): Promise<void> {
    const cred = await signUpWithEmail(this.fb.auth, input.email, input.password);
    try {
      await createUserProfile(this.fb.firestore, cred.user.uid, {
        name: input.name,
        phoneRaw: input.phoneRaw,
        role: 'customer',
      });
    } catch (err) {
      // Roll back the orphaned Auth account so the email isn't burned.
      await cred.user.delete().catch(() => undefined);
      throw err;
    }
    // onAuthChange fired before the profile existed; refresh it now.
    this._profile.set(await getUserProfile(this.fb.firestore, cred.user.uid));
  }

  logout() {
    return signOutUser(this.fb.auth);
  }
}
