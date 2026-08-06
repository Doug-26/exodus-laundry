// Template for src/environments/environment.ts (which is git-ignored).
// The real file is generated from repo-root .env by `npm run config`.
// This example is committed as the reference shape.
export const environment = {
  production: false,
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
    databaseURL: '',
  },
  // @capacitor/google-maps API key (Phase 6). Restrict to the Android package
  // + Maps SDK for Android. Empty until GOOGLE_MAPS_API_KEY is set in .env.
  googleMapsApiKey: '',
};
