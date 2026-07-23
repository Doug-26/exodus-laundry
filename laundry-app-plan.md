# Laundry Delivery App — Build Specification & Plan

> **How to use this document (for Claude Code):** This is the authoritative spec for the project. Read it top to bottom before writing any code, and also read **`best-practices.md`** (in the repo root) — that file is the authoritative coding standard and this plan defers to it on all Angular/TypeScript conventions. Sections 1–13 define *what* to build and the key decisions/constraints. Section 14 contains phase-by-phase build prompts — execute them in order, one phase per working session, confirming the acceptance criteria at the end of each phase before moving on. Do not skip the "gotchas" in Section 12; they encode real platform constraints that will otherwise cause silent failures. When a decision is marked **[DECISION]**, it is settled — do not re-litigate it. When something is marked **[CONFIRM WITH OWNER]**, pause and ask.

---

## 0. Project snapshot

| | |
|---|---|
| **Product** | Laundry service app: order, get notified when ready, choose pickup or delivery, track the rider live. |
| **Client stack** | Ionic + Angular + Capacitor (mobile); Angular (shop web dashboard). |
| **Backend** | Firebase: Auth, Cloud Firestore, Realtime Database, Cloud Functions, Cloud Messaging, Hosting. |
| **Market** | Naga City, Camarines Sur, Philippines. |
| **Delivery** | Shop's own in-house rider. |
| **Order sources** | **Real mix**: walk-in counter orders *and* in-app orders. Both are first-class. |
| **Operating reality** | Busy counter, many customers/day. The dashboard must be fast under pressure (see §4). |
| **Payments** | Cash at launch (dashboard records amount owed; no money processed in-app). PayMongo is a later phase. |
| **Rollout philosophy** | App-optional first. The shop must be able to run *every* transaction with or without the app. Once stable, migrate all transactions through the app. |

---

## 1. Coding standards & target versions

