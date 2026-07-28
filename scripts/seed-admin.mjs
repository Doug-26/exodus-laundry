// One-time bootstrap of the first admin account.
//
//   npm run seed:admin -- <email> <password> "<Full Name>" <phone>
//   e.g. npm run seed:admin -- owner@exodus.ph Str0ngPass "Shop Owner" 09171234567
//
// Uses the Firebase Web SDK against the live project (works while Firestore is in
// test mode). Creates the auth user if needed, then sets users/{uid}.role = "admin"
// and reserves phoneNumbers/{canonical}. Idempotent-ish: re-running promotes the
// same account. For production, prefer a Firebase Admin SDK script with a service
// account (can set custom claims); this web-SDK version avoids that setup for now.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

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

function toCanonical(raw) {
  const s = String(raw).replace(/[\s\-.()]/g, '');
  let n;
  if (s.startsWith('+63')) n = s;
  else if (s.startsWith('63')) n = `+${s}`;
  else if (s.startsWith('0')) n = `+63${s.slice(1)}`;
  else throw new Error(`Unrecognised PH phone: "${raw}"`);
  if (!/^\+639\d{9}$/.test(n)) throw new Error(`Invalid PH mobile number: "${raw}"`);
  return n;
}

const [email, password, name, phoneRaw] = process.argv.slice(2);
if (!email || !password || !name || !phoneRaw) {
  console.error('Usage: npm run seed:admin -- <email> <password> "<Full Name>" <phone>');
  process.exit(1);
}

const envPath = join(repoRoot, '.env');
if (!existsSync(envPath)) {
  console.error('[seed-admin] No .env at repo root. Fill it in first.');
  process.exit(1);
}
const env = parseEnv(envPath);
const phone = toCanonical(phoneRaw);

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
  let uid;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
    console.log('[seed-admin] Signed in to existing account.');
  } catch (err) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      uid = cred.user.uid;
      console.log('[seed-admin] Created new account.');
    } else {
      throw err;
    }
  }

  await setDoc(doc(db, 'users', uid), {
    role: 'admin',
    name,
    phone,
    fcmTokens: [],
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'phoneNumbers', phone), { uid, createdAt: serverTimestamp() });

  console.log(`[seed-admin] ${email} is now an admin (uid ${uid}, phone ${phone}).`);
  process.exit(0);
} catch (err) {
  console.error('[seed-admin] Failed:', err?.message ?? err);
  process.exit(1);
}
