# Google Cloud deployment

The assessment requires a deployed version on GCP. Local build success and a GitHub repository do not satisfy deployment.

## Cost and account prerequisites

The Firestore Spark database can be used within its free quotas without billing. Deploying this Express server to Cloud Run requires a Google Cloud project with billing enabled; usage may fit Cloud Run's free allowance but builds, image storage, secrets, networking and PostgreSQL have separate costs. Cloud SQL does not provide a permanent free PostgreSQL instance. A free-tier claim must not be made for the whole stack.

Enabling billing changes a Firebase project from Spark to Blaze. Do not enable billing or create billable infrastructure without the project owner's approval. Budget alerts do not impose a hard spending limit.

Required: GCP project and region, Firestore default database, PostgreSQL endpoint, strong SESSION_SECRET, Google Cloud CLI, and deployment permissions. The application accepts any PostgreSQL session database; use Cloud SQL if all storage must remain on GCP.

## PostgreSQL session storage

Set DATABASE_URL using a database role permitted to create the user_sessions table, or precreate it with connect-pg-simple's table schema and grant the role access. The store creates the table and index automatically on first use. Production refuses to start without DATABASE_URL and never falls back to memory.

For a remote TLS endpoint, set PG_SSL=true. Certificate validation remains enabled. If the server requires a private CA, supply its PEM certificate as PG_CA_BASE64. For Cloud SQL's authenticated Unix socket on Cloud Run, use the socket path and leave PG_SSL=false.

Example Cloud SQL socket connection string (URL-encode password characters):

    postgresql://DB_USER:ENCODED_PASSWORD@localhost/DB_NAME?host=/cloudsql/PROJECT_ID:REGION:INSTANCE

Provision the database through your chosen provider. Store DATABASE_URL and SESSION_SECRET in Secret Manager and grant only the runtime service account access to those two secrets. Never put their values in a GitHub workflow, source file, or deployment command history.

## Cloud Run

1. Authenticate Google Cloud CLI and select the intended project.
2. Enable Cloud Run, Artifact Registry, Cloud Build, Firestore, and Secret Manager APIs.
3. Create a dedicated runtime service account. Grant roles/datastore.user for Firestore. For Cloud SQL, also grant roles/cloudsql.client. Grant secret accessor on the two individual secrets.
4. Deploy from this folder. The Dockerfile builds Vite and serves the frontend and API from one origin.
5. Use your own values for the placeholders below. This is an example, not an executed deployment:

   gcloud run deploy teamspace --source . --region REGION --service-account RUNTIME_SERVICE_ACCOUNT --allow-unauthenticated --min-instances 0 --max-instances 2 --memory 512Mi --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT=PROJECT_ID,APP_ORIGIN=https://EXPECTED_SERVICE_URL --set-secrets SESSION_SECRET=teamspace-session-secret:latest,DATABASE_URL=teamspace-database-url:latest

For Cloud SQL, add --add-cloudsql-instances PROJECT_ID:REGION:INSTANCE and configure the socket URL secret first.

The public service URL allows the login screen to load; Express requires a session for all workspace APIs. Do not use an organization-private Cloud Run URL for the assessment unless the assessor has access.

If the URL is not known before first deployment, start with an HTTPS placeholder for APP_ORIGIN, obtain the returned Cloud Run URL, then set APP_ORIGIN to that exact origin before using login. Origin protection will reject mutations from a different URL.

    gcloud run services update teamspace --region REGION --update-env-vars APP_ORIGIN=https://ACTUAL_SERVICE_URL

Use GOOGLE_APPLICATION_CREDENTIALS only for local development. On Cloud Run, the Admin SDK uses the assigned runtime service account.

## Verify the live service before submission

- Register two users, create a team, add/invite the other user, and create and assign tasks.
- Search and filter tasks; edit status and due dates.
- Sign out and confirm workspace API calls return 401.
- Confirm a third account cannot access the other team's records.
- Restart/redeploy an instance and confirm existing sessions remain valid via PostgreSQL.
- Confirm cookies are HttpOnly, Secure, and SameSite=Lax in the browser.
- Check Firestore records, PostgreSQL session records, and Cloud Run logs without logging secrets.
- Replace the pending links in README.md with the actual deployed and repository URLs.
- The user sends those two verified URLs to the assessor on Indeed.

No GCP deployment or PostgreSQL connection is considered verified until these external services are actually configured and checked.
