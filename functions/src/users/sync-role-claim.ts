/**
 * syncRoleClaim — mirrors users/{uid}.role into the Auth custom claim `role`.
 *
 * Why this exists: Storage and Realtime Database rules CANNOT read Firestore, so
 * they cannot use the roleIs()/isStaff() helpers that firestore.rules relies on.
 * They can read `request.auth.token.role` / `auth.token.role`, so the role has to
 * live on the ID token as well as in the user document.
 *
 * Fires on every users/{uid} write, but only calls setCustomUserClaims when the
 * claim actually differs from the document. That keeps routine writes (fcmTokens,
 * photoUrl) from hammering the Auth API, while still self-healing any account
 * whose claim drifted or was never set.
 *
 * NOTE: a claim only reaches a client on its next ID-token refresh. Both apps
 * force one at login (getIdToken(true)); a user signed in at the moment their
 * role changes keeps the old claim for up to an hour.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';

const VALID_ROLES = ['customer', 'rider', 'staff', 'admin'];

export const syncRoleClaim = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const after = event.data?.after;
  const role = after?.exists ? (after.get('role') as string | undefined) : undefined;

  // Document deleted, or role missing/unrecognised — clear rather than guess.
  const desired = role && VALID_ROLES.includes(role) ? role : null;

  let current: unknown;
  try {
    current = (await getAuth().getUser(uid)).customClaims?.['role'] ?? null;
  } catch (err) {
    // No Auth user (e.g. a fixture doc, or the account was deleted first).
    logger.info('syncRoleClaim: no auth user, skipping', { uid, err: String(err) });
    return;
  }

  if (current === desired) {
    return;
  }

  await getAuth().setCustomUserClaims(uid, desired ? { role: desired } : null);
  logger.info('syncRoleClaim: claim updated', { uid, from: current, to: desired });
});
