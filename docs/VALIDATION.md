# Validation record

These checks were run locally on Windows during implementation:

- Server and script syntax: passed.
- API/security integration suite: 14 checks passed.
- Production frontend build: passed (Vite).
- Headless Google Chrome UI flow: passed.
- Desktop (1440 × 1000) and mobile (390 × 844) page overflow checks: passed.
- Desktop dashboard and mobile team/sign-in screenshots: saved locally in ignored .artifacts/.
- Full dependency audit (including build tools): zero reported vulnerabilities after sanitizer, scoped UUID, and Tailwind Vite updates.
- Formatting: checked with Prettier.
- Git feature branches and merge commits: created and pushed to GitHub.

The browser flow exercises account registration, team creation, task creation/editing/completion, search, assignee and priority filters, invitation stubs, mobile navigation, and logout. The API suite also covers authorization boundaries, invalid input, CSRF/origin protection, session fixation protection, cookie attributes, concurrent email registration, reminders, and rate limiting.

The test store is isolated in memory. The default application runtime always uses Cloud Firestore. A passing test does not establish that Google credentials, live database access, a PostgreSQL session connection, or a GCP deployment have been configured.

Original external setup checklist recorded before deployment (see updated status below):

1. Google account authorization and creation of the Firebase project/default database.
2. Admin SDK credentials or Google Application Default Credentials.
3. A production PostgreSQL session database and DATABASE_URL.
4. Authorized GCP deployment and live smoke checks.
5. Grant the assessor access to the private GitHub repository, or intentionally make it public.
6. Submit the verified live and repository links on Indeed.

The UUID overrides keep Google SDK dependencies on the patched CommonJS-compatible 11.x line. The affected SDK packages use the stable v4 API. They avoid an unsafe npm audit force downgrade of firebase-admin. Recheck these overrides when upgrading the SDK.

## Vercel deployment update: 2026-10-20

Firebase setup, replacement service credentials, and the free Neon PostgreSQL session database are now configured. Vercel production deployment is live at https://team-task-manager-eta-two.vercel.app in the verified owner's MHS Hobby account. Build passed on Vercel. The live frontend, static assets, CSRF/session creation, Secure/HttpOnly cookies, and signed-out workspace API restrictions passed checks. Live Firestore read access passed. No production test accounts were created, and registration/task CRUD were not exercised in production. See VERCEL.md for details. Google Cloud hosting, complete live user workflow checks, assessor repository access, and Indeed submission remain pending.

## Full assessment audit: 2026-10-20

The current results supersede earlier pending workflow checks: 80 API/client tests passed; the original Chrome workflow and 11 expanded browser checks passed across seven screen widths; 11 live workflow checks passed and all temporary audit records were removed. The local load exercise completed 2,000 task requests with 20 concurrent workers and no failed requests. Dependency audit reported zero known vulnerabilities. Four application/deployment issues were corrected. See [the full assessment audit](ASSESSMENT-AUDIT.md) for evidence, timings, limitations and remaining GCP/GitHub/submission work.

## GitHub publication update

The assessment-audit update publishes the latest tested source, Vercel configuration, regression/browser/live test runners and full PDF audit to https://github.com/MHS545/team-task-manager-assessment. Repository visibility was verified as public; no visibility change was made. Local credential files, generated assets, test-run artifacts and unrelated tool-installed files are excluded from the publication.
