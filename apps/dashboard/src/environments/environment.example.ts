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
  // From GOOGLE_MAPS_BROWSER_KEY — an HTTP-referrer-restricted key, NOT the
  // Android-restricted GOOGLE_MAPS_API_KEY the mobile app uses.
  googleMapsApiKey: '',
};
