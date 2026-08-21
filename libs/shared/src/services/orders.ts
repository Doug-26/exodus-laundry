import {
  type Firestore,
  type FieldValue,
  type Unsubscribe,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
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
  Destination,
  Fulfilment,
  IntakeMethod,
  Order,
  OrderSource,
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
  requested: 'Requested',
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

/** Semantic tone for a status, so both apps colour-code the queue/list the same. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const STATUS_TONES: Record<OrderStatus, StatusTone> = {
  requested: 'warning', // placed but not yet at the shop — needs staff action
  received: 'neutral',
  washing: 'info',
  drying: 'info',
  folding: 'info',
  ready: 'success', // ready for the customer
  for_delivery: 'info',
  out_for_delivery: 'info',
  picked_up: 'success',
  completed: 'success',
  cancelled: 'danger',
};

export function statusTone(status: OrderStatus): StatusTone {
  return STATUS_TONES[status];
}

const LINEAR_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  requested: 'received',
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

/**
 * Staff workflow guard (§4.3): an order must be priced before it moves past
 * intake. Advancing `requested → received` is allowed (that's the cue to open
 * the order and price it); any advance beyond `received` is blocked while
 * `price` is still null. Walk-ins are priced at intake so they're never blocked.
 */
export function needsPriceBeforeAdvance(order: Pick<Order, 'price' | 'status'>): boolean {
  return order.price === null && order.status !== 'requested';
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
  /** App-account uid when the walk-in was matched at intake; null/omitted = guest. */
  customerId?: string | null;
  /** 'walk_in' (default, staff-created) or 'app' (customer self-service). */
  source?: OrderSource;
  /** Inbound intake choice for app orders (drop-off vs shop pickup); null for walk-ins. */
  intakeMethod?: IntakeMethod;
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

    // App orders start at 'requested' (laundry not yet at the shop); walk-ins at 'received'.
    const initialStatus: OrderStatus = input.source === 'app' ? 'requested' : 'received';

    const write: OrderWrite = {
      customerId: input.customerId ?? null,
      guestContact: { name: input.guestName, phone },
      createdBy: input.createdBy,
      source: input.source ?? 'walk_in',
      claimNumber: claim,
      status: initialStatus,
      fulfilment: null,
      intakeMethod: input.intakeMethod ?? null,
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
      statusHistory: [{ status: initialStatus, at: Timestamp.now() }],
      completedAt: null,
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
  const base = {
    status: target,
    active: activeFor(target),
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status: target, at: Timestamp.now() }),
  };
  // Stamp the completion time for revenue reports (Phase 11).
  await updateDoc(
    doc(firestore, 'orders', id),
    target === 'completed' ? { ...base, completedAt: serverTimestamp() } : base,
  );
}

export async function setFulfilment(
  firestore: Firestore,
  id: string,
  fulfilment: Fulfilment,
): Promise<void> {
  await updateDoc(doc(firestore, 'orders', id), { fulfilment, updatedAt: serverTimestamp() });
}

/**
 * Customer confirms delivery from their own device (§8): write the destination
 * pin, choose `delivery`, and advance `ready → for_delivery` — all in ONE
 * updateDoc so we never persist a half-state (e.g. fulfilment set but no
 * destination). `currentStatus` comes from the live snapshot the caller holds;
 * guarded to `ready` so a re-confirm on an already-advanced order is rejected.
 */
export async function confirmDelivery(
  firestore: Firestore,
  id: string,
  destination: Destination,
  currentStatus: OrderStatus,
): Promise<void> {
  if (currentStatus !== 'ready') {
    throw new InvalidTransitionError(currentStatus, 'for_delivery');
  }
  await updateDoc(doc(firestore, 'orders', id), {
    destination,
    fulfilment: 'delivery',
    status: 'for_delivery',
    active: activeFor('for_delivery'),
    updatedAt: serverTimestamp(),
    statusHistory: arrayUnion({ status: 'for_delivery', at: Timestamp.now() }),
  });
}

/**
 * Staff edit of intake details (e.g. pricing an app order that arrived unweighed).
 * Partial patch — only the provided fields are written, so it never clobbers
 * fields it wasn't given (e.g. the customer's notes). Does not touch status/active.
 */
export async function updateOrderDetails(
  firestore: Firestore,
  id: string,
  patch: Partial<Pick<Order, 'weightKg' | 'price' | 'notes' | 'loadCount'>>,
): Promise<void> {
  await updateDoc(doc(firestore, 'orders', id), { ...patch, updatedAt: serverTimestamp() });
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

/**
 * Live subscription to all of a customer's orders (active + history), unsorted.
 * Single-field equality on customerId → automatic index (no composite).
 */
export function subscribeCustomerOrders(
  firestore: Firestore,
  uid: string,
  cb: (orders: OrderWithId[]) => void,
): Unsubscribe {
  const q = query(collection(firestore, 'orders'), where('customerId', '==', uid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Order) })));
  });
}

/**
 * Live subscription to the rider's world: every delivery that's out for delivery
 * or waiting to be claimed. Single-field `in` on status → automatic index (no
 * composite). The rider app filters `available` (for_delivery) vs `mine`
 * (out_for_delivery assigned to this rider) client-side.
 */
export function subscribeRiderOrders(
  firestore: Firestore,
  cb: (orders: OrderWithId[]) => void,
): Unsubscribe {
  const q = query(
    collection(firestore, 'orders'),
    where('status', 'in', ['for_delivery', 'out_for_delivery']),
  );
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

// ── Revenue reports (Phase 11) ───────────────────────────────────────────────

/**
 * Orders completed within [startMs, endMs] (inclusive), by completedAt.
 * Single-field range → automatic index. Orders without completedAt (not yet
 * completed, or completed before the field existed) are naturally excluded.
 */
export async function getCompletedOrdersInRange(
  firestore: Firestore,
  startMs: number,
  endMs: number,
): Promise<OrderWithId[]> {
  const q = query(
    collection(firestore, 'orders'),
    where('completedAt', '>=', Timestamp.fromMillis(startMs)),
    where('completedAt', '<=', Timestamp.fromMillis(endMs)),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Order) }));
}

export interface RevenueSummary {
  completedCount: number;
  totalRevenue: number;
  /** Mean revenue per completed order, rounded; 0 when no orders. */
  avg: number;
  byService: Record<string, { count: number; revenue: number }>;
}

/** Aggregate revenue from completed orders (pure — unit tested). Null prices count as 0. */
export function summarizeRevenue(
  orders: readonly Pick<Order, 'status' | 'price' | 'service'>[],
): RevenueSummary {
  let completedCount = 0;
  let totalRevenue = 0;
  const byService: Record<string, { count: number; revenue: number }> = {};
  for (const o of orders) {
    if (o.status !== 'completed') {
      continue;
    }
    const price = o.price ?? 0;
    completedCount += 1;
    totalRevenue += price;
    const bucket = (byService[o.service] ??= { count: 0, revenue: 0 });
    bucket.count += 1;
    bucket.revenue += price;
  }
  return {
    completedCount,
    totalRevenue,
    avg: completedCount ? Math.round(totalRevenue / completedCount) : 0,
    byService,
  };
}
