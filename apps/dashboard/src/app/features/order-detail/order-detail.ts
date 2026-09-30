import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  needsPriceBeforeAdvance,
  nextStatus,
  serviceLabel,
  statusLabel,
  statusTone,
  type OrderStatus,
  type OrderWithId,
} from '@exodus/shared';
import { OrdersStore } from '../../orders/orders.store';
import { RatesStore } from '../../rates/rates.store';

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
                <button type="button" class="btn btn--primary" (click)="advance(o)" [disabled]="needsPrice(o)">Advance → {{ statusLabel(t) }}</button>
              } @else if (needsPickupChoice(o)) {
                <button type="button" class="btn btn--ghost" (click)="setPickup(o)">Set fulfilment: Pickup</button>
              }
              @if (o.active) {
                <button type="button" class="btn btn--danger" (click)="cancel(o)">Cancel order</button>
              }
            </div>
            @if (needsPrice(o)) {
              <p class="need-price" role="status">Set a price and save before advancing this order.</p>
            }
          </div>

          <div class="card edit">
            <label for="ew">Weight (kg)</label>
            <input id="ew" type="number" step="0.1" [value]="editWeight()" (input)="editWeight.set(val($event))" />
            <label for="ep">Price (₱)</label>
            <input id="ep" type="number" step="1" [value]="editPrice()" (input)="editPrice.set(val($event)); priceEdited.set(true)" />
            @if (!priceEdited() && suggestedPrice() !== null) {
              <p class="hint">Auto-filled from rate — adjust if needed.</p>
            }
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

        <h2 class="proof__title">Proof photos</h2>
        <div class="card proof">
          <p class="hint">
            The customer sees these on their order as soon as you add them.
          </p>

          @if (photoError(); as e) {
            <p class="banner banner--error" role="alert">{{ e }}</p>
          }

          <div class="proof__grid">
            @for (url of o.proofPhotos ?? []; track url) {
              <figure class="proof__item">
                <a [href]="url" target="_blank" rel="noopener">
                  <img [src]="url" alt="Proof photo for order {{ o.claimNumber }}" loading="lazy" />
                </a>
                <button
                  type="button"
                  class="btn btn--danger"
                  (click)="removePhoto(o.id, url)"
                  [disabled]="photoBusy()"
                >
                  Remove
                </button>
              </figure>
            } @empty {
              <p class="empty">No photos yet.</p>
            }
          </div>

          <div class="proof__add">
            <label class="btn btn--ghost" for="proofInput">+ Add photos</label>
            <input
              id="proofInput"
              type="file"
              accept="image/*"
              multiple
              hidden
              (change)="onProofFiles(o.id, $event)"
            />
            @if (photoBusy()) {
              <span class="hint" role="status">Uploading…</span>
            }
          </div>
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
    .hint { color: var(--color-muted); font-size: 0.85rem; margin: 0; }
    .need-price { color: var(--color-danger); font-size: 0.85rem; margin: 0.25rem 0 0; }
    .history { list-style: decimal inside; color: var(--color-muted); display: flex; flex-direction: column; gap: 0.35rem; align-self: start; margin: 0; }
    .history li { margin: 0; }
    .proof__title { margin: var(--space-3) 0 0; }
    .proof { gap: var(--space-3); }
    .proof__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: var(--space-3); }
    .proof__item { margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .proof__item img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--color-border); display: block; }
    .proof__add { display: flex; align-items: center; gap: var(--space-3); }
    .empty { color: var(--color-muted); margin: 0; }
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
  private readonly rates = inject(RatesStore);
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
  protected readonly photoBusy = signal(false);
  protected readonly photoError = signal<string | null>(null);
  private editInit = false;

  /** True once the price is set (existing or hand-typed) — stops auto-fill overwriting it. */
  protected readonly priceEdited = signal(false);
  /** Suggested price from the order's service rate + the entered weight. */
  protected readonly suggestedPrice = computed(() => {
    const o = this.order();
    return o ? this.rates.suggest(o.service, this.parseNum(this.editWeight())) : null;
  });

  constructor() {
    this.rates.connect();
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
        // An order that already has a price is treated as set — never auto-overwrite it.
        this.priceEdited.set(o.price !== null);
        this.editInit = true;
      }
    });
    this.destroyRef.onDestroy(unsub);

    // Auto-fill price from the rate when weight changes on an unpriced order.
    effect(() => {
      const suggestion = this.suggestedPrice();
      untracked(() => {
        if (suggestion !== null && !this.priceEdited()) {
          const next = String(suggestion);
          if (this.editPrice() !== next) {
            this.editPrice.set(next);
          }
        }
      });
    });
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

  /** True when the order can't advance yet because it still needs a price. */
  protected needsPrice(o: OrderWithId): boolean {
    return needsPriceBeforeAdvance(o);
  }

  protected advance(o: OrderWithId): void {
    if (this.needsPrice(o)) {
      return;
    }
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

  /** Downscale + re-encode before upload: phone photos routinely exceed the 5MB rule cap. */
  private async downscale(file: File, max = 1280): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas unavailable');
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))),
        'image/jpeg',
        0.8,
      ),
    );
  }

  protected async onProofFiles(orderId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // let the same file be re-picked after a failure
    if (files.length === 0) {
      return;
    }
    this.photoError.set(null);
    this.photoBusy.set(true);
    try {
      for (const file of files) {
        await this.store.addProofPhoto(orderId, await this.downscale(file));
      }
    } catch {
      // Most likely cause: the role claim is missing from this session's token.
      this.photoError.set(
        'Could not upload. If you were just given staff access, sign out and back in, then retry.',
      );
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected async removePhoto(orderId: string, url: string): Promise<void> {
    this.photoError.set(null);
    this.photoBusy.set(true);
    try {
      await this.store.removeProofPhoto(orderId, url);
    } catch {
      this.photoError.set('Could not remove that photo. Please try again.');
    } finally {
      this.photoBusy.set(false);
    }
  }
}
