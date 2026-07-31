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
            @if (o.source === 'app') {
              <span class="badge badge--app">App</span>
            } @else if (o.customerId !== null) {
              <span class="badge">Linked</span>
            }
          </dd>
          <dt>Service</dt><dd>{{ serviceLabel(o.service) }}</dd>
          <dt>Weight</dt><dd>{{ o.weightKg !== null ? o.weightKg + ' kg' : '—' }}</dd>
          <dt>Price</dt><dd>{{ o.price !== null ? '₱' + o.price : '—' }}</dd>
          <dt>Notes</dt><dd>{{ o.notes || '—' }}</dd>
          <dt>Status</dt><dd><span class="status">{{ statusLabel(o.status) }}</span></dd>
          <dt>Intake</dt>
          <dd>
            @if (o.intakeMethod === 'pickup') {
              Pickup requested — call the customer
            } @else if (o.intakeMethod === 'dropoff') {
              Drop-off (customer brings)
            } @else {
              Walk-in
            }
          </dd>
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

        <h2>Set weight &amp; price</h2>
        <div class="edit">
          <label for="ew">Weight (kg)</label>
          <input id="ew" type="number" step="0.1" [value]="editWeight()" (input)="editWeight.set(val($event))" />
          <label for="ep">Price (₱)</label>
          <input id="ep" type="number" step="1" [value]="editPrice()" (input)="editPrice.set(val($event))" />
          <label for="en">Notes</label>
          <textarea id="en" rows="2" [value]="editNotes()" (input)="editNotes.set(val($event))"></textarea>
          <button type="button" (click)="saveDetails(o.id)" [disabled]="savingDetails()">Save details</button>
          @if (savedDetails()) {
            <span class="saved" role="status">Saved.</span>
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
    .badge--app { background: #e8f0fe; color: #1967d2; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 0.5rem 0; }
    .actions button { padding: 0.65rem 1rem; font-size: 1rem; cursor: pointer; }
    .danger { color: #b3261e; }
    .edit { display: flex; flex-direction: column; gap: 0.35rem; max-width: 16rem; }
    .edit label { font-weight: 600; }
    .edit input, .edit textarea { padding: 0.5rem; font-size: 1rem; }
    .edit button { padding: 0.6rem; font-size: 1rem; cursor: pointer; margin-top: 0.25rem; }
    .saved { color: #1e7e34; }
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

  // Edit fields (raw strings; prefilled once from the order so a live update mid-edit won't wipe typing).
  protected readonly editWeight = signal('');
  protected readonly editPrice = signal('');
  protected readonly editNotes = signal('');
  protected readonly savingDetails = signal(false);
  protected readonly savedDetails = signal(false);
  private editInit = false;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    const unsub = this.store.watch(id, (o) => {
      this.order.set(o);
      this.loading.set(false);
      if (o && !this.editInit) {
        this.editWeight.set(o.weightKg?.toString() ?? '');
        this.editPrice.set(o.price?.toString() ?? '');
        this.editNotes.set(o.notes);
        this.editInit = true;
      }
    });
    this.destroyRef.onDestroy(unsub);
  }

  protected val(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  private parseNum(raw: string): number | null {
    const t = raw.trim();
    if (t === '') {
      return null;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  protected async saveDetails(id: string): Promise<void> {
    this.savingDetails.set(true);
    this.savedDetails.set(false);
    try {
      await this.store.updateDetails(id, {
        weightKg: this.parseNum(this.editWeight()),
        price: this.parseNum(this.editPrice()),
        notes: this.editNotes(),
      });
      this.savedDetails.set(true);
    } finally {
      this.savingDetails.set(false);
    }
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
