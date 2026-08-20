import {
  type Firestore,
  type Unsubscribe,
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import type { Rate } from '../models/rate.model';

export type { Rate };

/**
 * Compute an order's price from its rate and weight (Phase 10, §4.3).
 *   base price covers up to baseKg; each kg above adds perKg.
 *   perKg === 0 → flat baseAmount (weight ignored).
 * Returns null when there's no usable rate/weight so callers fall back to manual entry.
 */
export function computePrice(rate: Rate | null | undefined, weightKg: number | null): number | null {
  if (!rate || !rate.active) {
    return null;
  }
  // Flat: fixed amount regardless of weight.
  if (rate.perKg === 0) {
    return rate.baseAmount;
  }
  // Per-kg above the base needs a positive weight.
  if (weightKg === null || !(weightKg > 0)) {
    return null;
  }
  const overageKg = Math.max(0, weightKg - rate.baseKg);
  return Math.round(rate.baseAmount + overageKg * rate.perKg);
}

/** Live subscription to all rates (active + inactive), keyed by service id. */
export function subscribeRates(firestore: Firestore, cb: (rates: Rate[]) => void): Unsubscribe {
  return onSnapshot(collection(firestore, 'rates'), (snap) => {
    cb(snap.docs.map((d) => d.data() as Rate));
  });
}

/** One-shot read of all rates. */
export async function getRates(firestore: Firestore): Promise<Rate[]> {
  const snap = await getDocs(collection(firestore, 'rates'));
  return snap.docs.map((d) => d.data() as Rate);
}

/** Create or update the rate for a service (admin-only per security rules). */
export async function upsertRate(firestore: Firestore, rate: Rate): Promise<void> {
  await setDoc(doc(firestore, 'rates', rate.service), rate);
}
