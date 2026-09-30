import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  SHOP_LOCATION,
  decodePolyline,
  statusLabel,
  subscribeRiderLocation,
  type OrderWithId,
  type RiderLocation,
} from '@exodus/shared';
import { environment } from '../../../environments/environment';
import { FIREBASE } from '../../firebase.providers';
import { OrdersStore } from '../../orders/orders.store';

/**
 * Loads the Maps JavaScript API once per page load.
 *
 * The key is baked into the bundle at build time, so it is PUBLIC — it must be
 * the HTTP-referrer-restricted GOOGLE_MAPS_BROWSER_KEY, never the Android key
 * (Google Cloud allows only one restriction type per key).
 */
let mapsLoader: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if (mapsLoader) {
    return mapsLoader;
  }
  mapsLoader = new Promise<void>((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps) {
      resolve();
      return;
    }
    if (!key) {
      reject(new Error('no-key'));
      return;
    }
    // loading=async + a callback is Google's recommended bootstrap; loading the
    // script bare works but logs a performance warning on every page view.
    const callbackName = '__exodusInitGoogleMaps';
    (window as unknown as Record<string, () => void>)[callbackName] = () => resolve();
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error('load-failed'));
    document.head.appendChild(script);
  });
  return mapsLoader;
}

/**
 * Staff view of a delivery: the customer's confirmed destination, the route the
 * startDelivery function already cached on the order, and the rider's live
 * position streamed through Realtime Database.
 *
 * Uses the Maps JavaScript API directly rather than @angular/google-maps: this
 * monorepo pins two Angular majors (mobile 20, dashboard 22), and npm hoists a
 * non-conflicting package like @angular/google-maps to the ROOT, where it binds
 * to the mobile app's Angular 20 and fails to resolve. The raw API has no such
 * coupling, and this page needs only a map, three markers and one polyline.
 */
@Component({
  selector: 'app-delivery',
  imports: [RouterLink],
  template: `
    <main class="delivery">
      <a [routerLink]="['/orders', orderId]">← Order</a>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (order(); as o) {
        <div class="head">
          <h1>{{ o.claimNumber }}</h1>
          <span class="status tone-{{ live() ? 'info' : 'success' }}">
            {{ live() ? 'Rider en route' : statusLabel(o.status) }}
          </span>
        </div>

        <div class="card meta">
          <dl>
            <dt>Customer</dt>
            <dd>{{ o.guestContact?.name }} — {{ o.guestContact?.phone }}</dd>
            <dt>Address note</dt>
            <dd>{{ o.destination?.addressNote || '—' }}</dd>
            <dt>ETA</dt>
            <dd>{{ etaText() }}</dd>
          </dl>
        </div>

        @if (!o.destination) {
          <p class="banner banner--error" role="alert">
            This order has no confirmed delivery pin yet — the customer sets it from the app.
          </p>
        } @else {
          @if (mapsError(); as e) {
            <p class="banner banner--error" role="alert">{{ e }}</p>
          } @else if (!live()) {
            <p class="banner banner--ok" role="status">
              No rider is streaming right now — showing the confirmed destination and planned route.
            </p>
          }
          <!-- Rendered unconditionally so the ElementRef exists when the API finishes loading. -->
          <div #mapEl class="map" role="application" aria-label="Delivery map"></div>
        }
      } @else {
        <p role="alert">Order not found.</p>
      }
    </main>
  `,
  styles: `
    .delivery { max-width: 64rem; margin: var(--space-6) auto; padding: 0 var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .head h1 { margin: 0; }
    .meta dl { display: grid; grid-template-columns: 9rem 1fr; gap: 0.5rem 1rem; margin: 0; }
    .meta dt { font-weight: 600; color: var(--color-muted); }
    .meta dd { margin: 0; }
    .map { width: 100%; height: 30rem; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-bg); }
  `,
})
export class DeliveryComponent {
  private readonly store = inject(OrdersStore);
  private readonly fb = inject(FIREBASE);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusLabel = statusLabel;
  protected readonly orderId = this.route.snapshot.paramMap.get('id') ?? '';

  private readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');

  protected readonly order = signal<OrderWithId | null>(null);
  protected readonly loading = signal(true);
  protected readonly mapsReady = signal(false);
  protected readonly mapsError = signal<string | null>(null);
  private readonly riderLocation = signal<RiderLocation | null>(null);

  private map: google.maps.Map | null = null;
  private riderMarker: google.maps.Marker | null = null;

  /** True while the rider's device is streaming (the node is deleted on completion). */
  protected readonly live = computed(() => this.riderLocation() !== null);

  protected readonly etaText = computed(() => {
    const seconds = this.order()?.routeCache?.etaSeconds;
    if (!seconds) {
      return '—';
    }
    return `${Math.max(1, Math.round(seconds / 60))} min (at dispatch)`;
  });

  constructor() {
    if (!this.orderId) {
      this.loading.set(false);
      return;
    }

    loadGoogleMaps(environment.googleMapsApiKey).then(
      () => this.mapsReady.set(true),
      (err: Error) =>
        this.mapsError.set(
          err.message === 'no-key'
            ? 'No browser Maps key is configured (GOOGLE_MAPS_BROWSER_KEY).'
            : 'The map could not load. Check the key’s HTTP referrer restrictions.',
        ),
    );

    const unsubOrder = this.store.watch(this.orderId, (o) => {
      this.order.set(o);
      this.loading.set(false);
    });
    // Staff read access comes from the `role` custom claim (Phase 14) — see
    // database.rules.json. A stale ID token reads as permission denied.
    const unsubRider = subscribeRiderLocation(this.fb.database, this.orderId, (loc) =>
      this.riderLocation.set(loc),
    );
    this.destroyRef.onDestroy(() => {
      unsubOrder();
      unsubRider();
    });

    // Build the map once the API, the element and the destination all exist.
    effect(() => {
      const el = this.mapEl()?.nativeElement;
      const destination = this.order()?.destination;
      if (!this.mapsReady() || !el || !destination || this.map) {
        return;
      }
      this.buildMap(el, destination.lat, destination.lng);
    });

    // Move the rider marker on every position update.
    effect(() => {
      const pos = this.riderLocation();
      if (!this.map) {
        return;
      }
      if (!pos) {
        this.riderMarker?.setMap(null);
        this.riderMarker = null;
        return;
      }
      const at = { lat: pos.lat, lng: pos.lng };
      if (this.riderMarker) {
        this.riderMarker.setPosition(at);
      } else {
        this.riderMarker = new google.maps.Marker({ position: at, map: this.map, title: 'Rider' });
      }
      this.map.panTo(at);
    });
  }

  private buildMap(el: HTMLDivElement, destLat: number, destLng: number): void {
    const shop = { lat: SHOP_LOCATION.lat, lng: SHOP_LOCATION.lng };
    const destination = { lat: destLat, lng: destLng };

    this.map = new google.maps.Map(el, { center: destination, zoom: 13 });
    new google.maps.Marker({ position: shop, map: this.map, title: 'Shop' });
    new google.maps.Marker({ position: destination, map: this.map, title: 'Destination' });

    // The route was cached by startDelivery — no Routes API call needed here.
    const encoded = this.order()?.routeCache?.encodedPolyline;
    if (encoded) {
      new google.maps.Polyline({
        path: decodePolyline(encoded),
        map: this.map,
        strokeColor: '#0e7490',
        strokeWeight: 5,
        strokeOpacity: 0.9,
      });
    }

    // Frame both ends; the rider effect pans from here once a position arrives.
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(shop);
    bounds.extend(destination);
    this.map.fitBounds(bounds, 48);
  }
}
