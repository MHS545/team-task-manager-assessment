# Full assessment audit and test results

Audit date: 2026-10-20.

Assessment source: `C:\Users\Public\Downloads\v2 Full Stack Development Assessment.pdf`, extracted and read in full during this audit.

Application: https://team-task-manager-eta-two.vercel.app

## Result

The implemented application passed the executed local and live functional/security checks after the fixes below. It is **not 100% compliant with the PDF submission requirements**: hosting is on Vercel, whereas the PDF explicitly requires a deployed version on Google Cloud Platform. The deployment/audit changes and tests are included in the GitHub assessment-audit update. The repository is public at publication time. Indeed submission has not been performed.

No paid plan was enabled. Heavy testing used an isolated in-memory database on the local computer. Live testing used a small set of unique temporary records and removed them afterward.

## Requirement-by-requirement review

| PDF requirement                             | Result                           | Evidence                                                                                                                  |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Register securely                           | PASS                             | Local registration/hash/duplicate tests; real live API registration with unique audit accounts                            |
| Login securely                              | PASS                             | Passport Local, bcrypt; local and real browser login; logout and session replay checks                                    |
| Create and manage teams                     | PASS                             | API and browser creation/editing; live rename/delete checks                                                               |
| Add team members                            | PASS                             | Local and live membership checks; duplicates and team size limits                                                         |
| Create, assign and manage tasks             | PASS                             | API create/read/update/delete, assignee validation, real cloud round trip                                                 |
| Filter tasks by team                        | PASS                             | Local UI/API and live API filter checks                                                                                   |
| Filter tasks by assignee                    | PASS                             | Local UI/API and live API filter checks                                                                                   |
| React, Tailwind CSS and Vite                | PASS                             | package.json, vite.config.js, client/src; local and Vercel builds                                                         |
| Login/register forms                        | PASS                             | Original Chrome registration flow; expanded login flow; live browser login                                                |
| Dashboard with team/task lists              | PASS                             | Local Chrome and live dashboard checks                                                                                    |
| Create/update task modal                    | PASS                             | Original Chrome flow; required-title validation; keyboard focus/Escape checks                                             |
| Task search                                 | PASS                             | Combined local filters and live title/description search                                                                  |
| Responsive UI                               | PASS for tested sizes            | 320, 360, 390, 768, 1024, 1440 and 1920 pixel widths; local screenshots; live desktop/mobile screenshots                  |
| Node.js and Express                         | PASS                             | server/app.js and deployed api/index.js adapter                                                                           |
| REST auth/team/task routes                  | PASS                             | Routes use the documented /api base prefix; CRUD and negative cases tested                                                |
| Backend validation                          | PASS                             | Strict Zod schemas; malformed JSON, oversized payloads, invalid IDs/dates/enums/properties rejected                       |
| PassportJS and Express Session              | PASS                             | server/app.js; real live login and session reload                                                                         |
| PostgreSQL session storage                  | PASS for exercised operations    | connect-pg-simple in production; live login/session/cookie/logout checks using configured Neon PostgreSQL                 |
| Development memory fallback                 | PASS                             | Isolated local integration/browser tests use the development-style memory session store                                   |
| HTTP-only cookies                           | PASS                             | Local production-cookie test; live HttpOnly, Secure and SameSite=Lax assertions                                           |
| Protect non-auth routes                     | PASS for application APIs        | Signed-out and cross-team API denials; the static HTML shell remains public so login can render                           |
| Database service available on GCP           | PASS                             | Actual Cloud Firestore on Firebase Spark; live workflow records and direct scoped cleanup verified                        |
| Git and GitHub with branching or PR history | PASS                             | Genuine feature/merge history and the assessment-audit update are published to the public GitHub repository               |
| Authentication middleware                   | PASS                             | Signed-out requests rejected; current membership and creator checks tested                                                |
| Input sanitization                          | PASS                             | Script/HTML stripping, blank-after-sanitization rejection, unknown-property/prototype injection checks                    |
| Bcrypt password storage                     | PASS                             | Cost-12 hash checks; no hashes returned in public user responses; login byte-limit regression fixed                       |
| Optional: login-only due-date reminders     | PASS                             | Overdue/today/+3-day boundaries, completion exclusion, assignee isolation; real live reminder flow                        |
| Optional: role-based access                 | PASS                             | Non-creators cannot manage/delete teams; outsiders cannot read/edit/delete tasks                                          |
| Optional: email invitation stub             | PASS                             | No SMTP/email delivery; duplicate checks, future-user acceptance, recipient-only acceptance/decline; live acceptance flow |
| Working frontend/backend in GitHub          | PASS                             | Working source, Vercel configuration, tests and the full audit are included in the assessment-audit update                |
| Setup instructions                          | PASS                             | README.md, FIREBASE.md, API.md, DEPLOYMENT.md, VERCEL.md                                                                  |
| Deployed version on Google Cloud Platform   | NOT MET                          | Deployment is on Vercel. Firestore on GCP does not satisfy hosting the application on GCP                                 |
| Send deployed/repository links on Indeed    | NOT DONE                         | No message sent; this requires the user's explicit instruction                                                            |
| Complete within 72 hours of receipt         | NOT VERIFIED                     | The assessment receipt time was not provided                                                                              |
| Code neatness/ease of understanding         | REVIEWED, subjective             | Separate validation/service/store/API/UI modules and formatted changes; evaluator judgment remains                        |
| Reading/comprehension and time management   | Not an automated pass/fail claim | Requirements were mapped explicitly; these are evaluator criteria                                                         |

