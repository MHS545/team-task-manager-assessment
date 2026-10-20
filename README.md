# Teamspace — Team Task Manager

A responsive team workspace built for the supplied Full Stack Development Assessment.

- **Frontend:** React, Tailwind CSS, Vite.
- **Backend:** Node.js, Express, REST API.
- **Authentication:** Passport Local + Express Session, HTTP-only cookies, bcrypt (cost 12).
- **Application database:** Cloud Firestore, a GCP service available on Firebase's free Spark plan.
- **Sessions:** PostgreSQL through connect-pg-simple; memory fallback only in development.
- **Security:** authenticated API routes, creator permissions, strict Zod validation, plain text sanitization, CSRF tokens, origin checks, rate limits, Helmet, and protected credentials.

## Features

Register and sign in; create and manage teams; add existing members; create, assign, edit, complete, reopen, and delete tasks. Search task titles/descriptions and filter by team, assignee, status, or priority. The responsive dashboard includes accessible dialogs, empty states, form errors, and deadline sorting.

All three optional bonuses are included: login-only reminders for assigned tasks due within 3 days (including overdue), creator-only team management, and stored email invitation stubs that recipients can accept or decline after signing in. No SMTP or actual email delivery is used.

## Run locally

Requires Node.js 20.18+ (Node.js 22 recommended), npm, and a Firebase project with a Firestore Standard (default) database.

    npm ci
    node scripts/setup-local.mjs YOUR_FIREBASE_PROJECT_ID

Configure credentials as described in [Firebase setup](docs/FIREBASE.md). Never commit .env or the service account key.

    npm run dev

Open http://localhost:5173. Vite proxies /api to Express on port 3001. Register your own account. There are no shared demo passwords or prepopulated application records.

For a built frontend served by Express:

    npm run build

Set APP_ORIGIN=http://localhost:3001 in .env, then run npm start. Development memory sessions reset on server restart. Connect PostgreSQL by setting DATABASE_URL if persistent local sessions are needed.

## Checks

    npm run check
    npm test
    npm run build

The 80 automated checks exercise registration/login/logout, HTTP-only cookies, CSRF, session regeneration, validation, sanitization, concurrent registration, team isolation, creator permissions, task assignment and CRUD, filters, reminders, invitation acceptance, and rate limiting. Tests use an isolated test double and do not prove a live Firebase or PostgreSQL connection.

GitHub Actions runs these checks for main, feature branches, and pull requests.

## Structure

- client/src/ — React UI, components and API client
- server/ — Express configuration, auth, request schemas, Firestore adapter, workspace service
- test/ — API integration coverage and isolated test store
- scripts/ — local setup, syntax checks, and authenticated GitHub publication
- docs/ — PDF requirements, API, Firebase setup, deployment

## Deployment and submission status

A GCP deployment is required by the PDF. The repository includes a production Dockerfile and [Cloud Run deployment instructions](docs/DEPLOYMENT.md).

The free Firestore database does not replace the required PostgreSQL production session store. Enabling billing for Cloud Run changes Spark to Blaze, and the full deployed stack is not guaranteed to be free.

- GitHub repository: https://github.com/MHS545/team-task-manager-assessment (public).
- Live GCP URL: pending account configuration and deployment.
- Live Firestore verification: successful with the replacement Firebase service account key on 2026-10-20.
- Production PostgreSQL sessions: Neon Free connected; live CSRF/session creation and secure cookie checks passed on 2026-10-20.

The actual status must be updated after external setup. Do not submit placeholders or describe local checks as cloud deployment.

## Version control

The repository is developed on genuine feature branches and merged with merge commits. Inspect it with:

    git log --graph --oneline --all

The repository is public. Keep the feature branches and merge history on GitHub so the assessor can inspect development history.

See [requirements mapping](docs/REQUIREMENTS.md), [API contract](docs/API.md), and [deployment guide](docs/DEPLOYMENT.md).

## Alternative hosting: Vercel

Vercel deployment support is included. See [Vercel setup](docs/VERCEL.md). This alternative does not satisfy the PDF's Google Cloud hosting requirement. Live Vercel URL: https://team-task-manager-eta-two.vercel.app. Deployed in the owner-verified MHS Hobby account. Live frontend, static assets, session API, secure cookies, and signed-out workspace API guards passed checks. Firestore read access was verified. The later full audit passed 11 live workflow checks including registration, login, teams, tasks, filters, permissions, invitations and logout; temporary audit records were removed. See [full audit results](docs/ASSESSMENT-AUDIT.md).

## Full audit and broader tests

See [the requirement-by-requirement audit](docs/ASSESSMENT-AUDIT.md). Run npm run test:browser:audit for the expanded local Chrome checks. The opt-in live runner is npm run test:live -- --run-live and requires authorized Firebase credentials for scoped cleanup. Heavy tests remain local. The latest fixes, deployment configuration and audit tests are included in the assessment-audit publication and its Git history.
