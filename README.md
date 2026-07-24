# Exodus Laundry

Laundry service platform for Naga City: order, get notified when ready, choose pickup or
delivery, and track the rider live. Three front-ends over one Firebase backend.

See [laundry-app-plan.md](laundry-app-plan.md) for the full build specification and
[best-practices.md](best-practices.md) for the coding standard.

## Monorepo layout

```
exodus-laundry/
├── apps/
│   ├── mobile/       Ionic + Angular 20 + Capacitor (customer + rider, gated by role)
│   └── dashboard/    Angular 22 web app (shop staff / admin), zoneless
├── libs/
│   └── shared/       Shared TypeScript: data models, phone util, Firebase access
├── functions/        Firebase Cloud Functions (implemented from Phase 5)
└── scripts/          Tooling (generate-env.mjs)
```

Managed with **npm workspaces**. Both apps import shared code via `@exodus/shared`.

## First-time setup

```bash
# 1. Install all workspace dependencies (from the repo root)
npm install

# 2. Create your local Firebase config
cp .env.example .env          # then fill in the values from the Firebase console

# 3. Generate the Angular environment files from .env
npm run config
```

> `.env` and the generated `src/environments/environment.ts` files are **git-ignored**.
> The committed `*.example.ts` files document the expected shape. `npm run config` also
> runs automatically before every `start`/`build`.

## Running

```bash
# Shop dashboard (Angular 22)
npm start -w @exodus/dashboard         # http://localhost:4200

# Mobile app (Ionic)
npm start -w @exodus/mobile            # http://localhost:4200  (or: ionic serve)
```

## Testing

```bash
npm run test:shared                    # phone util + shared library (Jest)
```

## Tech stack

| Area | Choice |
|---|---|
| Mobile | Ionic 8, Angular 20, Capacitor 8 (keeps Zone.js) |
| Dashboard | Angular 22 (zoneless) |
| Backend | Firebase: Auth, Firestore, Realtime Database, Cloud Functions, FCM, Hosting |
| Region | `asia-southeast1` (Singapore) — closest to Naga City |
