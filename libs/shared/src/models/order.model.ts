import type { Timestamp } from './timestamp.model';

export type OrderStatus =
  | 'requested'
  | 'received'
  | 'washing'
  | 'drying'
  | 'folding'
  | 'ready'
  | 'for_delivery'
  | 'out_for_delivery'
  | 'picked_up'
  | 'completed'
  | 'cancelled';

/** Outbound: how the CLEAN laundry gets back to the customer (chosen after 'ready'). */
export type Fulfilment = 'pickup' | 'delivery' | null;

/**
 * Inbound: how the DIRTY laundry reaches the shop (chosen at app-order creation).
 * 'dropoff' = customer brings it; 'pickup' = shop collects from the customer; null = walk-in/N/A.
 */
export type IntakeMethod = 'dropoff' | 'pickup' | null;

export type OrderSource = 'walk_in' | 'app';

export interface GuestContact {
  name: string;
  /** Canonical format only: +639XXXXXXXXX */
  phone: string;
}

export interface Destination {
  lat: number;
  lng: number;
  addressNote: string;
}

export interface ShopLocation {
  lat: number;
  lng: number;
}

export interface RouteCache {
  encodedPolyline: string;
  etaSeconds: number;
  computedAt: Timestamp;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  /** Client clock (serverTimestamp is not allowed inside array elements). */
  at: Timestamp;
}

export interface Order {
  /** null = guest/walk-in with no app account; set once linked to an app account */
  customerId: string | null;
  /** Contact snapshot captured at intake; always set for source:'walk_in' (guest or linked). May be null for in-app orders (Phase 4). */
  guestContact: GuestContact | null;
  /** userId of staff (walk-in) or customer (in-app) */
  createdBy: string;
  source: OrderSource;
  claimNumber: string;
  status: OrderStatus;
  fulfilment: Fulfilment;
  /** Inbound intake choice for app orders (drop-off vs shop pickup); null for walk-ins. */
  intakeMethod: IntakeMethod;
  service: string;
  loadCount: number | null;
  weightKg: number | null;
  /** ₱ owed; manual entry at MVP, rate-derived in phase 2 */
  price: number | null;
  /** Special instructions captured at intake (separate whites, delicates, …). */
  notes: string;
  /** Set by customer on their own device — never at the counter */
  destination: Destination | null;
  shopLocation: ShopLocation;
  assignedRiderId: string | null;
  routeCache: RouteCache | null;
  /** true while the order is on the active queue; false once completed/cancelled. */
  active: boolean;
  statusHistory: StatusHistoryEntry[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Set when the order reaches 'completed' (Phase 11 revenue reports). Null until then;
   *  absent on orders completed before this field existed. */
  completedAt?: Timestamp | null;
}

/** An Order plus its Firestore document id (Order itself is stored without an id). */
export interface OrderWithId extends Order {
  id: string;
}
