# Vercel deployment

Live application: https://team-task-manager-eta-two.vercel.app

Verified account: mhs033840-3959; MHS team mhs-abec; Vercel Hobby. Application records use Firebase Spark and login sessions use Neon Free. No paid upgrades were enabled. Provider usage limits still apply.

Vercel hosting does not satisfy the PDF's mandatory Google Cloud application-hosting requirement. See [the full assessment audit](ASSESSMENT-AUDIT.md).

## Layout

Deploy the repository root. vercel.json selects Vite, runs npm run build and publishes dist/ to Vercel's CDN. api/index.js exports the Express API handler. Requests under /api are rewritten to the API function. server/vercel-handler.js strips the platform's path-routing metadata before Express parses query filters. The frontend and backend use the same origin and secure session cookies.

Generated public/, dist/, credentials, local environment files and test artifacts are excluded from uploads. Avoid uploading old generated asset files; Vercel builds the frontend itself. Local development and Cloud Run continue to use server/index.js and the existing Dockerfile.

## Server environment variables

| Variable                      | Value                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                      | production (provided by the production runtime)                                                                       |
| APP_ORIGIN                    | https://team-task-manager-eta-two.vercel.app                                                                          |
| SESSION_SECRET                | Stable random server secret with at least 32 characters; sensitive                                                    |
| GOOGLE_CLOUD_PROJECT          | team-task-manager-ac816                                                                                               |
| FIREBASE_SERVICE_ACCOUNT_JSON | Complete authorized Firebase Admin JSON; sensitive                                                                    |
| DATABASE_URL                  | PostgreSQL connection string supplied by Neon integration; sensitive                                                  |
| PG_SSL                        | Optional explicit TLS configuration for providers that require it; do not conflict with connection-string TLS options |

Never expose secret values in source, chat, screenshots or VITE_ variables. Never point GOOGLE_APPLICATION_CREDENTIALS at a Windows path inside a Vercel deployment. Do not set FIRESTORE_EMULATOR_HOST in production.

## Checks and publication

Run npm run check, npm test, npm run build, npm run test:browser and npm run test:browser:audit locally. Confirm vercel whoami is the intended owner before changing credentials or deploying. Check .vercel/project.json belongs to the intended MHS team.

Use `vercel deploy --prod --skip-domain --scope mhs-abec` to create a production-environment deployment for checking before switching the public address. Protected deployment previews require the owner's authenticated Vercel access. Publish the production alias only after checking the frontend, current generated assets and API.

Automatic GitHub linking remains pending a GitHub login connection in Vercel; the current deployment was uploaded directly from the local project. The latest source changes and audit tests are included in the GitHub assessment-audit update.

## Audit status: 2026-10-20

The latest deployed application passed 11 live workflow checks: registration, browser login/reload, teams and roles, task CRUD/assignment/search/filters, reminders, safe member removal, invitation stub acceptance, responsive dashboard, CSRF/secure cookies, deletion and logout guards. Temporary audit accounts and records were removed. The local suite passed 80 tests and the 2,000-request isolated load exercise. See ASSESSMENT-AUDIT.md for exact scope and limitations.
