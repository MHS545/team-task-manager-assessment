import 'dotenv/config';
import { getConfig } from './config.js';
import { createFirestoreStore } from './store.js';
import { createApp } from './app.js';

try {
  const config = getConfig();
  const store = createFirestoreStore(config.projectId);
  const { app, close } = createApp({ store, config });
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log('Teamspace API listening on port ' + config.port);
    if (!config.databaseUrl)
      console.log('Development: sessions are in memory and reset on restart.');
  });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      server.close(async () => {
        await close();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    });
} catch (error) {
  console.error('Startup failed:', error.message);
  process.exit(1);
}
