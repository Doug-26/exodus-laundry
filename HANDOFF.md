# Exodus Laundry — Development Handoff

> Context transfer for continuing development (e.g. on another Claude / machine).
> Compiled 2026-08-24. The master product spec is [`laundry-app-plan.md`](laundry-app-plan.md).

---

## 1. What this is

A laundry pickup/delivery app for **Exodus Laundry Services**, Naga City, Philippines.
Two front-ends over a Firebase backend:

- **Customer + Rider mobile app** (Android) — place orders, choose pickup/delivery, confirm
  a delivery pin, track the rider live, get push notifications.
- **Staff/Admin dashboard** (web) — order queue, intake, status advancement, pricing,
  team management, rate management, revenue reports.

The recorded **price is bookkeeping only** — cash changes hands at the counter / on delivery.
Online payments (PayMongo) are a **future** phase.

---

## 2. Tech stack & architecture

**Monorepo** using npm workspaces (`apps/*`, `libs/*`). `functions/` is **outside** the workspaces.

| Package | What | Notes |
|---|---|---|
| `apps/mobile` (`@exodus/mobile`) | Angular 20 + Ionic 8 + Capacitor 8, **Zone.js** | Android only (`com.exodus.laundry`) |
| `apps/dashboard` (`@exodus/dashboard`) | Angular 22 **zoneless**, **Signal Forms** | Firebase Hosting → `exodus-laundry.web.app` |
| `libs/shared` (`@exodus/shared`) | Models, services, utils shared by both apps | Jest tests: `npm run test:shared` |
| `functions/` (`@exodus/functions`) | Firebase Cloud Functions **v2, Node 22** | Deployed |

**Firebase** (project `exodus-laundry`, **Blaze** plan): Auth (email/password + Google),
Firestore, Realtime Database (**asia-southeast1**), **Cloud Storage** (bucket
`exodus-laundry.firebasestorage.app` — the newer format, *not* `.appspot.com`), Cloud
Functions, Hosting, App Distribution, FCM (push). Web SDK config comes from `.env` →
generated `environment.ts`.

**Roles** (`users/{uid}.role`): `customer`, `rider`, `staff`, `admin`.

**Cloud Functions (deployed):** `onOrderReady` (push on →ready), `onOrderCompleted` (push
on →completed, worded "Delivered!" vs "Order complete" by `fulfilment`), `startDelivery`
(rider self-claim + Routes API), `linkGuestOrders` (retro-link guest orders on signup),
`createTeamMember` (admin-gated staff/rider provisioning).

---

## 3. Data model

**Firestore collections:** `orders`, `users`, `phoneNumbers` (`{phone}`→`{uid}`, canonical
`+639…` key), `counters` (daily claim-number sequence), `rates` (`{serviceId}` → price).
**Realtime DB:** `deliveries/{orderId}` = `{ meta: {riderId, customerId}, riderLocation: {lat,lng,heading,timestamp} }`.
**Cloud Storage:** `avatars/{uid}/avatar.jpg` — one fixed object per customer, overwritten
on change (no orphans, trivial rules). `User.photoUrl` holds its download URL.

**Order state machine** (`libs/shared/src/services/orders.ts` `nextStatus`):
```
requested → received → washing → drying → folding → ready
  → (pickup)   picked_up → completed
  → (delivery) for_delivery → out_for_delivery → completed
  (any active) → cancelled
```
- `source`: `walk_in` (staff intake) | `app` (customer). App orders start at `requested`,
  walk-ins at `received`.
- `fulfilment` — **outbound**, chosen at `ready`: `pickup` | `delivery`.
- `intakeMethod` — **inbound**, chosen at app-order creation: `dropoff` (customer brings it)
  | `pickup` (shop collects) | `null` for walk-ins. Distinct from `fulfilment`; the dashboard
  shows a "Pickup" badge for it.
- `completedAt` timestamp set when reaching `completed` (revenue reports).
- Price rule: **cannot advance past `received` without a price** (`needsPriceBeforeAdvance`).

**Rate model** (`Rate`): `{ service, baseKg, baseAmount, perKg, active }`.
`computePrice`: `perKg===0` → flat `baseAmount`; else `round(baseAmount + max(0, kg-baseKg)*perKg)`.
Exodus wash&fold = 5kg / ₱180 base / ₱40 per kg above.

