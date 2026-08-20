/**
 * linkGuestOrders — callable invoked right after a customer signs up.
 *
 * Retroactively attaches prior walk-in/guest orders (customerId === null) to the
 * new account. Runs server-side (admin SDK) so it can match on the caller's OWN
 * phone without the client ever querying orders by an arbitrary phone number
 * (the old client-side path leaked any phone's order history). Best-effort:
 * returns the number linked; never throws for "nothing to link".
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const linkGuestOrders = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }

  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const phone = userSnap.get('phone') as string | undefined;
  const role = userSnap.get('role');
  // Only customers inherit guest orders; anything else is a no-op.
  if (!phone || role !== 'customer') {
    return { linked: 0 };
  }

  // Single-field equality on the phone → automatic index; filter the null
  // customerId in code so no composite index is needed.
  const snap = await db.collection('orders').where('guestContact.phone', '==', phone).get();
  const toLink = snap.docs.filter((d) => d.get('customerId') === null);
  if (toLink.length === 0) {
    return { linked: 0 };
  }

  const batch = db.batch();
  for (const d of toLink) {
    batch.update(d.ref, { customerId: uid, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();

  logger.info('linkGuestOrders: linked guest orders', { uid, linked: toLink.length });
  return { linked: toLink.length };
});
