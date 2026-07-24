// Generates Angular environment.ts files from the repo-root .env.
// Angular does not read .env natively, so this bridges the two.
// Run via `npm run config` (also runs automatically before build/start).
//
// The generated environment.ts files are git-ignored; only the *.example.ts
// templates are committed.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const envPath = join(repoRoot, '.env');

if (!existsSync(envPath)) {
  console.error(
    '\n[generate-env] No .env file found at repo root.\n' +
      '  Copy .env.example to .env and fill in your Firebase values, then re-run.\n',
  );
  process.exit(1);
}

/** Minimal .env parser: KEY=VALUE per line, ignores blanks and # comments. */
function parseEnv(contents) {
  const env = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = parseEnv(readFileSync(envPath, 'utf8'));

const required = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`\n[generate-env] Missing required keys in .env: ${missing.join(', ')}\n`);
  process.exit(1);
}

const firebase = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID,
  measurementId: env.FIREBASE_MEASUREMENT_ID ?? '',
  databaseURL: env.FIREBASE_DATABASE_URL ?? '',
};

function fileContents(production) {
  return (
    '// AUTO-GENERATED from repo-root .env by scripts/generate-env.mjs.\n' +
    '// Do not edit by hand and do not commit — this file is git-ignored.\n' +
    `export const environment = {\n` +
    `  production: ${production},\n` +
    `  firebase: ${JSON.stringify(firebase, null, 4).replace(/\n/g, '\n  ')},\n` +
    `};\n`
  );
}

const targets = [
  { dir: join(repoRoot, 'apps/mobile/src/environments'), file: 'environment.ts', prod: false },
  { dir: join(repoRoot, 'apps/mobile/src/environments'), file: 'environment.prod.ts', prod: true },
  { dir: join(repoRoot, 'apps/dashboard/src/environments'), file: 'environment.ts', prod: false },
];

for (const { dir, file, prod } of targets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), fileContents(prod), 'utf8');
  console.log(`[generate-env] wrote ${join(dir, file)}`);
}

console.log('[generate-env] done.');
