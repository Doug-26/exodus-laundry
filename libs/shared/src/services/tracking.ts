import { type Database, ref, set, remove, onValue } from 'firebase/database';
import type { RiderLocation } from '../models/rider-location.model';

/**
 * Realtime Database live-tracking helpers (§9, Phase 8).
 *
 * Layout: `deliveries/{orderId}`
 *   - `meta`: { riderId, customerId } — drives the security rules (who may read/write).
 *   - `riderLocation`: the rider's latest {@link RiderLocation}, overwritten as they move.
 *
 * The rider seeds `meta` then streams `riderLocation`; the customer subscribes.
 * The whole node is deleted on delivery completion (DPA cleanup).
 */

/** Who is allowed on this delivery node. Written once by the rider on start. */
export interface DeliveryMeta {
  riderId: string;
  customerId: string;
}

const deliveryPath = (orderId: string): string => `deliveries/${orderId}`;

/** Seed the meta node the security rules key off (rider + customer uids). */
export function seedDeliveryMeta(
  db: Database,
  orderId: string,
  meta: DeliveryMeta,
): Promise<void> {
  return set(ref(db, `${deliveryPath(orderId)}/meta`), meta);
}

/** Overwrite the rider's latest position. */
export function writeRiderLocation(
  db: Database,
  orderId: string,
  location: RiderLocation,
): Promise<void> {
  return set(ref(db, `${deliveryPath(orderId)}/riderLocation`), location);
}

/**
 * Subscribe to the rider's live position for an order.
 * Invokes `cb` with the latest {@link RiderLocation}, or `null` when absent.
 * Returns an unsubscribe function.
 */
export function subscribeRiderLocation(
  db: Database,
  orderId: string,
  cb: (location: RiderLocation | null) => void,
): () => void {
  const locationRef = ref(db, `${deliveryPath(orderId)}/riderLocation`);
  return onValue(locationRef, (snap) => cb((snap.val() as RiderLocation | null) ?? null));
}

/** Delete the entire delivery node (location + meta) — call on completion. */
export function clearDelivery(db: Database, orderId: string): Promise<void> {
  return remove(ref(db, deliveryPath(orderId)));
}
