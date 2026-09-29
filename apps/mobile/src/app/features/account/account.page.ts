import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  IonAvatar,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline, imageOutline, logOutOutline } from 'ionicons/icons';
import { updateUserProfile, uploadAvatar } from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { FIREBASE } from '../../firebase.providers';

const DEFAULT_AVATAR = 'assets/logo/avatar-default.svg';

@Component({
  selector: 'app-account',
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonAvatar,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonInput,
    IonNote,
    IonText,
    IonSpinner,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Account</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="avatar-block">
        <ion-avatar class="avatar">
          <img [src]="avatarSrc()" alt="" />
        </ion-avatar>

        @if (uploading()) {
          <p class="uploading"><ion-spinner name="dots"></ion-spinner> Uploading…</p>
        } @else {
          <div class="avatar-actions">
            <ion-button size="small" fill="outline" (click)="pickPhoto('camera')" [disabled]="busy()">
              <ion-icon name="camera-outline" slot="start"></ion-icon>
              Take photo
            </ion-button>
            <ion-button size="small" fill="outline" (click)="pickPhoto('gallery')" [disabled]="busy()">
              <ion-icon name="image-outline" slot="start"></ion-icon>
              Upload
            </ion-button>
          </div>
        }
      </div>

      @if (error(); as e) {
        <ion-text color="danger"><p role="alert">{{ e }}</p></ion-text>
      }
      @if (saved()) {
        <ion-text color="success"><p role="status">Saved.</p></ion-text>
      }

      <form [formGroup]="form" (ngSubmit)="save()">
        <ion-list>
          <ion-item>
            <ion-input
              label="Name"
              labelPlacement="stacked"
              formControlName="name"
              autocomplete="name"
            ></ion-input>
          </ion-item>
          @if (nameInvalid()) {
            <ion-note color="danger" role="alert">Enter your name.</ion-note>
          }

          <ion-item>
            <ion-input
              label="Mobile number"
              labelPlacement="stacked"
              [value]="auth.profile()?.phone ?? ''"
              readonly
            ></ion-input>
          </ion-item>
          <ion-note class="phone-note">
            Your mobile number identifies your orders and can't be changed here — ask the shop if it
            needs correcting.
          </ion-note>
        </ion-list>

        <ion-button expand="block" type="submit" [disabled]="busy()">Save changes</ion-button>
      </form>

      <ion-button expand="block" fill="clear" color="medium" (click)="logout()" [disabled]="busy()">
        <ion-icon name="log-out-outline" slot="start"></ion-icon>
        Sign out
      </ion-button>
    </ion-content>
  `,
  styles: [
    `
      .avatar-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--app-space-3);
        margin: var(--app-space-4) 0 var(--app-space-5);
      }
      .avatar {
        width: 104px;
        height: 104px;
      }
      .avatar-actions {
        display: flex;
        gap: var(--app-space-2);
      }
      .uploading {
        display: flex;
        align-items: center;
        gap: var(--app-space-2);
        margin: 0;
        color: var(--ion-color-medium);
      }
      .phone-note {
        display: block;
        padding: var(--app-space-2) var(--app-space-4) 0;
        font-size: 0.8rem;
      }
    `,
  ],
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(FIREBASE);
  private readonly builder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly form = this.builder.group({
    name: this.builder.control(this.auth.profile()?.name ?? '', [Validators.required]),
  });

  protected readonly avatarSrc = computed(() => this.auth.profile()?.photoUrl ?? DEFAULT_AVATAR);

  constructor() {
    addIcons({ cameraOutline, imageOutline, logOutOutline });
  }

  protected nameInvalid(): boolean {
    const c = this.form.controls.name;
    return c.invalid && c.touched;
  }

  /**
   * Capture or pick an avatar, upload it, then record the URL.
   *
   * The plugin resizes to 512px before it hands the image over, so a 4MB phone
   * photo never reaches Storage. Its web implementation covers `ng serve`, so
   * this deliberately has no isNativePlatform() guard.
   */
  protected async pickPhoto(from: 'camera' | 'gallery'): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) {
      return;
    }
    this.error.set(null);
    this.saved.set(false);
    this.uploading.set(true);
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: from === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        quality: 80,
        width: 512,
        height: 512,
        correctOrientation: true,
      });
      if (!photo.webPath) {
        throw new Error('No image returned');
      }
      const blob = await (await fetch(photo.webPath)).blob();
      // Upload first — unlike Firestore this does NOT queue offline, so the URL
      // must exist before it is recorded on the profile.
      const url = await uploadAvatar(this.fb.storage, uid, blob);
      await updateUserProfile(this.fb.firestore, uid, { photoUrl: url });
      await this.auth.refreshProfile();
    } catch (err) {
      // Best-effort cancel detection — the plugin has no typed cancel error, so
      // a dismissed picker should stay silent rather than look like a failure.
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (!message.includes('cancel')) {
        this.error.set('Could not update your photo. Check your connection and try again.');
      }
    } finally {
      this.uploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.saved.set(false);
    this.busy.set(true);
    try {
      await updateUserProfile(this.fb.firestore, uid, { name: this.form.controls.name.value.trim() });
      await this.auth.refreshProfile();
      this.saved.set(true);
    } catch {
      this.error.set('Could not save your changes. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
