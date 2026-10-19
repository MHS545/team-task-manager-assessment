# Assessment requirements

Source: v2 Full Stack Development Assessment.pdf, read from the supplied path.

| PDF requirement                                   | Implementation target                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| React + Tailwind CSS + Vite                       | client/ and Vite build                                                                |
| Login/register forms                              | Auth screen                                                                           |
| Responsive dashboard with teams and tasks         | Workspace screen                                                                      |
| Task create/update modal                          | Task dialog                                                                           |
| Task search and filters by team or assignee       | Workspace filters and GET /api/tasks                                                  |
| Node.js + Express REST CRUD                       | server/routes/                                                                        |
| PassportJS + Express Session                      | server/app.js                                                                         |
| PostgreSQL sessions, memory fallback in dev       | connect-pg-simple; production requires DATABASE_URL                                   |
| HTTP-only cookies                                 | Express session configuration                                                         |
| Protect all non-auth routes                       | Authenticated API router and gated dashboard                                          |
| Database service on GCP                           | Cloud Firestore via Firebase Admin SDK                                                |
| Git and GitHub with branches or PRs               | Actual feature branches and merge commits; remote publication requires account access |
| Auth middleware, validation, sanitization, bcrypt | Server middleware and request schemas                                                 |
| Optional: login-only due date reminders           | Authenticated reminders API and dashboard                                             |
| Optional: role based access                       | Creator-only team management                                                          |
| Optional: email invitation stub                   | Stored invitation and authenticated accept flow; no SMTP                              |
| Setup instructions                                | README.md and docs/                                                                   |
| Deployed version on GCP                           | Dockerfile + Cloud Run deployment instructions; deployment needs GCP credentials      |
| Submit deployed and GitHub links on Indeed        | User submits after actual deployment; no automatic message                            |

Firestore's free Spark tier covers application records. It does not replace PostgreSQL for production sessions. Cloud Run, Cloud SQL, builds, networking, and secrets have separate billing and quotas; this project must not be described as a fully free deployed stack without checking those resources.

The PDF says “PasswortJS”; this is interpreted as PassportJS from the context.
