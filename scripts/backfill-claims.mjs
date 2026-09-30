// One-off: give every existing account its `role` custom claim (Phase 14).
//
//   npm run backfill:claims -- <adminEmail> <adminPassword>
//
// Why this is needed: Storage and RTDB rules cannot read Firestore, so they gate
// on request.auth.token.role. The syncRoleClaim function keeps that claim in step
// with users/{uid}.role, but it only fires on writes — accounts created before
// Phase 14 would never get one, and staff would keep failing proof-photo uploads.
//
// This calls the admin-gated backfillRoleClaims callable, so it needs no
// service-account key: it signs in as an admin with the client SDK, exactly like
// seed-rates. Safe to re-run — accounts whose claim already matches are skipped.
//
// AFTER RUNNING: each affected user must sign out and back in (or wait up to an
// hour) before the new claim appears on their ID token.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run backfill:claims -- <adminEmail> <adminPassword>');
  process.exit(1);
}

const envPath = join(repoRoot, '.env');
if (!existsSync(envPath)) {
  console.error('[backfill-claims] No .env at repo root.');
  process.exit(1);
}
const env = parseEnv(envPath);

const app = initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID,
});
const auth = getAuth(app);

try {
  await signInWithEmailAndPassword(auth, email, password);
  // Callables live in us-central1 (see functions/src/index.ts).
  const backfill = httpsCallable(getFunctions(app, 'us-central1'), 'backfillRoleClaims');
  const { data } = await backfill({});
  console.log('[backfill-claims]', data);
  console.log('[backfill-claims] Done. Affected users must sign out and back in.');
  process.exit(0);
} catch (err) {
  console.error('[backfill-claims] Failed:', err?.message ?? err);
  process.exit(1);
}