---

## 4. Completed phases (all shipped & deployed)

| Phase | Summary |
|---|---|
| **0 Foundation** | Monorepo, version pins, shared lib, Firebase scaffolding |
| **1 Auth & Roles** | Shared auth/users services, per-app AuthService + route guards, login/signup/team screens, `seed-admin` script |
| **2 Orders & Queue** | Orders service (claim numbers, state machine), dashboard queue/intake/detail, offline persistence, `OrdersStore` |
| **3 Lookup & Linking** | Intake phone lookup (name only), `customerId` on orders, retro guest-order linking on signup, "Linked" badge |
| **4 In-app Orders** | Customer app-order creation, mobile order list/detail, dashboard weight/price edit, App/Linked/Walk-in badges |
| **5 Ready Notification** | `onOrderReady` Cloud Function (FCM), token lifecycle, Capacitor push (Android), foreground toast |
| **6 Delivery Location** | Pickup/Deliver choice, `@capacitor/google-maps` pin-confirm page, atomic `confirmDelivery` |
| **6.5 UI Foundation** | Fresh Teal/Cyan design tokens + Inter font, `statusTone`, mobile Ionic theme + dashboard `styles.scss` |
| **7 Rider Route + ETA** | `startDelivery` callable (Google Routes API, server-key secret), rider self-claim, polyline + ETA map, Navigate handoff, Mark delivered |
| **8 Live Tracking** | `@capacitor-community/background-geolocation` streams rider GPS → RTDB; customer `/orders/:id/track` live map; scoped RTDB rules; distinct map markers |
| **9 Hardening** | Least-privilege **Firestore rules** (+ `npm run test:rules`); `linkGuestOrders` + `createTeamMember` callables replace insecure client paths; permission-denial UX; Play bg-location disclosure + `privacy.html`; **WCAG AA contrast** fixes |
| **10 Rate Pricing** | `rates` collection + admin `/rates` screen; base+overage `computePrice`; auto-fill price at intake + order-detail (editable); price-gate before advancing |
| **11 Revenue Reports** | `Order.completedAt`; `getCompletedOrdersInRange` + `summarizeRevenue`; admin `/reports` (Today/7d/month/custom, by service) |
| **12 Quick Wins** | Mobile name greeting + client-side date filter on the order list (All/Today/7d/Month/custom, no extra reads); `onOrderCompleted` push; dashboard **Order History** `/history` (all orders in a created-date range, any status — `staffAdminGuard`, so staff see it too) |
| **13 Storage + Avatar** | Cloud Storage enabled + `storage.rules` (owner writes own avatar); `storage` on shared `FirebaseServices`; `uploadAvatar`; `User.photoUrl`; `@capacitor/camera`; mobile **Account** screen (avatar, name, read-only phone, sign out); avatar in the home greeting. Also clamped the `users/{uid}` update rule — see §6 |
| **CI/CD** | GitHub Actions: signed release APK → Firebase App Distribution + dashboard hosting deploy on push to `main` |

Detailed per-phase notes were kept in Claude memory (account-local); this file + git
history + `laundry-app-plan.md` are the durable record.

---

## 5. CI/CD (working)

Workflow: [`.github/workflows/distribute-android.yml`](.github/workflows/distribute-android.yml).
On push to `main` (or manual dispatch): builds a **signed release APK** → Firebase App
Distribution (group `internal`), and deploys the dashboard to Hosting. Auth via a
**service account** (not the deprecated `FIREBASE_TOKEN`).

- **`apps/mobile/android/` is committed** (was git-ignored) so CI can build it. Keystore
  + `google-services.json` stay out (public repo) and are injected from secrets.
- Release signing in `apps/mobile/android/app/build.gradle` is **env-driven**
  (`ANDROID_KEYSTORE_FILE`/`_PASSWORD`, `ANDROID_KEY_ALIAS`/`_PASSWORD`); `versionCode` =
  workflow run number. Local debug builds unaffected.
