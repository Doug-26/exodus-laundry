# Public Android app download

Visitors can install the Android app without a Firebase App Distribution invitation or
Google Play listing. Share this public Firebase Hosting page:

<https://exodus-laundry.web.app/download.html>

The page explains installation and links directly to
`/downloads/exodus-laundry.apk`. Firebase Hosting serves the APK as a public static file.
The dashboard login page also links to the download page.

## Publishing updates

The `Build Android + Deploy Dashboard` GitHub Actions workflow builds a signed release
APK on pushes to `main` and manual runs. It uploads the APK between jobs, then deploys it
with the dashboard to the Firebase Hosting `dashboard` target. Each deployment replaces
the APK at the same URL, so the download page stays stable.

The workflow still requires the Android release keystore, Android signing values,
`google-services.json`, Firebase web configuration, and the Firebase service account
used to deploy Hosting. Keep the signing key and its passwords stable so Android can
install future versions as updates.

Firebase App Distribution runs as a separate tester job when both
`FIREBASE_ANDROID_APP_ID` and `FIREBASE_SERVICE_ACCOUNT` are configured. Configure
`APP_DISTRIBUTION_GROUPS` if the testing release should go to a specific tester group.
Failure or absence of the tester setup does not prevent the public Hosting deployment.

## Visitor installation

The download is Android-only and installed outside Google Play. A visitor downloads the
APK, opens it, allows their browser to install unknown apps if Android asks, and confirms
the installation. Android can show a warning because the app is sideloaded. Visitors can
then create a customer account in the app.
