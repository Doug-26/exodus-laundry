// Seed the initial price list (Phase 10). Writes to the `rates` collection, which
// the security rules restrict to admins — so this signs in with an ADMIN account.
//
//   npm run seed:rates -- <adminEmail> <adminPassword>
//
// Seeds Wash & Fold (₱180 covers 5kg, then ₱40/kg above). Other services are set
// on the dashboard's Manage rates screen. Re-running is idempotent (overwrites).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

// service → { baseKg, baseAmount, perKg, active }
const RATES = {
  wash_fold: { baseKg: 5, baseAmount: 180, perKg: 40, active: true },
};

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run seed:rates -- <adminEmail> <adminPassword>');
  process.exit(1);
}

const envPath = join(repoRoot, '.env');
if (!existsSync(envPath)) {
  console.error('[seed-rates] No .env at repo root.');
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
const db = getFirestore(app);

try {
  await signInWithEmailAndPassword(auth, email, password);
  for (const [service, r] of Object.entries(RATES)) {
    await setDoc(doc(db, 'rates', service), { service, ...r });
    console.log(`[seed-rates] ${service}: base ${r.baseKg}kg @ ₱${r.baseAmount}, ₱${r.perKg}/kg above`);
  }
  console.log('[seed-rates] Done.');
  process.exit(0);
} catch (err) {
  console.error('[seed-rates] Failed:', err?.message ?? err);
  process.exit(1);
}
