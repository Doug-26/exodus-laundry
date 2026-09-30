/**
 * backfillRoleClaims — admin-gated callable that sets the `role` custom claim on
 * every existing account.
 *
 * syncRoleClaim only fires on users/{uid} writes, so accounts created before
 * Phase 14 would never get a claim and staff would keep failing Storage writes.
 * This walks the collection once and fills them in.
 *
 * ONE-OFF: safe to re-run (it skips accounts whose claim already matches), but it
 * can be deleted once every account has been migrated.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const VALID_ROLES = ['customer', 'rider', 'staff', 'admin'];

export const backfillRoleClaims = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }

  const db = getFirestore();
  const caller = await db.doc(`users/${callerUid}`).get();
  if (caller.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can run the backfill.');
  }

  const snap = await db.collection('users').get();
  let updated = 0;
  let alreadySet = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const uid = docSnap.id;
    const role = docSnap.get('role') as string | undefined;
    if (!role || !VALID_ROLES.includes(role)) {
      skipped += 1;
      continue;
    }
    try {
      const existing = (await getAuth().getUser(uid)).customClaims?.['role'];
      if (existing === role) {
        alreadySet += 1;
        continue;
      }
      await getAuth().setCustomUserClaims(uid, { role });
      updated += 1;
    } catch (err) {
      // A user doc with no matching Auth account (deleted user, test fixture).
      logger.warn('backfillRoleClaims: skipping uid', { uid, err: String(err) });
      skipped += 1;
    }
  }

  const result = { total: snap.size, updated, alreadySet, skipped };
  logger.info('backfillRoleClaims: done', { ...result, by: callerUid });
  return result;
});
