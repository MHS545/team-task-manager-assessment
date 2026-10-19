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

Still required externally:

1. Google account authorization and creation of the Firebase project/default database.
2. Admin SDK credentials or Google Application Default Credentials.
3. A production PostgreSQL session database and DATABASE_URL.
4. Authorized GCP deployment and live smoke checks.
5. Grant the assessor access to the private GitHub repository, or intentionally make it public.
6. Submit the verified live and repository links on Indeed.

The UUID overrides keep Google SDK dependencies on the patched CommonJS-compatible 11.x line. The affected SDK packages use the stable v4 API. They avoid an unsafe npm audit force downgrade of firebase-admin. Recheck these overrides when upgrading the SDK.
