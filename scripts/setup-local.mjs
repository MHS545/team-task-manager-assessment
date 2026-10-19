import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
const projectId = process.argv[2];
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId || ''))
  throw new Error('Usage: node scripts/setup-local.mjs YOUR_FIREBASE_PROJECT_ID');
if (existsSync('.env'))
  throw new Error(
    '.env already exists. Edit it explicitly; setup never overwrites your configuration.',
  );
writeFileSync(
  '.env',
  [
    'NODE_ENV=development',
    'PORT=3001',
    'APP_ORIGIN=http://localhost:5173,http://127.0.0.1:5173',
    'SESSION_SECRET=' + randomBytes(48).toString('hex'),
    'GOOGLE_CLOUD_PROJECT=' + projectId,
    '# Put the local private key at .secrets/firebase-admin.json, or configure ADC.',
    'GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-admin.json',
    'DATABASE_URL=',
    'PG_SSL=false',
    '',
  ].join('\n'),
  { flag: 'wx' },
);
console.log(
  'Created ignored .env with a random session secret. Configure credentials before starting.',
);
