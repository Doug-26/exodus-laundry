import { Injectable, inject } from '@angular/core';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { createUserProfile } from '@exodus/shared';
import { environment } from '../../environments/environment';
import { FIREBASE } from '../firebase.providers';

export interface ProvisionInput {
  name: string;
  email: string;
  phoneRaw: string;
  role: 'staff' | 'rider';
}

/**
 * Creates a staff/rider account WITHOUT disturbing the admin's own session.
 *
 * The Auth account is created on a throwaway secondary Firebase app (in-memory
 * persistence, deleted afterwards) so the primary/admin session is untouched.
 * The Firestore profile is written through the primary app. If the phone-uniqueness
 * transaction fails, the just-created Auth account is rolled back so no orphan remains.
 * The new user receives a password-reset email to set their own password.
 */
@Injectable({ providedIn: 'root' })
export class ProvisioningService {
  private readonly fb = inject(FIREBASE);

  async createStaffOrRider(input: ProvisionInput): Promise<void> {
    const secondary = initializeApp(environment.firebase, `provisioning-${Date.now()}`);
    const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    try {
      const tempPassword = `${crypto.randomUUID()}Aa1!`;
      const cred = await createUserWithEmailAndPassword(secondaryAuth, input.email, tempPassword);
      try {
        await createUserProfile(this.fb.firestore, cred.user.uid, {
          name: input.name,
          phoneRaw: input.phoneRaw,
          role: input.role,
        });
      } catch (err) {
        // Roll back the Auth account so we never leave an orphan (and don't burn the email).
        await cred.user.delete().catch(() => undefined);
        throw err;
      }
      await sendPasswordResetEmail(secondaryAuth, input.email);
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
      await deleteApp(secondary).catch(() => undefined);
    }
  }
}
