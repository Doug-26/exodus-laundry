import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  nextStatus,
  serviceLabel,
  statusLabel,
  type OrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { OrdersStore } from '../../orders/orders.store';

const STATUS_OPTIONS: OrderStatus[] = [
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
      <h1>Order Queue <span class="count">({{ store.activeCount() }})</span></h1>
      <div class="who">
        <span>{{ auth.profile()?.name }} ({{ auth.role() }})</span>
        <button type="button" (click)="logout()">Sign out</button>
      </div>
    </header>

    @if (created()) {
      <p class="banner banner--ok" role="status">Order {{ created() }} created.</p>
    }

    <div class="toolbar">
      <a class="primary" routerLink="/orders/new">+ New Order</a>
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
        <a routerLink="/team">Team</a>
      }
    </div>

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
                <span class="phone">{{ o.guestContact?.phone }}</span>
              </td>
              <td>{{ serviceLabel(o.service) }}</td>
              <td><span class="status">{{ statusLabel(o.status) }}</span></td>
              <td>{{ o.price !== null ? '₱' + o.price : '—' }}</td>
              <td>{{ age(o) }}</td>
              <td class="action">
                @if (advanceTarget(o); as t) {
                  <button type="button" (click)="advance(o)">→ {{ statusLabel(t) }}</button>
                } @else if (needsPickupChoice(o)) {
                  <button type="button" (click)="choosePickup(o)">Set pickup</button>
                } @else {
                  <span class="done">{{ statusLabel(o.status) }}</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    .bar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #ddd; }
    .count { color: #666; font-weight: 400; }
    .who { display: flex; gap: 0.75rem; align-items: center; }
    .toolbar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; padding: 0.75rem 1rem; }
    .toolbar input, .toolbar select { padding: 0.6rem; font-size: 1rem; }
    .toolbar input { flex: 1 1 16rem; }
    a.primary { background: #0b57d0; color: #fff; padding: 0.6rem 1rem; border-radius: 0.25rem; text-decoration: none; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
    .phone { display: block; color: #666; font-size: 0.85rem; }
    .status { background: #eef; padding: 0.2rem 0.5rem; border-radius: 0.25rem; }
    .action button { padding: 0.55rem 0.9rem; font-size: 1rem; cursor: pointer; }
    .done { color: #666; }
    .empty { padding: 2rem 1rem; color: #666; }
    .banner { margin: 0.75rem 1rem 0; padding: 0.6rem; border-radius: 0.25rem; }
    .banner--ok { background: #e6f4ea; color: #1e7e34; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `,
})
export class QueueComponent {
  protected readonly auth = inject(AuthService);
  protected readonly store = inject(OrdersStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly serviceLabel = serviceLabel;
  protected readonly statusLabel = statusLabel;
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
