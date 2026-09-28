/**
 * onOrderCompleted — fires when an order transitions INTO status "completed"
 * and pushes the closing notification to the linked customer's devices.
 *
 * Mirrors onOrderReady:
 * - Fires exactly once per transition: before.status !== 'completed' && after.status === 'completed'.
 * - Guest orders (customerId null) send nothing and do not error.
 * - Dead/unregistered tokens are pruned from the user profile.
 *
 * The wording follows how the laundry got back to the customer: a delivery is
 * "Delivered!", a counter pickup is "Order complete".
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const onOrderCompleted = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) {
    return;
  }

  // Only act on the entry into "completed".
  if (before.status === 'completed' || after.status !== 'completed') {
    return;
  }

  // Guest order (no linked account) — nothing to notify.
  const customerId = after.customerId as string | null | undefined;
  if (!customerId) {
    logger.info('onOrderCompleted: guest order, no push', { orderId: event.params.orderId });
    return;
  }

  const db = getFirestore();
  const userSnap = await db.doc(`users/${customerId}`).get();
  const tokens = (userSnap.get('fcmTokens') as string[] | undefined) ?? [];
  if (tokens.length === 0) {
    logger.info('onOrderCompleted: no device tokens', {
      orderId: event.params.orderId,
      customerId,
    });
    return;
  }

  const claimNumber = (after.claimNumber as string | undefined) ?? '';
  const wasDelivered = after.fulfilment === 'delivery';
  const title = wasDelivered ? 'Delivered!' : 'Order complete';
  const body = wasDelivered
    ? claimNumber
      ? `Order ${claimNumber} has been delivered. Thank you!`
      : 'Your laundry has been delivered. Thank you!'
    : claimNumber
      ? `Order ${claimNumber} is complete. Thank you!`
      : 'Your laundry order is complete. Thank you!';

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { orderId: event.params.orderId, type: 'completed' },
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

  logger.info('onOrderCompleted: sent', {
    orderId: event.params.orderId,
    customerId,
    fulfilment: after.fulfilment ?? null,
    successCount: response.successCount,
    failureCount: response.failureCount,
    pruned: staleTokens.length,
  });
});
