import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  cancelOrder,
  createOrder,
  lookupCustomerByPhone,
  nextStatus,
  setFulfilment,
  subscribeActiveOrders,
  subscribeOrder,
  updateOrderDetails,
  updateOrderStatus,
  type CreateOrderInput,
  type Fulfilment,
  type Order,
  type OrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

@Injectable({ providedIn: 'root' })
export class OrdersStore {
  private readonly fb = inject(FIREBASE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _orders = signal<OrderWithId[]>([]);
  readonly search = signal('');
  readonly statusFilter = signal<OrderStatus | 'all'>('all');

  private unsub?: () => void;
  private connected = false;

  /** Active orders, oldest first (pending writes have null createdAt → treated as newest). */
  readonly orders = computed<OrderWithId[]>(() => {
    const sorted = [...this._orders()].sort(
      (a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity),
    );
    const status = this.statusFilter();
    const term = this.search().trim().toLowerCase();
    return sorted.filter((o) => {
      if (status !== 'all' && o.status !== status) {
        return false;
      }
      if (!term) {
        return true;
      }
      const haystack = `${o.claimNumber} ${o.guestContact?.name ?? ''} ${o.guestContact?.phone ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  });

  readonly activeCount = computed(() => this._orders().length);

  /** Opens the live queue subscription once; disposed when the app shuts down. */
  connect(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;
    this.unsub = subscribeActiveOrders(this.fb.firestore, (orders) => this._orders.set(orders));
    this.destroyRef.onDestroy(() => this.unsub?.());
  }

  /** Live subscription to a single order (for the detail screen). Returns an unsubscribe. */
  watch(id: string, cb: (order: OrderWithId | null) => void): () => void {
    return subscribeOrder(this.fb.firestore, id, cb);
  }

  /** Look up a customer account by phone (name only; customer-role accounts only). */
  lookupCustomer(phoneRaw: string): Promise<{ uid: string; name: string } | null> {
    return lookupCustomerByPhone(this.fb.firestore, phoneRaw);
  }

  create(input: CreateOrderInput): Promise<{ id: string; claimNumber: string }> {
    return createOrder(this.fb.firestore, input);
  }

  advance(order: OrderWithId): Promise<void> {
    const target = nextStatus(order.status, order.fulfilment);
    return target ? updateOrderStatus(this.fb.firestore, order.id, target, order) : Promise.resolve();
  }

  setFulfilment(id: string, fulfilment: Fulfilment): Promise<void> {
    return setFulfilment(this.fb.firestore, id, fulfilment);
  }

  updateDetails(
    id: string,
    patch: Partial<Pick<Order, 'weightKg' | 'price' | 'notes' | 'loadCount'>>,
  ): Promise<void> {
    return updateOrderDetails(this.fb.firestore, id, patch);
  }

  cancel(id: string): Promise<void> {
    return cancelOrder(this.fb.firestore, id);
  }
}
