import {
  type Firestore,
  type FieldValue,
  type Unsubscribe,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { toCanonical } from '../utils/phone';
import type {
  Fulfilment,
  Order,
  OrderStatus,
  OrderWithId,
  ShopLocation,
} from '../models/order.model';

// ── Pure helpers (no Firestore — cheap to unit test) ─────────────────────────

export interface ServiceOption {
  id: string;
  label: string;
}

export const SERVICES: readonly ServiceOption[] = [
  { id: 'wash_fold', label: 'Wash & Fold' },
  { id: 'wash_only', label: 'Wash Only' },
  { id: 'dry_clean', label: 'Dry Clean' },
  { id: 'ironing', label: 'Ironing / Press' },
  { id: 'comforter', label: 'Comforter / Beddings' },
];

export function serviceLabel(id: string): string {
  return SERVICES.find((s) => s.id === id)?.label ?? id;
}

/** MMDD in the given timezone (Asia/Manila by default) — deterministic across devices. */
export function dailyKey(date: Date = new Date(), timeZone = 'Asia/Manila'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${month}${day}`;
}

export function formatClaimNumber(key: string, seq: number): string {
  return `${key}-${String(seq).padStart(3, '0')}`;
}

export function activeFor(status: OrderStatus): boolean {
  return status !== 'completed' && status !== 'cancelled';
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Received',
  washing: 'Washing',
  drying: 'Drying',
  folding: 'Folding',
  ready: 'Ready',
  for_delivery: 'For delivery',
  out_for_delivery: 'Out for delivery',
  picked_up: 'Picked up',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

const LINEAR_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  received: 'washing',
  washing: 'drying',
  drying: 'folding',
  folding: 'ready',
};

/**
 * The single legal next status, or null when the order is terminal or is waiting
 * on a decision (at `ready` a fulfilment must be chosen before it can advance).
 */
export function nextStatus(status: OrderStatus, fulfilment: Fulfilment): OrderStatus | null {
  const linear = LINEAR_NEXT[status];
  if (linear) {
    return linear;
  }
  switch (status) {
    case 'ready':
      return fulfilment === 'pickup' ? 'picked_up' : fulfilment === 'delivery' ? 'for_delivery' : null;
    case 'picked_up':
      return 'completed';
    case 'for_delivery':
      return 'out_for_delivery';
    case 'out_for_delivery':
      return 'completed';
    default:
      return null; // completed, cancelled
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

// ── Firestore operations ─────────────────────────────────────────────────────

export interface CreateOrderInput {
  /** uid of the staff/admin creating the walk-in order. */
  createdBy: string;
  guestName: string;
  guestPhoneRaw: string;
  service: string;
  weightKg: number | null;
  loadCount: number | null;
  price: number | null;
  notes: string;
  shopLocation: ShopLocation;
}

type OrderWrite = Omit<Order, 'createdAt' | 'updatedAt'> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
};

/**
 * Create a walk-in (guest) order with an atomically-allocated daily claim number.
 * Runs in a transaction, so it REQUIRES connectivity — it will fail offline.
 * Throws (from toCanonical) if the phone is not a valid PH mobile number.
 */
export async function createOrder(
  firestore: Firestore,
  input: CreateOrderInput,
): Promise<{ id: string; claimNumber: string }> {
  const phone = toCanonical(input.guestPhoneRaw); // throws on invalid
  const key = dailyKey();
  const counterRef = doc(firestore, 'counters', key);
  const orderRef = doc(collection(firestore, 'orders')); // client-generated id

  const claimNumber = await runTransaction(firestore, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists() ? ((counterSnap.data() as { seq?: number }).seq ?? 0) : 0;
    const seq = current + 1;
    const claim = formatClaimNumber(key, seq);

    tx.set(counterRef, { seq }, { merge: true });

    const write: OrderWrite = {
      customerId: null,
      guestContact: { name: input.guestName, phone },
      createdBy: input.createdBy,
      source: 'walk_in',
      claimNumber: claim,
      status: 'received',
      fulfilment: null,
      service: input.service,
      loadCount: input.loadCount,
      weightKg: input.weightKg,
      price: input.price,
      notes: input.notes,
      destination: null,
      shopLocation: input.shopLocation,
      assignedRiderId: null,
      routeCache: null,
      active: true,
      statusHistory: [{ status: 'received', at: Timestamp.now() }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    tx.set(orderRef, write);
    return claim;
  });

  return { id: orderRef.id, claimNumber };
}

/**
 * Advance an order to `target`, validated against the state machine. A plain
 * updateDoc (not a transaction) so it queues offline. `order` is the current
 * status/fulfilment from the live snapshot the caller already holds.
 */
export async function updateOrderStatus(
  firestore: Firestore,
  id: string,
  target: OrderStatus,
  order: Pick<Order, 'status' | 'fulfilment'>,
): Promise<void> {
  if (target !== nextStatus(order.status, order.fulfilment)) {
    throw new InvalidTransitionError(order.status, target);
  }
  await updateDoc(doc(firestore, 'orders', id), {
    status: target,
    active: activeFor(target),
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status: target, at: Timestamp.now() }),
  });
}

export async function setFulfilment(
  firestore: Firestore,
  id: string,
  fulfilment: Fulfilment,
): Promise<void> {
  await updateDoc(doc(firestore, 'orders', id), { fulfilment, updatedAt: serverTimestamp() });
}

export async function cancelOrder(firestore: Firestore, id: string): Promise<void> {
  await updateDoc(doc(firestore, 'orders', id), {
    status: 'cancelled',
    active: false,
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status: 'cancelled', at: Timestamp.now() }),
  });
}

/** Live subscription to the active queue (unsorted; sort client-side, null createdAt = newest). */
export function subscribeActiveOrders(
  firestore: Firestore,
  cb: (orders: OrderWithId[]) => void,
): Unsubscribe {
  const q = query(collection(firestore, 'orders'), where('active', '==', true));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Order) })));
  });
}

export async function getOrder(firestore: Firestore, id: string): Promise<OrderWithId | null> {
  const snap = await getDoc(doc(firestore, 'orders', id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Order) } : null;
}

export function subscribeOrder(
  firestore: Firestore,
  id: string,
  cb: (order: OrderWithId | null) => void,
): Unsubscribe {
  return onSnapshot(doc(firestore, 'orders', id), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() as Order) } : null);
  });
}
