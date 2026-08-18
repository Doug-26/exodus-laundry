import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  nextStatus,
  serviceLabel,
  statusLabel,
  statusTone,
  type OrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { OrdersStore } from '../../orders/orders.store';

@Component({
  selector: 'app-order-detail',
  imports: [RouterLink, DatePipe],
  template: `
    <main class="detail-page">
      <a routerLink="/">← Queue</a>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (order(); as o) {
        <div class="head">
          <h1>{{ o.claimNumber }}</h1>
          <span class="status tone-{{ statusTone(o.status) }}">{{ statusLabel(o.status) }}</span>
        </div>

        <div class="three-col">
          <h2>Order details</h2>
          <h2>Set weight &amp; price</h2>
          <h2>Status history</h2>

          <div class="card">
            <dl>
              <dt>Customer</dt>
              <dd>
                {{ o.guestContact?.name }} — {{ o.guestContact?.phone }}
                @if (o.source === 'app') {
                  <span class="badge badge--app">App</span>
                } @else if (o.customerId !== null) {
                  <span class="badge badge--linked">Linked</span>
                } @else {
                  <span class="badge badge--walkin">Walk-in</span>
                }
              </dd>
              <dt>Service</dt><dd>{{ serviceLabel(o.service) }}</dd>
              <dt>Weight</dt><dd>{{ o.weightKg !== null ? o.weightKg + ' kg' : '—' }}</dd>
              <dt>Price</dt><dd>{{ o.price !== null ? '₱' + o.price : '—' }}</dd>
              <dt>Notes</dt><dd>{{ o.notes || '—' }}</dd>
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
                <button type="button" class="btn btn--primary" (click)="advance(o)">Advance → {{ statusLabel(t) }}</button>
              } @else if (needsPickupChoice(o)) {
                <button type="button" class="btn btn--ghost" (click)="setPickup(o)">Set fulfilment: Pickup</button>
              }
              @if (o.active) {
                <button type="button" class="btn btn--danger" (click)="cancel(o)">Cancel order</button>
              }
            </div>
          </div>

          <div class="card edit">
            <label for="ew">Weight (kg)</label>
            <input id="ew" type="number" step="0.1" [value]="editWeight()" (input)="editWeight.set(val($event))" />
            <label for="ep">Price (₱)</label>
            <input id="ep" type="number" step="1" [value]="editPrice()" (input)="editPrice.set(val($event))" />
            <label for="en">Notes</label>
            <textarea id="en" rows="2" [value]="editNotes()" (input)="editNotes.set(val($event))"></textarea>
            <div class="edit__save">
              <button type="button" class="btn btn--primary" (click)="saveDetails(o.id)" [disabled]="savingDetails()">Save details</button>
              @if (savedDetails()) {
                <span class="saved" role="status">Saved.</span>
              }
            </div>
          </div>

          <ol class="card history">
            @for (h of o.statusHistory; track $index) {
              <li>{{ statusLabel(h.status) }} — {{ h.at.toDate() | date: 'MMM d, h:mm a' }}</li>
            }
          </ol>
        </div>
      } @else {
        <p role="alert">Order not found.</p>
      }
    </main>
  `,
  styles: `
    .detail-page { max-width: 78rem; margin: var(--space-6) auto; padding: 0 var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .head h1 { margin: 0; }
    /* Row 1 = headers (auto height), Row 2 = cards (fills remaining). All 3 card tops are guaranteed to align. */
    .three-col { display: grid; grid-template-columns: minmax(0, 1fr) 18rem 21rem; grid-template-rows: auto 1fr; column-gap: var(--space-5); row-gap: var(--space-3); }
    .three-col > h2 { margin: 0; }
    .card { display: flex; flex-direction: column; }
    dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.5rem 1rem; margin: 0; }
    dt { font-weight: 600; color: var(--color-muted); }
    dd { margin: 0; }
    .actions { display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: auto; }
    .edit { display: flex; flex-direction: column; gap: 0.4rem; }
    .edit__save { display: flex; align-items: center; gap: var(--space-3); margin-top: auto; }
    .saved { color: var(--color-success); }
    .history { list-style: decimal inside; color: var(--color-muted); display: flex; flex-direction: column; gap: 0.35rem; align-self: start; margin: 0; }
    .history li { margin: 0; }
    @media (max-width: 900px) {
      .three-col { grid-template-columns: 1fr; grid-template-rows: none; }
      .three-col > h2:nth-child(1) { order: 1; }
      .three-col > .card:nth-child(4) { order: 2; }
      .three-col > h2:nth-child(2) { order: 3; }
      .three-col > .card:nth-child(5) { order: 4; }
      .three-col > h2:nth-child(3) { order: 5; }
      .three-col > .card:nth-child(6) { order: 6; }
      .history { align-self: stretch; }
    }
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
  protected readonly statusTone = statusTone;

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
