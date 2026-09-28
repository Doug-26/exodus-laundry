/**
 * Cloud Functions entry point — every deployed function is re-exported here.
 *
 * onOrderReady      push when an order reaches "ready"
 * onOrderCompleted  push when an order reaches "completed"
 * startDelivery     rider self-claim + Google Routes lookup
 * linkGuestOrders   retro-link guest orders to a new account
 * createTeamMember  admin-gated staff/rider provisioning
 *
 * Guest orders (customerId === null) never push and never error.
 */

import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onOrderReady } from './notifications/on-order-ready';
export { onOrderCompleted } from './notifications/on-order-completed';
export { startDelivery } from './deliveries/start-delivery';
export { linkGuestOrders } from './users/link-guest-orders';
export { createTeamMember } from './team/create-team-member';
