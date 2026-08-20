import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ElementRef,
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
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { GoogleMap } from '@capacitor/google-maps';
import { SHOP_LOCATION, type OrderWithId } from '@exodus/shared';
import { environment } from '../../../environments/environment';
import { OrdersStore } from '../../orders/orders.store';

interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Full-screen delivery-address capture (§8). GPS-centred Google Map with a
 * draggable pin + a short note; Confirm writes destination and advances the
 * order to for_delivery. Only reachable while the order is 'ready' & unfulfilled
 * (one-time lock, enforced on load). Native-first: the map needs a device.
 */
@Component({
  selector: 'app-deliver',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonText,
    IonTextarea,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // <capacitor-google-map> is a native custom element
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Delivery address</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding map-content">
      <h2>Is this your delivery address?</h2>
      @if (denied()) {
        <ion-text color="medium">
          <p>We couldn’t get your location — drag the pin to your address.</p>
        </ion-text>
      }

      <div class="map-wrap">
        <capacitor-google-map
          #map
          role="application"
          aria-label="Map for choosing your delivery address. Drag the pin to your location, or use the address note field below."
        ></capacitor-google-map>
      </div>

      @if (mapError()) {
        <ion-text color="danger">
          <p role="alert">The map couldn’t load. Check your connection and try again.</p>
        </ion-text>
      }

      <ion-textarea
        label="Note (gate, floor, landmark)"
        labelPlacement="stacked"
        [autoGrow]="true"
        placeholder="e.g. blue gate, 2nd floor"
        (ionInput)="onNote($event)"
      ></ion-textarea>

      @if (error()) {
        <ion-text color="danger"><p role="alert">{{ error() }}</p></ion-text>
      }

      <ion-button expand="block" [disabled]="busy() || !coord()" (click)="confirm()">
        Confirm delivery here
      </ion-button>
    </ion-content>
  `,
  styles: [
    `
      /* Android transparency fix (§12 #4): the native map renders beneath the
         WebView, so the content + map host must be transparent to see it. */
      .map-content {
        --background: transparent;
      }
      .map-wrap {
        position: relative;
        width: 100%;
        height: 50vh;
        margin: 0.5rem 0 1rem;
      }
      capacitor-google-map {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class DeliverPage implements AfterViewInit {
  private readonly store = inject(OrdersStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('map');

  protected readonly coord = signal<LatLng | null>(null);
  protected readonly denied = signal(false);
  protected readonly mapError = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly note = signal('');
  private readonly order = signal<OrderWithId | null>(null);
  private map?: GoogleMap;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigateByUrl('/home');
      return;
    }
    // Make the WebView stack transparent so the native map shows through (§12 #4).
    document.body.classList.add('map-open');
    // Enforce the one-time lock: only capture while the order is ready & unfulfilled.
    const unsub = this.store.watch(id, (o) => {
      if (!o) {
        return;
      }
      if (o.status !== 'ready' || o.fulfilment !== null) {
        void this.router.navigateByUrl('/orders/' + id);
        return;
      }
      this.order.set(o);
    });
    this.destroyRef.onDestroy(() => {
      unsub();
      void this.map?.destroy();
      document.body.classList.remove('map-open');
    });
  }

  async ngAfterViewInit(): Promise<void> {
    const start = await this.resolveStartCoord();
    this.coord.set(start);
    if (!environment.googleMapsApiKey) {
      this.mapError.set(true);
      return;
    }
    try {
      this.map = await GoogleMap.create({
        id: 'deliver-map',
        element: this.mapEl().nativeElement,
        apiKey: environment.googleMapsApiKey,
        config: { center: start, zoom: 16 },
      });
      await this.map.addMarker({ coordinate: start, draggable: true });
      await this.map.setOnMarkerDragEndListener((e) => {
        this.coord.set({ lat: e.latitude, lng: e.longitude });
      });
    } catch {
      this.mapError.set(true);
    }
  }

  /** GPS if permitted; otherwise fall back to the shop and let the user drag. */
  private async resolveStartCoord(): Promise<LatLng> {
    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await Geolocation.checkPermissions();
        let status = perm.location;
        if (status === 'prompt' || status === 'prompt-with-rationale') {
          status = (await Geolocation.requestPermissions()).location;
        }
        if (status !== 'granted') {
          this.denied.set(true);
          return { ...SHOP_LOCATION };
        }
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      this.denied.set(true);
      return { ...SHOP_LOCATION };
    }
  }

  onNote(event: Event): void {
    const value = (event.target as unknown as { value?: string | null }).value;
    this.note.set(value ?? '');
  }

  async confirm(): Promise<void> {
    const o = this.order();
    const c = this.coord();
    if (!o || !c) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.store.confirmDelivery(
        o.id,
        { lat: c.lat, lng: c.lng, addressNote: this.note().trim() },
        o.status,
      );
      await this.router.navigateByUrl('/orders/' + o.id);
    } catch {
      this.error.set(
        navigator.onLine
          ? 'Could not save your delivery address. Please try again.'
          : 'You appear to be offline — confirming needs a connection.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
