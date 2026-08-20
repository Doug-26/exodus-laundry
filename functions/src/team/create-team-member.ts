/**
 * createTeamMember — admin-gated callable that provisions a staff/rider account.
 *
 * Replaces the dashboard's client-side secondary-session provisioning. Doing it
 * server-side lets the Firestore rules lock self-signup to role:'customer' only
 * (no client can mint a privileged role). Creates the Auth user + users/ +
 * phoneNumbers/ docs atomically; the caller (dashboard) then sends the built-in
 * password-reset email. Rolls back the Auth user if the profile write fails.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

// Inline PH phone canonicaliser (mirrors libs/shared/src/utils/phone.ts; functions
// don't depend on @exodus/shared). Only +639XXXXXXXXX is stored.
const PH_CANONICAL_RE = /^\+639\d{9}$/;
function toCanonical(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('empty');
  }
  const stripped = raw.replace(/[\s\-.()]/g, '');
  let normalized: string;
  if (stripped.startsWith('+63')) normalized = stripped;
  else if (stripped.startsWith('63')) normalized = '+' + stripped;
  else if (stripped.startsWith('0')) normalized = '+63' + stripped.slice(1);
  else throw new Error('format');
  if (!PH_CANONICAL_RE.test(normalized)) throw new Error('invalid');
  return normalized;
}

interface CreateTeamMemberInput {
  name?: string;
  email?: string;
  phoneRaw?: string;
  role?: string;
}

export const createTeamMember = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }

  const db = getFirestore();
  const caller = await db.doc(`users/${callerUid}`).get();
  if (caller.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can create team members.');
  }

  const { name, email, phoneRaw, role } = (request.data ?? {}) as CreateTeamMemberInput;
  if (role !== 'staff' && role !== 'rider') {
    throw new HttpsError('invalid-argument', 'role must be staff or rider.');
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new HttpsError('invalid-argument', 'name is required.');
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }
  let phone: string;
  try {
    phone = toCanonical(phoneRaw);
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid PH mobile number.');
  }

  // Pre-check phone uniqueness (the transaction below re-checks under lock).
  const phoneRef = db.doc(`phoneNumbers/${phone}`);
  if ((await phoneRef.get()).exists) {
    throw new HttpsError('already-exists', 'phone-taken');
  }

  // Create the Auth user with a throwaway password (they set their own via reset).
  let uid: string;
  try {
    const rec = await getAuth().createUser({
      email: email.trim(),
      password: `${randomUUID()}Aa1!`,
    });
    uid = rec.uid;
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'email-taken');
    }
    logger.error('createTeamMember: createUser failed', { err });
    throw new HttpsError('internal', 'Could not create the account.');
  }

  // Write the profile + phone index atomically; roll back the Auth user on failure.
  try {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(phoneRef)).exists) {
        throw new HttpsError('already-exists', 'phone-taken');
      }
      tx.set(db.doc(`users/${uid}`), {
        role,
        name: name.trim(),
        phone,
        fcmTokens: [],
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(phoneRef, { uid, createdAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    await getAuth().deleteUser(uid).catch(() => undefined);
    if (err instanceof HttpsError) throw err;
    logger.error('createTeamMember: profile write failed', { err });
    throw new HttpsError('internal', 'Could not create the profile.');
  }

  logger.info('createTeamMember: created', { uid, role, by: callerUid });
  return { uid, email: email.trim() };
});