- **Gotchas already fixed:** `gradlew` needs the exec bit on Linux runners
  (`git update-index --chmod=+x apps/mobile/android/gradlew` + `chmod +x` step);
  Capacitor 8 requires **JDK 21** (`setup-java` version).
- Setup guides: [`docs/ci-cd-app-distribution.md`](docs/ci-cd-app-distribution.md)
  (project-specific, +PDF) and
  [`docs/app-distribution-github-actions-guide.md`](docs/app-distribution-github-actions-guide.md)
  (generic reusable, +PDF).

---

## 6. Security constraints (must be preserved)

- **`.env` is never committed** (git-ignored). It holds Firebase web config +
  `GOOGLE_MAPS_API_KEY` + `FIREBASE_DATABASE_URL`.
- Generated `apps/*/src/environments/environment*.ts` are git-ignored; only
  `environment.example.ts` templates are committed.
- **Phone numbers stored ONLY canonical `+639XXXXXXXXX`** (`toCanonical`).
- **Dashboard lookup shows NAME only, never address** (Data Privacy Act).
- **No SMS OTP** at launch.
- `MAPS_ROUTES_KEY` (Google Routes API) is a **Firebase Functions secret** — never in code
  or the APK.
- `GOOGLE_MAPS_API_KEY` lives in `.env`, injected into `AndroidManifest` via a Gradle
  manifest placeholder (never committed).
- **Public repo:** `google-services.json`, `*.jks`/`*.keystore`, and service-account JSON
  are git-ignored and injected in CI from secrets.
- Firestore rules gotcha: **`service` is a reserved keyword** — path wildcards use
  `{serviceId}` etc.
- Firestore rules are **least-privilege and deployed**; RTDB rules scope `deliveries/{id}`
  to the delivery's rider + customer via `meta`.
- **`users/{uid}` update is clamped** to `hasOnly(['name','fcmTokens','photoUrl'])` (Phase 13).
  Before that it allowed any field but `role`, so a client could rewrite their own `phone` —
  which permanently desyncs the **immutable** `phoneNumbers/{phone}` index that guest-order
  linking matches on. Phone corrections must go through staff/Admin SDK.
- **Storage rules cannot read Firestore**, so `roleIs()`/`isStaff()` are *not* portable to
  `storage.rules` — it gates by path ownership only (`request.auth.uid == uid`), plus a 2MB
  and `image/*` cap. Role-gated Storage needs the **custom claims** in Phase 14.

---

## 7. Conventions & gotchas

- **Windows dev machine**, PowerShell + Git Bash. Firebase CLI 15.x, Java 21, Node 22.
- **JDK on a fresh machine:** Capacitor 8 needs **JDK 21**. Android Studio ships one at
  `C:\Program Files\Android\Android Studio\jbr`; point the *user* `JAVA_HOME` there. A
  machine-level `JAVA_HOME`/PATH pointing at a newer JDK can stay — Gradle reads `JAVA_HOME`
  first, so a bare `java -version` may report a different version and that's fine. The
  Firestore/Storage emulators run on newer JDKs too.
- **CI gotcha (fixed):** `android-actions/setup-android@v3` defaults to
  `packages: tools platform-tools`, but the obsolete `tools` package no longer exists in
  cmdline-tools 16.x — the workflow pins `packages: 'platform-tools'`. It also sets
  `log-accepted-android-sdk-licenses: false`, otherwise ~40KB of licence text buries real errors.
- **Functions deploy on Windows** may need `FUNCTIONS_DISCOVERY_TIMEOUT=120`.
- **Android device** for testing (`adb`), id `AE6RUT4816000657` — the USB link **drops
  intermittently**; use `adb reconnect` / `adb reconnect offline`, then `adb install -r`.
  (App Distribution now makes OTA installs possible instead of USB.)
- **`@capacitor-community/background-geolocation` ships native-only** (no JS bundle):
  use `registerPlugin('BackgroundGeolocation')` with **inline TS types**, don't import from
  the package.
- Map element (`<capacitor-google-map>`) must render **unconditionally** (outside `@if`) so
  `viewChild.required` resolves in `ngAfterViewInit`. Needs `@types/google.maps` +
  `"types": ["google.maps"]` in `apps/mobile/tsconfig.app.json`.
