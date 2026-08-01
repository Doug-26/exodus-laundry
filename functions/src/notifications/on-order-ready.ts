/**
 * onOrderReady — fires when an order transitions INTO status "ready" and pushes
 * the "laundry is ready" notification to the linked customer's devices.
 *
 * - Fires exactly once per transition: before.status !== 'ready' && after.status === 'ready'.
 * - Guest orders (customerId null) send nothing and do not error (§7/§12 fallback).
 * - Dead/unregistered tokens are pruned from the user profile.
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const onOrderReady = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) {
    return;
  }

  // Only act on the entry into "ready".
  if (before.status === 'ready' || after.status !== 'ready') {
    return;
  }

  // Guest order (no linked account) — nothing to notify.
  const customerId = after.customerId as string | null | undefined;
  if (!customerId) {
    logger.info('onOrderReady: guest order, no push', { orderId: event.params.orderId });
    return;
  }

  const db = getFirestore();
  const userSnap = await db.doc(`users/${customerId}`).get();
  const tokens = (userSnap.get('fcmTokens') as string[] | undefined) ?? [];
  if (tokens.length === 0) {
    logger.info('onOrderReady: no device tokens', { orderId: event.params.orderId, customerId });
    return;
  }

  const claimNumber = (after.claimNumber as string | undefined) ?? '';
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Laundry ready',
      body: claimNumber ? `Order ${claimNumber} is ready.` : 'Your laundry is ready.',
    },
    data: { orderId: event.params.orderId, type: 'ready' },
  });

  // Prune tokens the FCM backend reports as permanently invalid.
  const staleTokens: string[] = [];
  response.responses.forEach((r, i) => {
    if (r.success) {
      return;
    }
    const code = r.error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-argument'
    ) {
      staleTokens.push(tokens[i]);
    }
  });
  if (staleTokens.length > 0) {
    await db
      .doc(`users/${customerId}`)
      .update({ fcmTokens: FieldValue.arrayRemove(...staleTokens) });
  }

  logger.info('onOrderReady: sent', {
    orderId: event.params.orderId,
    customerId,
    successCount: response.successCount,
    failureCount: response.failureCount,
    pruned: staleTokens.length,
  });
});
