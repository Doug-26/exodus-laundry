import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { initializeFirebase, type FirebaseServices } from '@exodus/shared';
import { environment } from '../environments/environment';

/** Inject this to access the shared Firebase SDK handles (app, firestore, auth, database). */
export const FIREBASE = new InjectionToken<FirebaseServices>('FIREBASE');

export function provideFirebase(): EnvironmentProviders {
  const services = initializeFirebase(environment.firebase);
  return makeEnvironmentProviders([{ provide: FIREBASE, useValue: services }]);
}
