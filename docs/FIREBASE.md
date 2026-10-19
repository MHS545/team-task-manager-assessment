# Free Cloud Firestore setup

Use Cloud Firestore Standard edition on Firebase's Spark plan. Do not add a billing account if you want the Spark limits instead of usage charges.

## Create the project

1. Sign in at https://console.firebase.google.com/ with your Google account.
2. Create a project named Team Task Manager. Google Analytics is optional; leave it disabled for this assessment.
3. Record the project ID shown in Project settings. This is different from the display name.
4. Under Build > Firestore Database, create the (default) database in Standard edition.
5. Choose a supported location near your users. The location cannot be changed for that database.
6. Start in production mode. Deploy the deny-all client rules included here; the server uses the Admin SDK and its IAM identity.
7. Keep the billing plan as Spark.

Default database free quota: 1 GiB stored data; 50,000 reads, 20,000 writes and 20,000 deletes per day. One database per project qualifies. Check current official limits:
https://firebase.google.com/docs/firestore/quotas
https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Local server credentials

Preferred when Google Cloud CLI is available:

    gcloud auth application-default login
    gcloud auth application-default set-quota-project YOUR_PROJECT_ID

Run local setup, then remove GOOGLE_APPLICATION_CREDENTIALS from .env if using ADC instead of a key.

Alternative for this Windows setup:

1. Firebase Project settings > Service accounts > Firebase Admin SDK > Generate new private key.
2. Save the JSON in .secrets/firebase-admin.json inside this project. That directory is ignored by Git and container builds.
3. Run: node scripts/setup-local.mjs YOUR_PROJECT_ID
4. The generated .env points to the local private key.
5. Run npm run dev, then open http://localhost:5173.

Never paste the private key into chat or put it under client/. Never commit it. Do not use a Firebase browser API key in place of Admin SDK credentials.

The application creates records on first use; no paid database features or seeding are required. Firebase Authentication is not used: the assessment requires Passport + Express Session and bcrypt.

## Rules

With an authenticated Firebase CLI:

    npx firebase-tools@15.34.0 deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID

The included rules deny all direct browser access. Server Admin SDK access is controlled by IAM, not these rules.

## Development without a cloud database

Use the official Firestore emulator if Java 21+ is installed:

    npx firebase-tools@15.34.0 emulators:start --only firestore --project demo-teamspace

In .env set GOOGLE_CLOUD_PROJECT=demo-teamspace and FIRESTORE_EMULATOR_HOST=127.0.0.1:8080, and remove GOOGLE_APPLICATION_CREDENTIALS. Run npm run dev in another terminal. Emulator data is temporary unless exported. This is for development and does not prove a live GCP deployment.

The integration suite uses an isolated in-memory test double, not a cloud database. Production startup always uses the Firestore adapter.
