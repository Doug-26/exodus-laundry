/**
 * startDelivery — callable invoked when a rider taps "Start delivery".
 *
 * Rider self-claim: verifies the caller is a rider, makes ONE Google Routes API
 * call (shop → customer destination, traffic-aware), and atomically claims the
 * order — assignedRiderId, routeCache, status: out_for_delivery. Compute-once is
 * enforced here (the client never calls Routes; re-opening uses the cache).
 * The Routes key lives ONLY in this Functions secret, never on the device.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

const mapsRoutesKey = defineSecret('MAPS_ROUTES_KEY');

interface LatLng {
  lat: number;
  lng: number;
}

interface RoutesApiResponse {
  routes?: { duration?: string; polyline?: { encodedPolyline?: string } }[];
}

export const startDelivery = onCall({ secrets: [mapsRoutesKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const orderId = (request.data as { orderId?: string })?.orderId;
  if (!orderId) {
    throw new HttpsError('invalid-argument', 'orderId is required.');
  }

  const db = getFirestore();

  // Riders only.
  const userSnap = await db.doc(`users/${uid}`).get();
  if (userSnap.get('role') !== 'rider') {
    throw new HttpsError('permission-denied', 'Only riders can start a delivery.');
  }

  // Load the order and validate it's claimable.
  const orderRef = db.doc(`orders/${orderId}`);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError('not-found', 'Order not found.');
  }
  if (orderSnap.get('status') !== 'for_delivery') {
    throw new HttpsError('failed-precondition', 'This delivery is not available to start.');
  }
  const shop = orderSnap.get('shopLocation') as LatLng | undefined;
  const dest = orderSnap.get('destination') as LatLng | undefined;
  if (!shop || !dest) {
    throw new HttpsError('failed-precondition', 'This order has no delivery destination.');
  }

  // ONE Routes API call (traffic-aware). Node 22 global fetch.
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': mapsRoutesKey.value(),
      'X-Goog-FieldMask': 'routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: shop.lat, longitude: shop.lng } } },
      destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('startDelivery: Routes API error', { status: response.status, text });
    throw new HttpsError('internal', 'Could not compute the route.');
  }

  const data = (await response.json()) as RoutesApiResponse;
  const route = data.routes?.[0];
  const encodedPolyline = route?.polyline?.encodedPolyline;
  const durationStr = route?.duration; // e.g. "1234s"
  if (!encodedPolyline || !durationStr) {
    logger.error('startDelivery: incomplete Routes response', { data });
    throw new HttpsError('internal', 'The route could not be determined.');
  }
  const etaSeconds = Number.parseInt(durationStr.replace('s', ''), 10) || 0;

  // Claim atomically; re-check status inside the transaction to avoid two riders
  // racing to claim the same order.
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    if (fresh.get('status') !== 'for_delivery') {
      throw new HttpsError('failed-precondition', 'This delivery was just claimed.');
    }
    tx.update(orderRef, {
      assignedRiderId: uid,
      routeCache: { encodedPolyline, etaSeconds, computedAt: Timestamp.now() },
      status: 'out_for_delivery',
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({ status: 'out_for_delivery', at: Timestamp.now() }),
    });
  });

  logger.info('startDelivery: computed route + claimed', { orderId, uid, etaSeconds });
  return { etaSeconds };
});