- `body.map-open` + transparent `ion-content` is the Android map-transparency fix.
- Distinct map marker PNGs are generated by `scripts/generate-markers.mjs` (pure Node zlib).
- **ts-jest is stricter than the Angular build** — it caught a `Record<string,unknown>`
  passed to `updateDoc`. Build update objects as literals.
- Auth-driven store connect: `AuthService.syncOrderStore(uid, role)` routes customer →
  `OrdersStore`, rider → `RiderOrdersStore` (fixes a re-login race).

---

## 8. Environment setup & key commands

**First-time local setup:** copy `.env.example` → `.env`, fill Firebase web config +
`GOOGLE_MAPS_API_KEY` + `FIREBASE_DATABASE_URL`. `apps/mobile/android/app/google-services.json`
must exist locally (git-ignored). Run `npm ci` at the root.

```bash
# generate environment.ts from .env (runs automatically before build/start)
npm run config

# tests
npm run test:shared        # jest (libs/shared)
npm run test:rules         # Firestore + Storage rules emulators (needs Java + firebase CLI)

# seed scripts (sign in with an admin account)
npm run seed:admin -- <email> <password> "<Full Name>" <phone>
npm run seed:rates -- <adminEmail> <adminPassword>

# dashboard (web)
cd apps/dashboard && npm run build            # or: npx ng serve / ng lint

# mobile (Android)
cd apps/mobile && npm run build && npx cap sync android
cd apps/mobile/android && ./gradlew assembleDebug
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk

# deploys (locally, already logged in via `firebase login`)
firebase deploy --only firestore:rules
firebase deploy --only database          # RTDB rules
firebase deploy --only storage           # Cloud Storage rules
firebase deploy --only hosting:dashboard
FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase deploy --only functions
```

**CI/CD:** push to `main` → signed APK to App Distribution + dashboard hosting deploy.

---

## 9. NEXT WORK — planned but NOT started

Payments (PayMongo) is **parked** as the last phase. Before it, the user requested these
additions, sequenced so each foundation lands just before it's needed. **Decisions already
made are noted.**

> Phases 12 and 13 are **done** — see §4. Phase 13 laid the Storage foundation Phase 14
> builds on, so the remaining phases stay in this order.

### Phase 14 — Proof photos
- **Foundation: role custom claims** — set a `role` claim (in `createTeamMember`, on login
  refresh, + a one-time backfill script) so Storage **and** RTDB rules can gate by role
  (RTDB/Storage rules can read `auth.token.role`, not Firestore).
- **Storage rules:** staff write proof photos; customer reads via the stored URL.
- **Dashboard order-detail:** add/capture **multiple** proof photos (gallery). *(Decision:
  multiple, anytime.)*
- **Mobile order-detail:** show proof photos **as soon as uploaded**. *(Decision.)*

### Phase 15 — Dashboard delivery view + live monitoring
- **Foundation:** **Google Maps JS API** in the dashboard (its first map — mobile uses the
  Capacitor plugin, dashboard needs `@angular/google-maps` or the JS loader).
- **RTDB rules** extended so **staff** can read `deliveries/{orderId}` (via the role claim
  from P14).
- **Dashboard delivery detail page:** customer's confirmed destination + address note,
  shop→customer route polyline, and the **live rider marker** moving in real time. A
  separate page staff open when an order is a delivery.

### Later — Payments (PayMongo)
Online GCash/card collection: merchant account, secret keys, webhooks, refunds/settlement.
Big, moves real money. Do last.

### Also still open (optional, user-run)
- **WS-5 live axe accessibility audit** in a browser (code-level + contrast already done).
- **WS-6 budget alert** verification in the Cloud Console (Billing → Budgets).

---

## 10. Suggested working style (from this project's history)

- Work **phase by phase**; present a short plan, confirm key decisions (use focused
  questions), then build.
- After each phase: run `test:shared` + `test:rules` as relevant, `ng build` + `ng lint`
  for touched apps, then deploy (rules/hosting/functions) and, for mobile, rebuild the APK.
  CI now handles APK + hosting on push to `main`.
- Keep changes least-privilege and preserve the security constraints in §6.
- The user commits/pushes themselves (main-based workflow) unless asked otherwise.
