import { Injectable, inject, signal } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import {
  seedDeliveryMeta,
  writeRiderLocation,
  clearDelivery,
  type RiderLocation,
} from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

// Types mirror @capacitor-community/background-geolocation's definitions (only what we use).
interface BgLocation {
  latitude: number;
  longitude: number;
  bearing: number | null;
  time: number | null;
}
interface BgWatcherOptions {
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
}
interface BackgroundGeolocationPlugin {
  addWatcher(
    options: BgWatcherOptions,
    callback: (position?: BgLocation, error?: { code?: string; message: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/**
 * Streams the rider's GPS to Realtime Database while a delivery is out (§9, Phase 8).
 *
 * Uses a foreground-service watcher so updates continue while the rider drives with
 * Google Maps in the foreground / screen off. The watcher is throttled by
 * `distanceFilter` (metres) to keep battery + RTDB write volume down. The delivery
 * node is deleted on completion (DPA cleanup).
 */
@Injectable({ providedIn: 'root' })
export class RiderTrackingService {
  private readonly fb = inject(FIREBASE);

  /** The order currently being tracked, guarding against double-start. */
  private trackingOrderId: string | null = null;
  private watcherId: string | null = null;

  /**
   * True when the OS denied location while trying to stream — the rider thinks
   * they're sharing but they aren't. The delivery page surfaces this + an
   * "Open settings" prompt. Cleared once a fix arrives.
   */
  readonly permissionDenied = signal(false);

  /** True while a watcher is streaming for the given order. */
  isTracking(orderId: string): boolean {
    return this.trackingOrderId === orderId && this.watcherId !== null;
  }

  /** Open the OS app-settings so the rider can grant "Allow all the time". */
  openSettings(): Promise<void> {
    return BackgroundGeolocation.openSettings();
  }

  /**
   * Start streaming the rider's position for an order. Idempotent per order —
   * a repeat call for the same order is a no-op; starting a different order
   * stops the previous watcher first (without clearing its node).
   */
  async start(orderId: string, riderId: string, customerId: string): Promise<void> {
    if (this.trackingOrderId === orderId && this.watcherId !== null) {
      return;
    }
    if (this.watcherId !== null) {
      await this.stop(this.trackingOrderId, { clear: false });
    }
    this.trackingOrderId = orderId;
    this.permissionDenied.set(false);

    // Seed the meta node the RTDB rules key off before any location is written.
    await seedDeliveryMeta(this.fb.database, orderId, { riderId, customerId });

    this.watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'Exodus delivery in progress',
        backgroundMessage: 'Sharing your location with the customer',
        requestPermissions: true,
        stale: false,
        distanceFilter: 20,
      },
      (position, error) => {
        if (error) {
          // NOT_AUTHORIZED = the rider denied (background) location. Surface it so
          // they don't believe they're sharing when they aren't.
          if (error.code === 'NOT_AUTHORIZED') {
            this.permissionDenied.set(true);
          }
          return;
        }
        if (!position) {
          return;
        }
        // Ignore late callbacks after the watcher was torn down.
        if (this.trackingOrderId !== orderId) {
          return;
        }
        // A fix arrived → permission is fine; clear any stale denial flag.
        this.permissionDenied.set(false);
        const loc: RiderLocation = {
          lat: position.latitude,
          lng: position.longitude,
          heading: position.bearing ?? 0,
          timestamp: position.time ?? Date.now(),
        };
        void writeRiderLocation(this.fb.database, orderId, loc);
      },
    );
  }

  /**
   * Stop the active watcher. Pass `clear: true` on delivery completion to also
   * delete the RTDB node; `clear: false` (e.g. leaving the page mid-delivery)
   * keeps the last known position so the customer still sees it.
   */
  async stop(orderId: string | null, opts: { clear: boolean }): Promise<void> {
    const id = orderId ?? this.trackingOrderId;
    if (this.watcherId !== null) {
      await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
      this.watcherId = null;
    }
    this.trackingOrderId = null;
    if (opts.clear && id) {
      await clearDelivery(this.fb.database, id);
    }
  }
}
