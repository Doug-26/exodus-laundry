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
  IonButton,
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
import { checkmarkDoneOutline, navigateOutline, playOutline } from 'ionicons/icons';
import { GoogleMap } from '@capacitor/google-maps';
import { decodePolyline, statusLabel, type OrderWithId } from '@exodus/shared';
import { environment } from '../../../environments/environment';
import { RiderOrdersStore } from '../../orders/rider-orders.store';

/**
 * Rider delivery map (§9). Shows shop + destination markers and — once the route
 * is computed by the startDelivery Cloud Function — the drawn polyline + ETA.
 * Start delivery / Navigate (handoff) / Mark delivered. Reuses the Phase 6
 * deliver-page map scaffold (transparency fix, GoogleMap lifecycle).
 */
@Component({
  selector: 'app-rider-delivery',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
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
          <ion-back-button defaultHref="/rider"></ion-back-button>
        </ion-buttons>
        <ion-title>Delivery</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding map-content">
      <div class="head">
        <h1>{{ order()?.claimNumber ?? 'Delivery' }}</h1>
        @if (etaText(); as eta) {
          <span class="eta">{{ eta }}</span>
        }
      </div>
      @if (order()?.destination?.addressNote; as note) {
        <p class="addr"><ion-icon name="navigate-outline"></ion-icon> {{ note }}</p>
      }

      <!-- Always in the DOM so viewChild('map') resolves before the order loads. -->
      <div class="map-wrap"><capacitor-google-map #map></capacitor-google-map></div>

      @if (mapError()) {
        <ion-text color="danger"><p role="alert">The map couldn’t load. Check your connection.</p></ion-text>
      }
      @if (error()) {
        <ion-text color="danger"><p role="alert">{{ error() }}</p></ion-text>
      }

      @if (order(); as o) {
        @if (o.status === 'for_delivery') {
          <ion-button expand="block" [disabled]="busy()" (click)="start()">
            <ion-icon name="play-outline" slot="start"></ion-icon>
            Start delivery
          </ion-button>
        } @else if (o.status === 'out_for_delivery') {
          <ion-button expand="block" (click)="navigate()">
            <ion-icon name="navigate-outline" slot="start"></ion-icon>
            Navigate
          </ion-button>
          <ion-button expand="block" fill="outline" color="success" [disabled]="busy()" (click)="markDelivered()">
            <ion-icon name="checkmark-done-outline" slot="start"></ion-icon>
            Mark delivered
          </ion-button>
        } @else {
          <p class="done-note">This delivery is {{ statusLabel(o.status) }}.</p>
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
      .addr {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--ion-color-medium);
        margin: 4px 0 0;
      }
      .addr ion-icon {
        color: var(--ion-color-primary);
      }
      .loading {
        display: flex;
        justify-content: center;
        padding: var(--app-space-7) 0;
      }
      .done-note {
        color: var(--ion-color-medium);
      }
      ion-button {
        margin-top: var(--app-space-2);
      }
    `,
  ],
})
export class RiderDeliveryPage implements AfterViewInit {
  private readonly store = inject(RiderOrdersStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('map');

  protected readonly order = signal<OrderWithId | null>(null);
  protected readonly loading = signal(true);
  protected readonly mapError = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly statusLabel = statusLabel;

  protected readonly etaText = computed(() => {
    const s = this.order()?.routeCache?.etaSeconds;
    return s ? `~${Math.max(1, Math.round(s / 60))} min` : null;
  });

  private map?: GoogleMap;
  private markersAdded = false;
  private drawnRouteFor: string | null = null;

  constructor() {
    addIcons({ checkmarkDoneOutline, navigateOutline, playOutline });
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigateByUrl('/rider');
      return;
    }
    document.body.classList.add('map-open');
    const unsub = this.store.watch(id, (o) => {
      this.order.set(o);
      this.loading.set(false);
      void this.syncMap();
    });
    this.destroyRef.onDestroy(() => {
      unsub();
      void this.map?.destroy();
      document.body.classList.remove('map-open');
    });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.createMap();
    await this.syncMap();
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
        id: 'rider-map',
        element: this.mapEl().nativeElement,
        apiKey: environment.googleMapsApiKey,
        config: { center: { lat: center.lat, lng: center.lng }, zoom: 13 },
      });
    } catch {
      this.mapError.set(true);
    }
  }

  /** Draw the shop/destination markers + route once map + order are both ready (idempotent). */
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
      });
      await this.map.addMarker({
        coordinate: { lat: o.destination.lat, lng: o.destination.lng },
        title: 'Customer',
      });
      // Frame both points.
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

  async start(): Promise<void> {
    const o = this.order();
    if (!o) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      // The Cloud Function computes the route + flips status; the live snapshot
      // then updates the order and syncMap() draws the polyline.
      await this.store.startDelivery(o.id);
    } catch {
      this.error.set('Could not start the delivery. It may have just been taken — go back and refresh.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Hand off to Google Maps for turn-by-turn (opens the external app). */
  navigate(): void {
    const d = this.order()?.destination;
    if (!d) {
      return;
    }
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}&travelmode=driving`,
      '_system',
    );
  }

  async markDelivered(): Promise<void> {
    const o = this.order();
    if (!o) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.store.markDelivered(o);
      await this.router.navigateByUrl('/rider');
    } catch {
      this.error.set('Could not mark delivered. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
