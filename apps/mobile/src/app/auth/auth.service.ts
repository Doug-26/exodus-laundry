import { Injectable, computed, inject, signal } from '@angular/core';
import {
  createUserProfile,
  getUserProfile,
  linkGuestOrdersToCustomer,
  onAuthChange,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  type FirebaseUser,
  type User,
  type UserRole,
} from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';
import { OrdersStore } from '../orders/orders.store';
import { PushService } from '../push/push.service';

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
  private readonly ordersStore = inject(OrdersStore);
  private readonly push = inject(PushService);

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
        let profile: User | null = null;
        try {
          profile = await getUserProfile(this.fb.firestore, user.uid);
        } catch {
          profile = null;
        }
        this._profile.set(profile);
        this._status.set('authed');
        // Register this device for the "laundry is ready" push (native-only; idempotent).
        void this.push.connect(user.uid);
        // Drive the order-list subscription from the definitive auth state (not a
        // one-shot read on the page) so it survives sign-out → sign-in cycles.
        this.syncOrderStore(user.uid, profile?.role ?? null);
      } else {
        this._profile.set(null);
        this._status.set('anon');
        this.syncOrderStore(null, null);
      }
      if (!this.readyResolved) {
        this.readyResolved = true;
        this.resolveReady();
      }
    });
  }

  /** Connect the customer order store for customers; disconnect for anyone else. Idempotent. */
  private syncOrderStore(uid: string | null, role: UserRole | null): void {
    if (uid && role === 'customer') {
      this.ordersStore.connect(uid);
    } else {
      this.ordersStore.disconnect();
    }
  }

  async loginEmail(email: string, password: string): Promise<void> {
    const cred = await signInWithEmail(this.fb.auth, email, password);
    // Set the user eagerly (don't wait for onAuthChange) so pages that read
    // firebaseUser().uid right after login — e.g. the order list — get it.
    this._firebaseUser.set(cred.user);
    // Load the profile eagerly so post-login role routing sees a fresh role.
    try {
      this._profile.set(await getUserProfile(this.fb.firestore, cred.user.uid));
    } catch {
      this._profile.set(null);
    }
    // Subscribe the order list eagerly (idempotent; onAuthChange also syncs).
    this.syncOrderStore(cred.user.uid, this._profile()?.role ?? null);
  }

  /** Self-service registration. Always creates a customer. */
  async signupCustomer(input: CustomerSignupInput): Promise<void> {
    const cred = await signUpWithEmail(this.fb.auth, input.email, input.password);
    this._firebaseUser.set(cred.user);
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
    // A signup is always a customer — subscribe the order list now.
    this.syncOrderStore(cred.user.uid, 'customer');

    // Best-effort: attach any prior guest orders placed under this phone.
    // Never block or fail signup on this.
    void linkGuestOrdersToCustomer(this.fb.firestore, input.phoneRaw, cred.user.uid).catch(
      () => undefined,
    );
  }

  async logout(): Promise<void> {
    this.ordersStore.disconnect();
    // Drop this device's push token while we still have the uid, then sign out.
    await this.push.disconnect();
    await signOutUser(this.fb.auth);
  }
}
