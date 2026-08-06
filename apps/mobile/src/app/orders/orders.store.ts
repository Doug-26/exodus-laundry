import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  confirmDelivery,
  createOrder,
  setFulfilment,
  subscribeCustomerOrders,
  subscribeOrder,
  type CreateOrderInput,
  type Destination,
  type OrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

/** Customer-scoped order store (the logged-in customer's own orders). */
@Injectable({ providedIn: 'root' })
export class OrdersStore {
  private readonly fb = inject(FIREBASE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _orders = signal<OrderWithId[]>([]);
  private unsub?: () => void;
  private connectedUid: string | null = null;

  /** The customer's orders, newest first (pending writes with null createdAt float to top). */
  readonly orders = computed<OrderWithId[]>(() =>
    [...this._orders()].sort(
      (a, b) => (b.createdAt?.toMillis() ?? Infinity) - (a.createdAt?.toMillis() ?? Infinity),
    ),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.unsub?.());
  }

  /** Subscribe to a customer's orders. Re-subscribes if the uid changes (multi-user safe). */
  connect(uid: string): void {
    if (this.connectedUid === uid) {
      return;
    }
    this.unsub?.();
    this._orders.set([]);
    this.connectedUid = uid;
    this.unsub = subscribeCustomerOrders(this.fb.firestore, uid, (orders) => this._orders.set(orders));
  }

  /** Clear the subscription + data (call on logout so the next customer starts clean). */
  disconnect(): void {
    this.unsub?.();
    this.unsub = undefined;
    this.connectedUid = null;
    this._orders.set([]);
  }

  watch(id: string, cb: (order: OrderWithId | null) => void): () => void {
    return subscribeOrder(this.fb.firestore, id, cb);
  }

  create(input: CreateOrderInput): Promise<{ id: string; claimNumber: string }> {
    return createOrder(this.fb.firestore, input);
  }

  /** Customer chooses to collect the order at the shop (order stays 'ready'). */
  choosePickup(id: string): Promise<void> {
    return setFulfilment(this.fb.firestore, id, 'pickup');
  }

  /** Customer confirms a delivery pin: writes destination + advances to 'for_delivery'. */
  confirmDelivery(id: string, destination: Destination, currentStatus: OrderStatus): Promise<void> {
    return confirmDelivery(this.fb.firestore, id, destination, currentStatus);
  }
}
