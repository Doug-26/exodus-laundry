import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  subscribeOrder,
  subscribeRiderOrders,
  updateOrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

const byNewest = (a: OrderWithId, b: OrderWithId): number =>
  (b.createdAt?.toMillis() ?? Infinity) - (a.createdAt?.toMillis() ?? Infinity);

/** Rider-scoped store: deliveries available to claim + the ones this rider is on. */
@Injectable({ providedIn: 'root' })
export class RiderOrdersStore {
  private readonly fb = inject(FIREBASE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _orders = signal<OrderWithId[]>([]);
  private readonly _uid = signal<string | null>(null);
  private unsub?: () => void;

  /** Orders waiting to be claimed (any rider can take them). */
  readonly available = computed<OrderWithId[]>(() =>
    this._orders()
      .filter((o) => o.status === 'for_delivery')
      .sort(byNewest),
  );

  /** Deliveries this rider is currently out on. */
  readonly mine = computed<OrderWithId[]>(() =>
    this._orders()
      .filter((o) => o.status === 'out_for_delivery' && o.assignedRiderId === this._uid())
      .sort(byNewest),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.unsub?.());
  }

  /** Subscribe to the delivery board (for_delivery + out_for_delivery). */
  connect(uid: string): void {
    if (this._uid() === uid) {
      return;
    }
    this.unsub?.();
    this._orders.set([]);
    this._uid.set(uid);
    this.unsub = subscribeRiderOrders(this.fb.firestore, (orders) => this._orders.set(orders));
  }

  disconnect(): void {
    this.unsub?.();
    this.unsub = undefined;
    this._uid.set(null);
    this._orders.set([]);
  }

  watch(id: string, cb: (order: OrderWithId | null) => void): () => void {
    return subscribeOrder(this.fb.firestore, id, cb);
  }

  /** Claim + compute the route via the Cloud Function (server-side Routes call). */
  async startDelivery(orderId: string): Promise<void> {
    const fn = httpsCallable(getFunctions(this.fb.app, 'us-central1'), 'startDelivery');
    await fn({ orderId });
  }

  /** Mark an out-for-delivery order completed. */
  markDelivered(o: OrderWithId): Promise<void> {
    return updateOrderStatus(this.fb.firestore, o.id, 'completed', o);
  }
}
