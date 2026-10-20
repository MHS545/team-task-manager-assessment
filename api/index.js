import { getConfig } from '../server/config.js';
import { createFirestoreStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { createVercelHandler } from '../server/vercel-handler.js';

// Vite serves the frontend; this function handles all /api/* routes on the same origin.
const config = getConfig();
const store = createFirestoreStore(config.projectId);
const { app } = createApp({ store, config });
export default createVercelHandler(app);
