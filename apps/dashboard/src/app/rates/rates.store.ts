import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { computePrice, subscribeRates, upsertRate, type Rate } from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

/** Dashboard rate list (Phase 10). Live for auto-compute at intake + the manage screen. */
@Injectable({ providedIn: 'root' })
export class RatesStore {
  private readonly fb = inject(FIREBASE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _rates = signal<Rate[]>([]);
  private unsub?: () => void;
  private connected = false;

  /** All rates by service id, for quick lookup. */
  readonly byService = computed<Record<string, Rate>>(() => {
    const map: Record<string, Rate> = {};
    for (const r of this._rates()) {
      map[r.service] = r;
    }
    return map;
  });

  /** Open the live rates subscription once. Safe to call repeatedly. */
  connect(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;
    this.unsub = subscribeRates(this.fb.firestore, (rates) => this._rates.set(rates));
    this.destroyRef.onDestroy(() => this.unsub?.());
  }

  /** Suggested price for a service + weight, or null if no active rate applies. */
  suggest(service: string, weightKg: number | null): number | null {
    return computePrice(this.byService()[service] ?? null, weightKg);
  }

  save(rate: Rate): Promise<void> {
    return upsertRate(this.fb.firestore, rate);
  }
}
