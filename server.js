'use strict';

const http = require('node:http');
const path = require('node:path');
const { createApp } = require('./backend/src/app');
const { readConfig } = require('./backend/src/config/env');

function createServer(options = {}) {
  const app = createApp(options);
  const server = http.createServer(app);
  server.on('close', () => {
    if (app.locals.stopScheduler) app.locals.stopScheduler.stop();
    app.locals.storePromise
      .then((store) => store.close())
      .catch((error) => console.error('VETO could not close its data store cleanly.', error));
  });
  return server;
}

if (require.main === module) {
  const config = readConfig();
  const port = config.port;
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    const mode = process.env.STORAGE_DRIVER || process.env.VETO_STORE || 'sqlite';
    console.log(`VETO is running at http://127.0.0.1:${port}`);
    console.log(`Decision storage mode: ${mode}`);
    if (mode === 'sqlite') {
      console.log(`SQLite database: ${process.env.VETO_DB_PATH || path.join(__dirname, 'data', 'veto.sqlite')}`);
    } else if (mode === 'json') {
      console.log(`JSON file: ${process.env.VETO_JSON_PATH || path.join(__dirname, 'data', 'decisions.json')}`);
    }
  });
}

module.exports = { createApp, createServer };
