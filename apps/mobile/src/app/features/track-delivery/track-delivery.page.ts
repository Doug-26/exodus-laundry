import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, locationOutline, navigateOutline } from 'ionicons/icons';
import { GoogleMap } from '@capacitor/google-maps';
import {
  decodePolyline,
  subscribeRiderLocation,
  type OrderWithId,
  type RiderLocation,
} from '@exodus/shared';
import { environment } from '../../../environments/environment';
import { OrdersStore } from '../../orders/orders.store';
import { markerIcon } from '../../tracking/marker-icon';
import { FIREBASE } from '../../firebase.providers';

/**
 * Customer live-tracking map (§9, Phase 8). Shows the shop + destination markers,
 * the cached route polyline + ETA, and the rider's marker moving in real time
 * (streamed to Realtime Database by the rider's device). Reuses the rider-delivery
 * map scaffold (transparency fix, GoogleMap lifecycle).
 */
@Component({
  selector: 'app-track-delivery',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonText,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // <capacitor-google-map> native custom element
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="backHref()"></ion-back-button>
        </ion-buttons>
        <ion-title>Track delivery</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding map-content">
      <div class="head">
        <h1>{{ order()?.claimNumber ?? 'Delivery' }}</h1>
        @if (etaText(); as eta) {
          <span class="eta">{{ eta }}</span>
        }
      </div>

      <!-- Always in the DOM so viewChild('map') resolves before the order loads. -->
      <div class="map-wrap"><capacitor-google-map #map></capacitor-google-map></div>

      @if (mapError()) {
        <ion-text color="danger"><p role="alert">The map couldn’t load. Check your connection.</p></ion-text>
      }

      @if (order(); as o) {
        @if (o.status === 'out_for_delivery') {
          @if (riderLocation()) {
            <p class="status-note on-the-way">
              <ion-icon name="navigate-outline"></ion-icon> Your rider is on the way.
            </p>
          } @else {
            <p class="status-note">
              <ion-icon name="location-outline"></ion-icon> Waiting for the rider to start moving…
            </p>
          }
        } @else if (o.status === 'completed') {
          <p class="status-note done">
            <ion-icon name="checkmark-done-outline"></ion-icon> Delivered — thanks!
          </p>
        } @else {
          <p class="status-note">This order isn’t out for delivery yet.</p>
        }
      } @else if (loading()) {
        <div class="loading"><ion-spinner name="crescent"></ion-spinner></div>
      }
    </ion-content>
  `,
  styles: [
    `
      /* Android transparency fix (§12 #4) — see also global body.map-open. */
      .map-content {
        --background: transparent;
      }
      .map-wrap {
        position: relative;
        width: 100%;
        height: 45vh;
        margin: 0.5rem 0 1rem;
      }
      capacitor-google-map {
        display: block;
        width: 100%;
        height: 100%;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--app-space-3);
        margin-top: var(--app-space-2);
      }
      .head h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
      }
      .eta {
        font-weight: 700;
        color: var(--ion-color-primary);
        background: rgba(var(--ion-color-secondary-rgb), 0.16);
        padding: 4px 12px;
        border-radius: 999px;
        white-space: nowrap;
      }
      .status-note {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--ion-color-medium);
        margin: 4px 0 0;
      }
      .status-note ion-icon {
        color: var(--ion-color-primary);
        font-size: 1.15rem;
      }
      .status-note.on-the-way {
        color: var(--ion-color-primary);
        font-weight: 600;
      }
      .status-note.done {
        color: var(--ion-color-success);
        font-weight: 600;
      }
      .status-note.done ion-icon {
        color: var(--ion-color-success);
      }
      .loading {
        display: flex;
        justify-content: center;
        padding: var(--app-space-7) 0;
      }
    `,
  ],
})
export class TrackDeliveryPage implements AfterViewInit {
  private readonly store = inject(OrdersStore);
  private readonly fb = inject(FIREBASE);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('map');

  protected readonly order = signal<OrderWithId | null>(null);
  protected readonly riderLocation = signal<RiderLocation | null>(null);
  protected readonly loading = signal(true);
  protected readonly mapError = signal(false);

  private readonly orderId = this.route.snapshot.paramMap.get('id');

  protected readonly backHref = computed(() =>
    this.orderId ? `/orders/${this.orderId}` : '/home',
  );

  protected readonly etaText = computed(() => {
    const s = this.order()?.routeCache?.etaSeconds;
    return s ? `~${Math.max(1, Math.round(s / 60))} min` : null;
  });

  private map?: GoogleMap;
  private markersAdded = false;
  private drawnRouteFor: string | null = null;
  private riderMarkerId: string | null = null;

  constructor() {
    addIcons({ checkmarkDoneOutline, locationOutline, navigateOutline });
    if (!this.orderId) {
      void this.router.navigateByUrl('/home');
      return;
    }
    document.body.classList.add('map-open');

    const unsubOrder = this.store.watch(this.orderId, (o) => {
      this.order.set(o);
      this.loading.set(false);
      void this.syncMap();
    });
    const unsubRider = subscribeRiderLocation(this.fb.database, this.orderId, (loc) => {
      this.riderLocation.set(loc);
      void this.syncRiderMarker();
    });

    this.destroyRef.onDestroy(() => {
      unsubOrder();
      unsubRider();
      void this.map?.destroy();
      document.body.classList.remove('map-open');
    });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.createMap();
    await this.syncMap();
    await this.syncRiderMarker();
  }

  private async createMap(): Promise<void> {
    if (this.map) {
      return;
    }
    if (!environment.googleMapsApiKey) {
      this.mapError.set(true);
      return;
    }
    const o = this.order();
    const center = o?.destination ?? o?.shopLocation ?? { lat: 13.6218, lng: 123.1948 };
    try {
      this.map = await GoogleMap.create({
        id: 'track-map',
        element: this.mapEl().nativeElement,
        apiKey: environment.googleMapsApiKey,
        config: { center: { lat: center.lat, lng: center.lng }, zoom: 13 },
      });
    } catch {
      this.mapError.set(true);
    }
  }

  /** Draw the shop/destination markers + cached route once map + order are ready (idempotent). */
  private async syncMap(): Promise<void> {
    const o = this.order();
    if (!this.map || !o) {
      return;
    }
    if (!this.markersAdded && o.shopLocation && o.destination) {
      this.markersAdded = true;
      await this.map.addMarker({
        coordinate: { lat: o.shopLocation.lat, lng: o.shopLocation.lng },
        title: 'Shop',
        ...markerIcon('shop'),
      });
      await this.map.addMarker({
        coordinate: { lat: o.destination.lat, lng: o.destination.lng },
        title: 'Destination',
        ...markerIcon('destination'),
      });
      const mid = {
        lat: (o.shopLocation.lat + o.destination.lat) / 2,
        lng: (o.shopLocation.lng + o.destination.lng) / 2,
      };
      await this.map.setCamera({ coordinate: mid, zoom: 12, animate: true });
    }
    const encoded = o.routeCache?.encodedPolyline;
    if (encoded && this.drawnRouteFor !== encoded) {
      this.drawnRouteFor = encoded;
      await this.map.addPolylines([
        { path: decodePolyline(encoded), strokeColor: '#0e7490', strokeWeight: 6 },
      ]);
    }
  }

  /** Move the rider marker to the latest streamed position (remove + re-add — no in-place move). */
  private async syncRiderMarker(): Promise<void> {
    const loc = this.riderLocation();
    if (!this.map || !loc) {
      return;
    }
    if (this.riderMarkerId !== null) {
      await this.map.removeMarker(this.riderMarkerId);
      this.riderMarkerId = null;
    }
    this.riderMarkerId = await this.map.addMarker({
      coordinate: { lat: loc.lat, lng: loc.lng },
      title: 'Rider',
      snippet: 'On the way',
      ...markerIcon('rider'),
    });
  }
}
