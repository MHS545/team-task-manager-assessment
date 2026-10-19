import { randomBytes } from 'node:crypto';
export function getConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (production && !env.DATABASE_URL)
    throw new Error(
      'DATABASE_URL is required in production: the assessment requires PostgreSQL sessions.',
    );
  if (production && env.FIRESTORE_EMULATOR_HOST)
    throw new Error('The Firestore emulator cannot be used in production.');
  if (
    env.SESSION_SECRET &&
    (env.SESSION_SECRET.length < 32 || env.SESSION_SECRET.startsWith('replace-'))
  )
    throw new Error('Generate a random SESSION_SECRET with at least 32 characters.');
  if (production && !env.SESSION_SECRET)
    throw new Error('SESSION_SECRET is required in production.');
  if (production && (!env.APP_ORIGIN || !env.APP_ORIGIN.startsWith('https://')))
    throw new Error('APP_ORIGIN must be the public HTTPS URL in production.');
  const origins = (env.APP_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => new URL(value.trim()).origin);
  if (production && origins.some((origin) => !origin.startsWith('https://')))
    throw new Error('Every production APP_ORIGIN must use HTTPS.');
  return {
    production,
    origins,
    port: Number(env.PORT || 3001),
    sessionSecret: env.SESSION_SECRET || randomBytes(48).toString('hex'),
    databaseUrl: env.DATABASE_URL,
    projectId: env.GOOGLE_CLOUD_PROJECT,
    pgSsl:
      env.PG_SSL === 'true'
        ? {
            rejectUnauthorized: true,
            ...(env.PG_CA_BASE64
              ? { ca: Buffer.from(env.PG_CA_BASE64, 'base64').toString('utf8') }
              : {}),
          }
        : undefined,
  };
}
