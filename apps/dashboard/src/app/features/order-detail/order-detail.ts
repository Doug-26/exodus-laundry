import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  nextStatus,
  serviceLabel,
  statusLabel,
  type OrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { OrdersStore } from '../../orders/orders.store';

@Component({
  selector: 'app-order-detail',
  imports: [RouterLink, DatePipe],
  template: `
    <main class="detail">
      <a routerLink="/">← Queue</a>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (order(); as o) {
        <h1>{{ o.claimNumber }}</h1>

        <dl>
          <dt>Customer</dt>
          <dd>
            {{ o.guestContact?.name }} — {{ o.guestContact?.phone }}
            @if (o.customerId !== null) {
              <span class="badge">Linked</span>
            }
          </dd>
          <dt>Service</dt><dd>{{ serviceLabel(o.service) }}</dd>
          <dt>Weight</dt><dd>{{ o.weightKg !== null ? o.weightKg + ' kg' : '—' }}</dd>
          <dt>Price</dt><dd>{{ o.price !== null ? '₱' + o.price : '—' }}</dd>
          <dt>Notes</dt><dd>{{ o.notes || '—' }}</dd>
          <dt>Status</dt><dd><span class="status">{{ statusLabel(o.status) }}</span></dd>
          <dt>Fulfilment</dt><dd>{{ o.fulfilment ?? 'not chosen' }}</dd>
        </dl>

        <div class="actions">
          @if (advanceTarget(o); as t) {
            <button type="button" (click)="advance(o)">Advance → {{ statusLabel(t) }}</button>
          } @else if (needsPickupChoice(o)) {
            <button type="button" (click)="setPickup(o)">Set fulfilment: Pickup</button>
          }
          @if (o.active) {
            <button type="button" class="danger" (click)="cancel(o)">Cancel order</button>
          }
        </div>

        <h2>Status history</h2>
        <ol class="history">
          @for (h of o.statusHistory; track $index) {
            <li>{{ statusLabel(h.status) }} — {{ h.at.toDate() | date: 'MMM d, h:mm a' }}</li>
          }
        </ol>
      } @else {
        <p role="alert">Order not found.</p>
      }
    </main>
  `,
  styles: `
    .detail { max-width: 34rem; margin: 1.5rem auto; padding: 0 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
    dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.4rem 1rem; margin: 0; }
    dt { font-weight: 600; }
    dd { margin: 0; }
    .status { background: #eef; padding: 0.2rem 0.5rem; border-radius: 0.25rem; }
    .badge { background: #e6f4ea; color: #1e7e34; font-size: 0.72rem; padding: 0.1rem 0.4rem; border-radius: 0.25rem; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 0.5rem 0; }
    .actions button { padding: 0.65rem 1rem; font-size: 1rem; cursor: pointer; }
    .danger { color: #b3261e; }
    .history { color: #444; }
  `,
})
export class OrderDetailComponent {
  private readonly store = inject(OrdersStore);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly order = signal<OrderWithId | null>(null);
  protected readonly loading = signal(true);
  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    const unsub = this.store.watch(id, (o) => {
      this.order.set(o);
      this.loading.set(false);
    });
    this.destroyRef.onDestroy(unsub);
  }

  protected advanceTarget(o: OrderWithId): OrderStatus | null {
    return nextStatus(o.status, o.fulfilment);
  }

  protected needsPickupChoice(o: OrderWithId): boolean {
    return o.status === 'ready' && o.fulfilment === null;
  }

  protected advance(o: OrderWithId): void {
    void this.store.advance(o);
  }

  protected setPickup(o: OrderWithId): void {
    void this.store.setFulfilment(o.id, 'pickup');
  }

  protected async cancel(o: OrderWithId): Promise<void> {
    if (window.confirm(`Cancel order ${o.claimNumber}?`)) {
      await this.store.cancel(o.id);
    }
  }
}