The PDF's “PasswortJS” is interpreted as PassportJS. Joi/express-validator are examples; Zod supplies the requested validation behavior. The /api prefix is documented and used consistently by the frontend.

## Tests executed

| Check                                          | Result                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| npm run check                                  | PASS                                                                                                              |
| npm test                                       | 80 tests passed, 0 failed, 0 skipped                                                                              |
| npm run build                                  | PASS                                                                                                              |
| npm run test:browser                           | PASS: registration, team/task dialogs, edit/complete, search/filters, invitations, mobile navigation and logout   |
| npm run test:browser:audit                     | 11 checks passed, including keyboard focus, seven widths, role controls, network recovery and 401 expiry handling |
| Capped production workflow audit               | 11 checks passed; 44 counted workflow API calls plus browser and cleanup traffic                                  |
| npm audit                                      | 0 reported vulnerabilities at audit time, including development dependencies                                      |
| Targeted secret-file/private-key-marker review | No credential files tracked and no private-key marker found in the reviewed non-generated source                  |
| Vercel production build and preview checks     | PASS after correcting frontend packaging and rewrite metadata                                                     |

### Local load exercise

- 500 tasks created, read, updated and deleted: **2,000 task requests**.
- **20 concurrent workers** using one isolated authenticated session.
- **0 request failures** and post-run task count verified as zero.
- Final observed duration: **4,582 ms**; approximately **437 requests/second**.
- Observed request latency: p50 **46 ms**, p95 **76 ms**, p99 **84 ms**.

These measurements are specific to this machine and the in-memory test store. They do not predict Firestore, PostgreSQL or Vercel capacity, and they do not certify a supported production user count. No cloud stress test was performed.

### Production test isolation and cleanup

The live runner is opt-in with `--run-live`, caps its explicit workflow requests, creates uniquely named `audit-...@example.com` identities, and records only IDs returned for its own new records. Cleanup verifies ownership/email identity before deleting those records and their email indexes. All three accounts and the test team/task/invitation records from the final run were removed. Earlier failed-run temporary records were also cleaned up. Existing user accounts and application records were not inspected or changed.

Browser/API checks use real Firebase and PostgreSQL on the live site. Multi-region failover, forced infrastructure restarts, exhaustive penetration testing, all browser engines, all accessibility criteria, and long-duration soak testing were not performed. Passing these checks is not a guarantee that every possible defect has been eliminated.

## Issues found and fixed

1. **Login accepted a password suffix beyond bcrypt's 72-byte limit.** Login now rejects input over the same UTF-8 byte limit used during registration. The regression test first reproduced authentication with an overlong input, then passed after correction.
2. **Narrow-screen horizontal overflow.** An absolutely positioned hidden table label escaped its scroll container. A relative containing block on `.task-table-wrap` corrected the overflow at all seven tested widths.
3. **Vercel generated-asset packaging.** The native Express/public-output setup could lose or reference stale generated assets. Vercel now uses its Vite build with `dist/` plus a separate Node API function. Generated `public/` output is excluded from uploads.
4. **Vercel rewrite parameters broke task filters.** The platform adds routing metadata to the query. `server/vercel-handler.js` removes that metadata and lets Express parse the actual remaining query before strict validation. Dedicated tests preserve duplicate/unknown filters and HTTP methods/bodies. The real live filter check passed after this fix.

A test-only assumption about email case was corrected because registration correctly normalizes email addresses. An asynchronous browser-test race was corrected without changing the application's session behavior. Initial failed results were retained where useful; final pass counts refer to the final successful runs.

## Evidence files

- [Final API/client test log](../.artifacts/api-tests-final.txt)
- [Local load measurements](../.artifacts/load-results.json)
- [Expanded browser results](../.artifacts/browser-audit-results.json)
- [Live workflow and cleanup results](../.artifacts/live-audit-results.json)
- [Dependency audit](../.artifacts/dependency-audit.json)
- [320-pixel screenshot](../.artifacts/audit-width-320.png)
- [Live desktop screenshot](../.artifacts/live-desktop.png)
- [Live mobile screenshot](../.artifacts/live-mobile.png)

Evidence is local under ignored .artifacts/; it is not automatically published to GitHub or the website.

## Reproduce

```powershell
npm ci
npm run check
npm test
npm run build
npm run test:browser
npm run test:browser:audit
```

Browser tests require an installed Chrome browser. All commands above use isolated local test data and do not need cloud credentials. For the opt-in live runner, use the owner's authorized Firebase Admin credential through GOOGLE_APPLICATION_CREDENTIALS and run `npm run test:live -- --run-live`. The runner is specific to this project and must not be repointed at another application without reviewing its ownership and cleanup guards.

## Submission work remaining

1. Resolve the mandatory GCP-hosting requirement with the assessor or deploy to GCP under separately approved account/billing constraints. This audit did not enable billing.
2. GitHub publication: completed through the assessment-audit branch/pull request; preserve its history.
3. Repository visibility is public; provide its URL to the assessor.
4. Submit the verified deployment/repository links on Indeed when explicitly instructed.

Vercel's supported Vite/API function layout is documented in [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) and [Node.js functions](https://vercel.com/docs/functions/runtimes/node-js).
