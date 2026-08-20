import { Injectable, inject } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { PhoneTakenError } from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

export interface ProvisionInput {
  name: string;
  email: string;
  phoneRaw: string;
  role: 'staff' | 'rider';
}

/**
 * Creates a staff/rider account via the admin-gated `createTeamMember` Cloud
 * Function (server-side, admin SDK) — so the Firestore rules can lock client
 * self-signup to role:'customer' only. The function creates the Auth user +
 * profile; we then send the built-in password-reset email so the new user sets
 * their own password. The admin's own session is never touched.
 */
@Injectable({ providedIn: 'root' })
export class ProvisioningService {
  private readonly fb = inject(FIREBASE);

  async createStaffOrRider(input: ProvisionInput): Promise<void> {
    const fn = httpsCallable(getFunctions(this.fb.app, 'us-central1'), 'createTeamMember');
    try {
      await fn({
        name: input.name,
        email: input.email,
        phoneRaw: input.phoneRaw,
        role: input.role,
      });
    } catch (err) {
      // Map the callable's HttpsError messages back to the errors the team screen
      // already handles, so its catch block stays unchanged.
      const message = (err as { message?: string }).message;
      if (message === 'phone-taken') {
        throw new PhoneTakenError(input.phoneRaw);
      }
      if (message === 'email-taken') {
        throw { code: 'auth/email-already-in-use' };
      }
      throw err;
    }
    // Built-in reset email (works for any address; doesn't change our session).
    await sendPasswordResetEmail(this.fb.auth, input.email);
  }
}
