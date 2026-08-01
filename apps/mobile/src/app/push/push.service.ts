import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { addFcmToken, removeFcmToken } from '@exodus/shared';
import { FIREBASE } from '../firebase.providers';

/**
 * Registers this device for FCM push and keeps its token on users/{uid}.fcmTokens.
 * Lifecycle mirrors OrdersStore: connect(uid) on login, disconnect() on logout.
 * All native calls are guarded by Capacitor.isNativePlatform() so web/browser dev
 * is a no-op (push is native-only). Tap + foreground handling lives in AppComponent.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly fb = inject(FIREBASE);

  private connectedUid: string | null = null;
  private currentToken: string | null = null;
  private listenersReady = false;

  /** Request permission, register for push, and store the token on the user's profile. */
  async connect(uid: string): Promise<void> {
    if (!Capacitor.isNativePlatform() || this.connectedUid === uid) {
      return;
    }
    this.connectedUid = uid;
    await this.ensureListeners();

    const perm = await PushNotifications.checkPermissions();
    let status = perm.receive;
    if (status === 'prompt' || status === 'prompt-with-rationale') {
      status = (await PushNotifications.requestPermissions()).receive;
    }
    if (status !== 'granted') {
      return;
    }
    // On success the 'registration' listener fires with the device token.
    await PushNotifications.register();
  }

  /** Remove this device's token from the current user's profile (call before sign-out). */
  async disconnect(): Promise<void> {
    const uid = this.connectedUid;
    const token = this.currentToken;
    this.connectedUid = null;
    if (uid && token) {
      await removeFcmToken(this.fb.firestore, uid, token).catch(() => undefined);
    }
  }

  /** Attach the registration listeners once (idempotent across re-logins). */
  private async ensureListeners(): Promise<void> {
    if (this.listenersReady) {
      return;
    }
    this.listenersReady = true;
    await PushNotifications.addListener('registration', (token: Token) => {
      this.currentToken = token.value;
      const uid = this.connectedUid;
      if (uid) {
        void addFcmToken(this.fb.firestore, uid, token.value).catch(() => undefined);
      }
    });
    await PushNotifications.addListener('registrationError', () => {
      // Token registration failed on this device; nothing to persist.
    });
  }
}
