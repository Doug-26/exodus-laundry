/**
 * Cloud Functions — stubs to be implemented in Phase 5 (ready notification).
 *
 * Phase 5: onOrderReady — triggered when orders/{orderId}.status transitions
 * to "ready"; sends FCM push to the linked customer's fcmTokens.
 * Guest orders (customerId === null) send nothing and do not error.
 */

import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onOrderReady } from './notifications/on-order-ready';
export { startDelivery } from './deliveries/start-delivery';
