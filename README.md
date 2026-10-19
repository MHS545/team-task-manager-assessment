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

The 14 automated checks exercise registration/login/logout, HTTP-only cookies, CSRF, session regeneration, validation, sanitization, concurrent registration, team isolation, creator permissions, task assignment and CRUD, filters, reminders, invitation acceptance, and rate limiting. Tests use an isolated test double and do not prove a live Firebase or PostgreSQL connection.

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

- GitHub repository: https://github.com/MHS545/team-task-manager-assessment (private).
- Live GCP URL: pending account configuration and deployment.
- Live Firestore verification: pending Google authorization.
- Production PostgreSQL sessions: pending DATABASE_URL and verification.

The actual status must be updated after external setup. Do not submit placeholders or describe local checks as cloud deployment.

## Version control

The repository is developed on genuine feature branches and merged with merge commits. Inspect it with:

    git log --graph --oneline --all

Keep the feature branches on GitHub so the assessor can inspect development history. The publication script creates a **private** repository; invite the assessor or change visibility intentionally before submitting.

See [requirements mapping](docs/REQUIREMENTS.md), [API contract](docs/API.md), and [deployment guide](docs/DEPLOYMENT.md).