**`best-practices.md` (repo root) is authoritative** for all TypeScript/Angular conventions. Follow it strictly. Highlights it mandates: strict typing (no `any`, use `unknown`); standalone components (do **not** set `standalone: true` — it's the default; do **not** set `OnPush` explicitly — default in v22+); **signals** for state, `computed()` for derived state, `set`/`update` (never `mutate`); `input()`/`output()` functions (not decorators); **Signal Forms** (`@angular/forms/signals`) for new forms, else Reactive forms; native control flow (`@if`/`@for`/`@switch`); host bindings in the `host` object (no `@HostBinding`/`@HostListener`); `class`/`style` bindings (no `ngClass`/`ngStyle`); `inject()` over constructor injection; `@Service` decorator for new singletons (v22+); `NgOptimizedImage` for static images; lazy-loaded feature routes; and full **WCAG AA / AXE** accessibility compliance.

**Target versions — READ CAREFULLY, the two front-ends differ:**

- **Shop dashboard (pure Angular, no Ionic):** target **Angular 22** (latest stable, June 2026). Use every best-practices.md convention fully, including stable Signal Forms, selectorless components, `@Service`, and **zoneless** change detection.
- **Mobile app (Ionic + Angular + Capacitor):** target the **highest Angular version Ionic officially supports at scaffold time.** As of mid-2026 Ionic officially supports Angular up to ~20 (21 community-reported); **Angular 22 support in Ionic is still pending**. **[DECISION]** Do **not** force Angular 22 into the Ionic app before Ionic supports it — pin to the latest Ionic-supported Angular instead. Apply best-practices.md conventions to the extent that Angular version supports them; adopt the remaining v22-only features in the mobile app once Ionic ships Angular 22 support.
- **Zone.js:** the dashboard can be **zoneless**; the **Ionic app keeps Zone.js** (scaffold with `--zoneless=false`) until Ionic supports zoneless. See §12 gotcha.

**[CONFIRM WITH OWNER / re-check at build time]** Verify the current Ionic → Angular support matrix at project start (Ionic docs "support policy") and pin the mobile app accordingly; frameworks move fast.

---

## 2. The three surfaces, one backend

The system is **three front-ends over a single Firebase backend**. All three share auth, data models, and Firebase access code. Users are separated by a `role` field.

1. **Customer mobile app** (Ionic/Angular/Capacitor) — place orders, receive the "ready" notification, choose pickup/delivery, confirm delivery location, track the rider live.
2. **Rider mobile app / mode** (Ionic/Angular/Capacitor) — view assigned deliveries, see an in-app route line + ETA, hand off to Google Maps/Waze for turn-by-turn, stream live location.
3. **Shop dashboard** (Angular web app) — the operational backbone. Staff create/manage orders, run the daily queue, link walk-ins to app accounts, and tap "Ready" to trigger the customer notification. Detailed in §4.

**[DECISION] Customer and rider share one Ionic codebase**, gated by `role` (`customer` | `rider`).
**[DECISION] The shop dashboard is a separate Angular web app, not Electron, not a phone screen.** Runs on the shop's PC/laptop/tablet in a browser; no install; instant updates; free Firebase Hosting; reuses Angular skills + shared Firebase code. Revisit Electron only for a concrete offline-during-outage or thermal-printer need (Firestore offline persistence + browser printing likely cover both).

---

## 3. Roles & who triggers what

| Actor | Surface | Key actions |
|---|---|---|
| Customer | Mobile app | Create in-app order; receive "ready" push; choose pickup/deliver; confirm delivery pin; track rider. |
| **Shop staff** | **Web dashboard** | Create walk-in orders; look up / link customers by phone; advance status; **tap "Ready" → fires the notification.** |
| Rider | Mobile app (rider mode) | See assigned deliveries; view route + ETA; stream live location; mark delivered. |
| Owner/admin | Web dashboard | All staff actions + assign riders, view history, manage rates/reports. |

**The trigger, explicit:** a *person* (shop staff) advancing an order to **Ready** in the dashboard is what causes the Cloud Function to send the FCM push. Nothing is automatic — a human at the counter drives the workflow.

---

## 4. Shop dashboard — screens, fields & throughput

The dashboard is the shop's order-management and **light point-of-sale** tool. Capturing laundry details (service, weight, price) is its primary job, because the counter is where an order is created and priced. The status workflow is just what happens *after* intake.

### 4.1 Screens

**A. New Order (intake) — the core screen.** Fields captured when a customer drops off:
- **Customer link** — phone lookup (§10) to attach an app account, or a guest name + number.
- **Service type** — e.g. wash & fold, wash only, dry clean, ironing/press, comforter/beddings (shop-defined list).
- **Weight (kg)** and/or **load/basket count** — whichever the shop prices by.
- **Price (₱)** — see the pricing decision in §4.3.
- **Notes** — special instructions (separate whites, delicates, etc.).
- **Claim number** — auto-generated; printed on the stub for walk-ins.
On save: order created at `status: received`, appears in the queue.

**B. Order Queue (today's board) — the default/home screen.** Live list of active orders: claim number, customer name, service, current status, and one-tap controls to advance received → washing → drying → folding → **Ready**. Entering **Ready** fires the customer notification. This is what staff look at all day.

**C. Order Detail.** Full breakdown: items/weight/price, status history, fulfilment (pickup/delivery), assigned rider, and for delivery orders the customer's confirmed destination + live tracking view.

**D. Rider Assignment / Deliveries.** Assign a rider to a delivery order; see what's out for delivery.

**E. History & simple reports.** Search past orders by customer/date; basic daily totals (orders today, revenue today). Keep light for MVP; richer analytics later. **Reports and rate management are admin/owner-only** (see role-based visibility below).

### 4.2 Built for throughput — [DECISION] the dashboard is designed for a busy counter

This is a hard design requirement, not polish. The shop has many customers coming in and staff are busy, so the dashboard must be fast under pressure:
- **Fast intake:** the New Order screen minimizes fields and taps, uses large touch targets, supports keyboard/Enter-to-advance flow, and avoids nested modals. A typical walk-in should be logged in seconds.
- **Queue-first:** the queue board is the landing screen; advancing status is one tap, no drill-down required.
- **Instant lookup:** phone lookup returns results immediately; typo-tolerant via normalization (§12).
- **Real-time multi-staff sync:** use Firestore real-time listeners so every staff device sees the same live board; two staff can work concurrently without stepping on each other.
- **Search everywhere:** find any active or past order by claim number, name, or phone quickly.
- **Offline resilience:** enable Firestore offline persistence so a flaky shop connection doesn't stall intake; changes sync when the connection returns.
- **Accessibility:** WCAG AA per best-practices.md — high contrast and large hit areas also happen to make a fast counter tool.

### 4.3 Pricing model — [DECISION] manual first, rate-based later

- **MVP: manual price entry.** Staff type the peso amount at intake. Simplest, most flexible, matches how small PH laundry shops already operate.
- **Phase 2: rate-based auto-calculation.** Store a price list (₱/kg per service, flat rates for comforters, etc.) in the dashboard and compute price automatically from weight/service. Requires a "manage rates" screen (admin-only). Add once the basic flow is proven.

**[DECISION] At launch, the recorded price is bookkeeping only** — the actual money changes hands as cash at the counter or on delivery. The dashboard tracks *what's owed*, it does **not** process payment. Online payment (PayMongo) is the separate later phase; only then does the app move money.

**Role-based price visibility:** `staff` can create orders and see/enter prices; **rate management and revenue reports are `admin`/`owner`-only.** Built in from the start via the existing `role` field.

---

## 5. Order lifecycle (state machine)

```
                         ┌─────────────────────────────────────────┐
                         │  Order created                           │
                         │  (walk-in at counter OR in-app by customer)
                         └───────────────┬─────────────────────────┘
                                         ▼
   received ─► washing ─► drying ─► folding ─► READY ─► (customer chooses)
                                                 │
                                                 │  entering READY fires
                                                 │  the "laundry is ready" push
                                                 ▼
                          ┌──────────────────────┴───────────────────┐
                          ▼                                           ▼
                   fulfilment = "pickup"                     fulfilment = "delivery"
                          │                                           │
                          ▼                                           ▼
                   picked_up ─► completed          for_delivery ─► out_for_delivery ─► completed
                                                    (customer confirms pin)  (rider streams location)
```

Status enum (store exactly these strings):
`received | washing | drying | folding | ready | for_delivery | out_for_delivery | picked_up | completed | cancelled`

Fulfilment enum: `pickup | delivery | null` (null until chosen, or set directly by staff for pure walk-in pickup).

---

## 6. Data model

### 6.1 Firestore (durable records)

```
users/{userId}
  role: "customer" | "rider" | "admin" | "staff"
  name: string
  phone: string            // CANONICAL FORMAT ONLY: +639XXXXXXXXX (see §12 gotcha)
  fcmTokens: string[]      // device tokens; array supports multiple devices
  createdAt: Timestamp

orders/{orderId}
  customerId: string | null       // null = guest/walk-in with no app account
  guestContact: {                 // used only when customerId is null
    name: string, phone: string   // phone canonical
  } | null
  createdBy: string                // userId of staff (walk-in) or customer (in-app)
  source: "walk_in" | "app"
  claimNumber: string
  status: <status enum>            // see §5
  fulfilment: "pickup" | "delivery" | null
  service: string                  // e.g. "wash_fold", "dry_clean"
  loadCount: number | null
  weightKg: number | null
  price: number | null             // ₱ owed; manual at MVP, rate-derived in phase 2
  destination: {                   // set by CUSTOMER on their phone, never at counter (§8)
    lat: number, lng: number, addressNote: string
  } | null
  shopLocation: { lat: number, lng: number }
  assignedRiderId: string | null
  routeCache: {                    // see §9 cost pattern
    encodedPolyline: string, etaSeconds: number, computedAt: Timestamp
  } | null
  createdAt: Timestamp
  updatedAt: Timestamp

rates/{rateId}                     // PHASE 2 only (rate-based pricing)
  service: string, unit: "per_kg" | "flat", amount: number, active: boolean
```

**Key model rules:**
- `customerId` is **optional**. A guest/walk-in order is fully valid with `customerId: null` + `guestContact`. This lets the shop record *every* order from day one.
- `phone` stored **only** in canonical `+639XXXXXXXXX` form, and **unique** across `users`.
- `destination` is only ever written by the customer's own device (§8). The dashboard never sets it.
- `price` is captured at intake; at MVP it's manual bookkeeping (§4.3).

### 6.2 Realtime Database (live position stream only)

```
deliveries/{orderId}/riderLocation
  { lat: number, lng: number, heading: number, timestamp: number }
```

Written by the rider app every few seconds; read by the customer app. **Delete the node on `completed`.** Never stream GPS into Firestore.

---

## 7. Feature: "Laundry is ready" notification

**Tools:** `@capacitor/push-notifications` + Firebase Cloud Messaging + a Firestore-triggered Cloud Function.

**Trigger:** staff advance an order to `status: "ready"` in the dashboard.

**Mechanism:** a Cloud Function watches `orders/{orderId}` for the transition into `ready`. On trigger it: (1) resolves the recipient — if `customerId` is set, load that user's `fcmTokens`; if `customerId` is null (guest), **send nothing** (§10 fallback); (2) sends FCM with data payload `{ orderId, type: "ready" }`; (3) tapping it deep-links to that order's screen with **Pick up / Deliver**.

**Cost:** FCM is free — no message cap, no per-message charge, on all plans.

**Acceptance:** advancing a linked order to `ready` makes the customer's device show a notification that opens the correct order.

---

## 8. Feature: delivery location capture + "Is this your delivery address?"

**Tools:** `@capacitor/geolocation` + `@capacitor/google-maps`.

**Flow (all on the customer's own device):**
1. Customer taps **Deliver** on the ready order.
2. App calls `Geolocation.getCurrentPosition()`; OS shows the permission prompt.
3. On allow, drop a pin at the returned coordinates on a Google Map.
4. Ask **"Is this your delivery address?"** — customer can **drag the pin** to fine-tune and add a short note (gate color, floor, landmark).
5. On **Confirm**, write `destination { lat, lng, addressNote }`, set `fulfilment: "delivery"`, `status: "for_delivery"`.

**[DECISION] The delivery address is captured only here, on the customer's phone — never at the counter.** A walk-in is physically at the shop at drop-off, so there's no meaningful delivery address to capture then. This also keeps home addresses out of the shop UI (privacy — §10).

**Cost:** Geolocation free; map display uses Google Dynamic Maps SKU (~10,000 free loads/month; billing account required even for free tier).

---

## 9. Feature: rider in-app route line + live ETA

**Tools:** Google **Routes API** (`Compute Routes`) drawn as a polyline on `@capacitor/google-maps`; **Navigate** button hands off to Google Maps/Waze for actual turn-by-turn.

**Mechanism:**
- When a delivery starts, make **ONE** Routes API call (shop → customer coords) → encoded polyline + ETA.
- Draw the polyline; show the ETA. Cache both in `orders/{orderId}/routeCache`.
- The rider's moving marker comes from **free background geolocation** (§11), not from Routes calls.
- Recompute only if the rider goes materially off-route, or refresh ETA on a slow timer.

**[DECISION — critical cost rule] Never call Routes API on every GPS ping.** Compute once, draw continuously. At ~1–3 calls per delivery you stay within the free tier indefinitely for a single shop.

**Cost:** Basic Compute Routes ≈ $5/1,000; traffic-aware (Advanced/Pro SKU) ≈ $10/1,000 with **5,000 free requests/month**. Turn-by-turn handoff is free. **[CONFIRM WITH OWNER]** live-traffic ETA (Advanced) vs plain ETA (Basic) — both effectively free at this volume.

---

## 10. Feature: walk-in customer lookup & account linking (shop dashboard)

Connects a physical order to an app account so notifications can flow.

```
Customer gives phone number → staff types it → [Next]
        │
   normalize to +639XXXXXXXXX, then query users by phone
        │
   ┌────┴───────────────────────────────────┐
   MATCH found                             NO MATCH
   │                                        │
   show NAME only (+ small disambiguator    ├─ Try again (assume typo)
   like member-since; NEVER the address)    ├─ Invite: show QR to install app,
   → staff confirms verbally                │   customer registers same number, then link
   → link order: customerId = matched user  └─ Create GUEST order:
   → notifications will flow                    customerId = null, guestContact = {name,phone},
                                                print claimNumber, NO push, traditional pickup
```

**[DECISION] On a phone-number match, display NAME only — never the address.** Reasons: (1) privacy — showing a home address to anyone who types a number is a Data Privacy Act liability for a delivery app; (2) unnecessary — the delivery address is set later by the customer on their own phone (§8). Name is enough to confirm the account.

**Guest orders are first-class:** the dashboard records the order regardless of app status. The app only *adds* notifications + delivery on top. This enables the real walk-in/app mix and the app-optional rollout.

**Retroactive linking:** when a walk-in later installs the app and registers with the same canonical phone, match and attach their prior guest orders (`customerId: null` + matching `guestContact.phone`) to the new account.

**Future hardening (v2, not MVP):** before attaching, optionally require the customer to confirm the link via a push on their own phone, so staff can't mislink to a stranger's account.

---

## 11. Feature: live tracking

**Tools:** `@capacitor-community/background-geolocation` (rider) + Firebase Realtime Database + `@capacitor/google-maps` (customer).

**Mechanism:** rider app streams `{lat, lng, heading, timestamp}` to `deliveries/{orderId}/riderLocation` every few seconds; customer app subscribes and moves the rider marker; on `completed`, delete the RTDB node.

**[DECISION] Use a background geolocation plugin for the rider — the official `@capacitor/geolocation` does NOT track in the background** and freezes the moment the rider locks the screen. Use `@capacitor-community/background-geolocation` (free, maintained). Consider `@capgo/background-geolocation` if geofencing ("rider is near") is wanted later. Do not use the paid Transistorsoft plugin unless battery/reliability becomes a measured problem.

**Cost:** RTDB free Spark plan allows 100 simultaneous connections at no charge; pings are tiny → effectively ₱0/month.

---

## 12. Non-negotiable gotchas (these cause silent failures)

1. **Framework version compatibility.** Do **not** `ng new` the Ionic app on Angular 22 while Ionic lacks official Angular 22 support — pin the mobile app to the latest Ionic-supported Angular (re-check the support matrix at build time). The **dashboard** (pure Angular) may use Angular 22 freely.
2. **Zone.js for Ionic.** New Angular projects default to zoneless, but the Ionic app must keep Zone.js for now (`ng new … --zoneless=false`). The dashboard can be zoneless.
3. **Phone normalization.** PH numbers appear as `0917…`, `+63917…`, `63917…`. Store and query **only** canonical `+639XXXXXXXXX`. Normalize at signup *and* before every dashboard lookup, or matches silently fail. Enforce uniqueness.
4. **Android map transparency.** `@capacitor/google-maps` renders the native map *beneath* the WebView on Android — make the WebView transparent through all layers (`IonContent` + root HTML) or the map is invisible.
5. **Background location on Android.** Set `android.useLegacyBridge: true` or updates stop after 5 min backgrounded. After 5 min, Android throttles WebView HTTP — forward positions via a native HTTP path (CapacitorHttp) or the native layer. A **persistent notification** is required; on Android 13+ request `POST_NOTIFICATIONS`.
6. **Routes API cost trap.** Compute the route **once** per delivery and cache it. Never per GPS ping.
7. **Google billing account required** even for the free tier of Maps/Routes. Set a **Google Cloud budget alert** at a low threshold on day one.
8. **Guest orders must not attempt a push** (no `customerId` = no token). The Cloud Function handles `customerId: null` by sending nothing, not erroring.
9. **Permissions must be declared** or store review rejects the app: iOS Info.plist (`NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `location` in `UIBackgroundModes`); Android manifest (fine + coarse location, background location, `POST_NOTIFICATIONS` on 13+). Use honest, specific strings.
10. **No SMS OTP for auth** at launch (per-message cost). Use email/social via Firebase Auth. Phone is a *profile/lookup* field, not the login method.

---

## 13. Tools, plugins & costs

| Purpose | Tool | Cost at single-shop scale |
|---|---|---|
| Mobile framework | Ionic + Angular (Ionic-supported version) + Capacitor | Free |
| Shop dashboard | Angular 22 web app on Firebase Hosting | Free |
| Push notifications | `@capacitor/push-notifications` + FCM | Free |
| Auth / orders DB / functions | Firebase Auth + Firestore + Cloud Functions | Free tier |
| Live position stream | Firebase Realtime Database | Free (100 connections) |
| In-app maps | `@capacitor/google-maps` | Free tier (billing account required) |
| Customer location capture | `@capacitor/geolocation` | Free |
| Rider background tracking | `@capacitor-community/background-geolocation` | Free |
| Route line + ETA | Google Routes API (Compute Routes) | 5,000 free/mo, then ~$10/1,000 |
| Turn-by-turn navigation | Handoff to Google Maps / Waze | Free |
| Payments (later) | PayMongo | 0 base + ~3% per transaction |

**One-time / annual:** Apple Developer ~₱5,600/yr; Google Play ~₱1,400 once; domain ~₱700/yr.
**Monthly at launch:** effectively **₱0** in software; real costs are rider wages + fuel. Move to Firebase Blaze only when Cloud Storage (laundry photos) is needed; likely ₱0–₱500/mo.

---

## 14. Build plan — phase-by-phase prompts for Claude Code

> Execute in order. Each phase lists the goal, concrete tasks, and **acceptance criteria** (done-definitions) to verify before proceeding. All code follows `best-practices.md`.

### Phase 0 — Scaffolding, versions & shared foundation
**Goal:** correct-versioned projects with a shared Firebase layer.
**Tasks:**
- **Check the Ionic → Angular support matrix now.** Scaffold the Ionic + Angular + Capacitor app on the latest Ionic-supported Angular, **keeping Zone.js** (`--zoneless=false`). Scaffold the dashboard as a separate **Angular 22** app (zoneless OK).
- Create the Firebase project; enable Auth, Firestore, Realtime Database, Cloud Functions, Hosting, Cloud Messaging.
- Shared TypeScript library of data models (§6) + Firebase access services, imported by both front-ends.
- `phone.ts` with `toCanonical(raw)` and `isValidPhPhone(raw)`; unit tests for `0917…`, `+63917…`, `63917…`, malformed input.
**Acceptance:** both apps build/boot on their target versions; `toCanonical` passes tests; shared `Order`/`User` types imported in both projects; best-practices.md conventions applied.

### Phase 1 — Auth & roles
**Goal:** email/social login with role-based routing.
**Tasks:** Firebase Auth (email/password + one social provider; **no SMS OTP**); capture `name` + `phone` at signup (store canonical, enforce unique); `role` routing (`customer`/`rider` → mobile, `admin`/`staff` → dashboard); guard the dashboard to staff/admin only.
**Acceptance:** each role lands on the correct surface; duplicate phone rejected; phone stored canonically.

### Phase 2 — Orders core + dashboard intake & queue (fast counter tool)
**Goal:** staff run the shop end-to-end without the app existing, **fast**.
**Tasks:**
- Firestore order model (§6) + status state machine (§5).
- **New Order intake screen** with fields from §4.1A (customer link, service, weight/load, price, notes, auto claim number); **manual price entry** (§4.3).
- **Queue board** (§4.1B) as the home screen with one-tap status advance; Firestore real-time listeners for multi-staff sync; Firestore offline persistence; search by claim/name/phone.
- Guest orders (`customerId: null`, `guestContact`).
- Apply throughput requirements (§4.2): minimal fields, large targets, keyboard flow.
**Acceptance:** a staff member logs a guest walk-in in seconds; two browser sessions see the same board update live; queue advances received→…→completed one tap at a time; works after a brief offline blip.

### Phase 3 — Walk-in lookup & linking
**Goal:** connect walk-ins to app accounts by phone (§10).
**Tasks:** dashboard lookup (input → [Next] → normalize → query by canonical phone); **match** shows name only (never address), link `customerId` on confirm; **no match** → try again / install-QR / guest order; retroactive linking of prior guest orders on later registration.
**Acceptance:** an existing customer's number in any format is found and shows their name (not address); linking sets `customerId`; a no-match still records a guest order; new registration with a prior guest number inherits history.

### Phase 4 — In-app orders (customer)
**Goal:** customers create orders from the app.
**Tasks:** customer order-creation flow (`source: "app"`); order status + history screens (Signal Forms where supported by the app's Angular version).
**Acceptance:** an app order appears in the dashboard queue identically to a walk-in.

### Phase 5 — "Ready" notification
**Goal:** advancing to `ready` notifies the linked customer.
**Tasks:** `@capacitor/push-notifications` (permission + register token to `users/{id}.fcmTokens`); Cloud Function on transition into `ready` (skip if `customerId` null; send FCM `{orderId, type:"ready"}`); deep-link tap to the order screen with **Pick up / Deliver**.
**Acceptance:** advancing a linked order to `ready` shows a push that opens the right order; a guest order sends nothing and does not error.

### Phase 6 — Delivery location capture + pin confirm
**Goal:** customer sets delivery destination on their own device (§8).
**Tasks:** integrate `@capacitor/google-maps` (apply Android transparency fix, §12); Deliver flow: `getCurrentPosition()` → map pin → "Is this your delivery address?" → drag/confirm + note → write `destination`, set `fulfilment:"delivery"`, `status:"for_delivery"`.
**Acceptance:** choosing Deliver captures GPS, allows pin adjustment, persists `destination`; the counter never shows an address input.

### Phase 7 — Rider route line + ETA
**Goal:** rider sees route + ETA in-app; can launch external nav (§9).
**Tasks:** rider delivery screen (shop + destination markers); one Routes API call on start → draw polyline + ETA, cache in `routeCache`; **Navigate** button → Google Maps/Waze; enforce compute-once.
**Acceptance:** starting a delivery draws a single cached route + ETA (verify only one Routes call in logs); Navigate opens the external app to the correct destination.

### Phase 8 — Live tracking
**Goal:** customer watches the rider move (§11).
**Tasks:** add `@capacitor-community/background-geolocation` to rider mode (apply Android background config, §12); rider streams position → RTDB; customer map subscribes + animates marker; refresh ETA on a slow timer; delete RTDB node on `completed`.
**Acceptance:** with the rider phone **locked**, the customer still sees the marker move; completing the delivery removes the RTDB node.

### Phase 9 — Hardening & release
**Goal:** production-ready.
**Tasks:** graceful permission-denial handling; Firestore security rules (customers own orders only; staff/admin per role incl. rate/report access; riders only assigned deliveries); Google Cloud budget alert; verify store permission strings; AXE/WCAG AA pass; TestFlight (iOS) + internal testing (Android) with a real rider on a real Naga route.
**Acceptance:** security + accessibility checks pass; a full real-world order (walk-in → link → ready → deliver → track → complete) works end-to-end on physical devices.

### Phase 10 (later) — Rate-based pricing
- Add `rates` collection + admin-only "manage rates" screen; auto-compute price at intake from service/weight (§4.3).

### Phase 11 (later) — Payments
- Integrate PayMongo (GCash-first) alongside cash. Not part of MVP.

---

## 15. Settled decisions (quick reference)

- `best-practices.md` is the authoritative coding standard for all Angular/TS code.
- Dashboard → **Angular 22** (zoneless, full v22 features). Mobile → **latest Ionic-supported Angular** (keep Zone.js); do not force Angular 22 into Ionic until supported.
- One Ionic codebase for customer + rider, gated by role. Dashboard = separate Angular web app (not Electron, not phone).
- Dashboard is a light POS: intake captures service, weight/load, and **price**; it is **built for a busy counter** (fast intake, queue-first, real-time multi-staff, offline-resilient, searchable).
- Pricing: **manual entry at MVP**, rate-based auto-calc in phase 2. Price is bookkeeping only until PayMongo phase; cash changes hands at launch. Rate/report access is admin-only.
- Order sources are a real mix; guest orders are first-class; app is optional until stable.
- Delivery address captured only on the customer's phone, never at the counter. Lookup shows name only, never address.
- Phone stored canonically (`+639XXXXXXXXX`), unique, never the login/OTP method. No SMS OTP at launch.
- Two databases: Firestore (durable) + RTDB (live position only).
- Routes API: compute once per delivery, cache, never per-ping.
- Rider needs a background-geolocation plugin; the official geolocation plugin is foreground-only.

---

*Prices and framework versions reflect current published info (mid-2026) and change often — verify the Ionic→Angular support matrix, Firebase, Google Maps Platform, and PayMongo pricing at project start.*
