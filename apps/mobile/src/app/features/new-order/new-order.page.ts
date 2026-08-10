import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonRadio,
  IonRadioGroup,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bagAddOutline } from 'ionicons/icons';
import { SERVICES, SHOP_LOCATION } from '@exodus/shared';
import { AuthService } from '../../auth/auth.service';
import { OrdersStore } from '../../orders/orders.store';

@Component({
  selector: 'app-new-order',
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonList,
    IonItem,
    IonRadio,
    IonRadioGroup,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonButton,
    IonIcon,
    IonText,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>New Order</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p>Pick a service and add any instructions. The shop will weigh and price it on drop-off.</p>

      <form [formGroup]="form" (ngSubmit)="submit()">
        <ion-list>
          <ion-item>
            <ion-select label="Service" labelPlacement="stacked" formControlName="service" interface="popover">
              @for (s of services; track s.id) {
                <ion-select-option [value]="s.id">{{ s.label }}</ion-select-option>
              }
            </ion-select>
          </ion-item>

          <ion-radio-group formControlName="intake">
            <ion-item>
              <ion-radio value="dropoff">I'll drop it off at the shop</ion-radio>
            </ion-item>
            <ion-item>
              <ion-radio value="pickup">Please pick up from me</ion-radio>
            </ion-item>
          </ion-radio-group>

          <ion-item>
            <ion-textarea
              label="Notes (optional)"
              labelPlacement="stacked"
              formControlName="notes"
              [autoGrow]="true"
              placeholder="e.g. separate whites, delicates"
            ></ion-textarea>
          </ion-item>
        </ion-list>

        @if (form.controls.intake.value === 'pickup') {
          <ion-text color="medium"><p>The shop will call you to arrange pickup.</p></ion-text>
        }

        @if (error()) {
          <ion-text color="danger"><p role="alert">{{ error() }}</p></ion-text>
        }

        <ion-button expand="block" type="submit" [disabled]="busy()">
          <ion-icon name="bag-add-outline" slot="start"></ion-icon>
          Place order
        </ion-button>
      </form>
    </ion-content>
  `,
})
export class NewOrderPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly store = inject(OrdersStore);
  private readonly router = inject(Router);

  protected readonly services = SERVICES;
  protected readonly form = this.fb.group({
    service: this.fb.control('wash_fold', [Validators.required]),
    intake: this.fb.control<'dropoff' | 'pickup'>('dropoff', [Validators.required]),
    notes: this.fb.control(''),
  });

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    addIcons({ bagAddOutline });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const profile = this.auth.profile();
    const uid = this.auth.firebaseUser()?.uid;
    if (!profile || !uid) {
      this.error.set('Your session expired. Please sign in again.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    const { service, intake, notes } = this.form.getRawValue();
    try {
      await this.store.create({
        source: 'app',
        createdBy: uid,
        customerId: uid,
        guestName: profile.name,
        guestPhoneRaw: profile.phone,
        service,
        intakeMethod: intake,
        notes: notes.trim(),
        weightKg: null,
        loadCount: null,
        price: null,
        shopLocation: SHOP_LOCATION,
      });
      await this.router.navigateByUrl('/home');
    } catch {
      this.error.set(
        navigator.onLine
          ? 'Could not place your order. Please try again.'
          : 'You appear to be offline — placing an order needs a connection.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
