# CI/CD — Android App Distribution + Dashboard deploy (GitHub Actions)

On every push to `main` (and via the manual **Run workflow** button), GitHub Actions:

1. builds a **signed release APK** and uploads it to **Firebase App Distribution** (testers install over-the-air), and
2. deploys the **dashboard** to Firebase Hosting.

Auth uses a **service account** (the legacy `FIREBASE_TOKEN` is deprecated). Workflow: [`.github/workflows/distribute-android.yml`](../.github/workflows/distribute-android.yml).

---

## One-time setup

### 1. Enable App Distribution + tester group
Firebase Console → **Run → App Distribution** → get started. Under **Testers & Groups**, create a group named **`internal`** and add tester emails (any Google account — the shop owner, riders, you). The workflow distributes to the `internal` group.

### 2. Generate a release keystore
Run once and **keep the `.jks` safe** (back it up — losing it means you can't ship updates to the same app):

```bash
keytool -genkeypair -v -keystore exodus-release.jks -alias exodus \
  -keyalg RSA -keysize 2048 -validity 10000
```
Remember the **store password**, **key alias** (`exodus`), and **key password**.

### 3. Create a Firebase service account
Console → **Project settings → Service accounts → Generate new private key** → download the JSON. In Google Cloud Console → **IAM**, grant that service account:
- **Firebase App Distribution Admin**
- **Firebase Hosting Admin**

### 4. Base64-encode the binary secrets
PowerShell:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("exodus-release.jks")) | Set-Content keystore.b64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("apps/mobile/android/app/google-services.json")) | Set-Content gservices.b64
```
(git bash: `base64 -w0 exodus-release.jks > keystore.b64`)

### 5. Add GitHub repo secrets
**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Where it comes from |
|---|---|
| `FIREBASE_API_KEY` … `FIREBASE_APP_ID` | your local `.env` (Firebase **web** config) |
| `FIREBASE_DATABASE_URL`, `FIREBASE_MEASUREMENT_ID` | your local `.env` |
| `GOOGLE_MAPS_API_KEY` | your local `.env` |
| `FIREBASE_ANDROID_APP_ID` | `1:619168695403:android:5772ffa4721c8044631d2e` (the **Android** app id — *not* the web `FIREBASE_APP_ID`) |
| `GOOGLE_SERVICES_JSON_BASE64` | contents of `gservices.b64` |
| `ANDROID_KEYSTORE_BASE64` | contents of `keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | store password from step 2 |
| `ANDROID_KEY_ALIAS` | `exodus` |
| `ANDROID_KEY_PASSWORD` | key password from step 2 |
| `FIREBASE_SERVICE_ACCOUNT` | the **entire** service-account JSON from step 3 |

> This is a **public repo**, so `google-services.json` and the keystore are git-ignored and injected only in CI. Never commit them.

---

## How it runs
- **Trigger:** push to `main`, or **Actions → Distribute Android + Deploy Dashboard → Run workflow**.
- `versionCode` = the workflow run number, so every run is a distinct App Distribution release.
- Release notes = the commit message.
- Testers get an email; they install via the **Firebase App Tester** Android app or the direct link.

## Building a signed release APK locally (optional)
```bash
cd apps/mobile && npm run build && npx cap sync android
cd android
ANDROID_KEYSTORE_FILE=/abs/path/exodus-release.jks \
ANDROID_KEYSTORE_PASSWORD=... ANDROID_KEY_ALIAS=exodus ANDROID_KEY_PASSWORD=... \
./gradlew assembleRelease
```
Without those env vars, `assembleRelease` still runs but produces an **unsigned** APK (local debug installs are unaffected).
