import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  needsPriceBeforeAdvance,
  nextStatus,
  serviceLabel,
  statusLabel,
  statusTone,
  type OrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { OrdersStore } from '../../orders/orders.store';

const STATUS_OPTIONS: OrderStatus[] = [
  'requested',
  'received',
  'washing',
  'drying',
  'folding',
  'ready',
  'picked_up',
  'for_delivery',
  'out_for_delivery',
];

@Component({
  selector: 'app-queue',
  imports: [RouterLink],
  template: `
    <header class="bar">
      <div class="title">
        <span class="brand">Exodus Laundry</span>
        <h1>Order Queue <span class="count">({{ store.activeCount() }})</span></h1>
      </div>
      <div class="who">
        <span>{{ auth.profile()?.name }} ({{ auth.role() }})</span>
        <button type="button" class="btn btn--ghost" (click)="logout()">Sign out</button>
      </div>
    </header>

    <main>
    @if (created()) {
      <p class="banner banner--ok" role="status">Order {{ created() }} created.</p>
    }

    <div class="toolbar">
      <a class="btn btn--primary" routerLink="/orders/new">+ New Order</a>
      <label class="sr-only" for="search">Search</label>
      <input
        id="search"
        type="search"
        placeholder="Search claim #, name, or phone"
        [value]="store.search()"
        (input)="onSearch($event)"
      />
      <label class="sr-only" for="statusFilter">Filter by status</label>
      <select id="statusFilter" [value]="store.statusFilter()" (change)="onFilter($event)">
        <option value="all">All statuses</option>
        @for (s of statusOptions; track s) {
          <option [value]="s">{{ statusLabel(s) }}</option>
        }
      </select>
      @if (auth.role() === 'admin') {
        <a class="btn btn--ghost" routerLink="/reports">Reports</a>
        <a class="btn btn--ghost" routerLink="/rates">Rates</a>
        <a class="btn btn--ghost" routerLink="/team">Team</a>
      }
    </div>

    <div class="content">
      @if (store.orders().length === 0) {
        <p class="empty">No matching active orders.</p>
      } @else {
        <table>
          <caption class="sr-only">Active orders</caption>
          <thead>
            <tr>
              <th scope="col">Claim #</th>
              <th scope="col">Customer</th>
              <th scope="col">Service</th>
              <th scope="col">Status</th>
              <th scope="col">Price</th>
              <th scope="col">Age</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (o of store.orders(); track o.id) {
              <tr>
                <td><a [routerLink]="['/orders', o.id]">{{ o.claimNumber }}</a></td>
                <td>
                  {{ o.guestContact?.name }}
                  @if (o.source === 'app') {
                    <span class="badge badge--app">App</span>
                  } @else if (o.customerId !== null) {
                    <span class="badge badge--linked">Linked</span>
                  } @else {
                    <span class="badge badge--walkin">Walk-in</span>
                  }
                  @if (o.intakeMethod === 'pickup') {
                    <span class="badge badge--pickup">Pickup</span>
                  }
                  <span class="phone">{{ o.guestContact?.phone }}</span>
                </td>
                <td>{{ serviceLabel(o.service) }}</td>
                <td><span class="status tone-{{ statusTone(o.status) }}">{{ statusLabel(o.status) }}</span></td>
                <td>{{ o.price !== null ? '₱' + o.price : '—' }}</td>
                <td>{{ age(o) }}</td>
                <td class="action">
                  @if (advanceTarget(o); as t) {
                    @if (needsPrice(o)) {
                      <a class="btn btn--ghost" [routerLink]="['/orders', o.id]">Set price</a>
                    } @else {
                      <button type="button" class="btn btn--primary" (click)="advance(o)">→ {{ statusLabel(t) }}</button>
                    }
                  } @else if (needsPickupChoice(o)) {
                    <button type="button" class="btn btn--ghost" (click)="choosePickup(o)">Set pickup</button>
                  } @else {
                    <span class="done">{{ statusLabel(o.status) }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
    </main>
  `,
  styles: `
    .bar { display: flex; justify-content: space-between; align-items: center; padding: var(--space-4) var(--space-5); background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
    .title { display: flex; flex-direction: column; gap: 2px; }
    .title h1 { margin: 0; font-size: 1.35rem; }
    .brand { font-size: 0.78rem; font-weight: 800; letter-spacing: -0.01em; color: var(--color-primary); }
    .count { color: var(--color-muted); font-weight: 400; }
    .who { display: flex; gap: var(--space-3); align-items: center; color: var(--color-muted); }
    .toolbar { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; padding: var(--space-4) var(--space-5) 0; }
    .toolbar input { flex: 1 1 16rem; }
    .content { padding: var(--space-4) var(--space-5) var(--space-6); }
    table { width: 100%; border-collapse: collapse; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
    thead th { background: var(--color-bg); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-muted); }
    th, td { text-align: left; padding: 0.7rem var(--space-4); border-bottom: 1px solid var(--color-border); }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--color-bg); }
    .phone { display: block; color: var(--color-muted); font-size: 0.82rem; }
    .action { text-align: right; }
    .done { color: var(--color-muted); }
    .empty { padding: var(--space-8) var(--space-5); color: var(--color-muted); text-align: center; }
    .banner { margin: var(--space-3) var(--space-5) 0; }
  `,
})
export class QueueComponent {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(OrdersStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;
  protected readonly statusTone = statusTone;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly created = signal<string | null>(null);

  constructor() {
    this.store.connect();
    const created = this.route.snapshot.queryParamMap.get('created');
    if (created) {
      this.created.set(created);
      // Strip the param so a refresh doesn't keep the confirmation.
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  protected advanceTarget(o: OrderWithId): OrderStatus | null {
    return nextStatus(o.status, o.fulfilment);
  }

  protected needsPickupChoice(o: OrderWithId): boolean {
    return o.status === 'ready' && o.fulfilment === null;
  }

  /** True when this order can't advance yet because it still needs a price. */
  protected needsPrice(o: OrderWithId): boolean {
    return needsPriceBeforeAdvance(o);
  }

  protected age(o: OrderWithId): string {
    const ms = o.createdAt?.toMillis();
    if (!ms) {
      return 'just now';
    }
    const mins = Math.floor((Date.now() - ms) / 60_000);
    if (mins < 1) {
      return 'just now';
    }
    if (mins < 60) {
      return `${mins}m`;
    }
    const hrs = Math.floor(mins / 60);
    return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
  }

  protected onSearch(event: Event): void {
    this.store.search.set((event.target as HTMLInputElement).value);
  }

  protected onFilter(event: Event): void {
    this.store.statusFilter.set((event.target as HTMLSelectElement).value as OrderStatus | 'all');
  }

  protected advance(o: OrderWithId): void {
    // Receiving a new order → mark received, then jump to its detail so staff
    // can set the price (it can't advance further until they do).
    if (o.status === 'requested') {
      void this.store.advance(o).then(() => this.router.navigate(['/orders', o.id]));
      return;
    }
    void this.store.advance(o);
  }

  protected choosePickup(o: OrderWithId): void {
    void this.store.setFulfilment(o.id, 'pickup');
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
