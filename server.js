'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { createDecisionStore, validateDecision, StoreError } = require('./stores/decision-store');

const WEB_ROOT = path.join(__dirname, 'Html');
const MAX_BODY_BYTES = '256kb';

function createApp(options = {}) {
  const storePromise = options.store
    ? Promise.resolve(options.store)
    : createDecisionStore({
      mode: options.storeMode || process.env.VETO_STORE || 'sqlite',
      databasePath: options.databasePath,
      jsonPath: options.jsonPath,
      mongoUri: options.mongoUri
    });

  const app = express();
  app.disable('x-powered-by');
  app.locals.storePromise = storePromise;

  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    if (request.path.startsWith('/api/')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.use(express.json({ limit: MAX_BODY_BYTES, strict: true }));

  app.get('/api/health', async (request, response, next) => {
    try {
      const store = await storePromise;
      response.json({ status: 'ok', storage: store.kind });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/decisions', async (request, response, next) => {
    try {
      const store = await storePromise;
      response.json({ decisions: await store.list() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/decisions/:id', async (request, response, next) => {
    try {
      const store = await storePromise;
      const decision = await store.getById(request.params.id);
      if (!decision) {
        response.status(404).json({ error: 'Decision not found.' });
        return;
      }
      response.json({ decision });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/decisions', async (request, response, next) => {
    try {
      const decision = validateDecision(request.body);
      const store = await storePromise;
      const savedDecision = await store.create(decision);
      response.status(201).json({ decision: savedDecision });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/decisions/:id', async (request, response, next) => {
    try {
      const store = await storePromise;
      const current = await store.getById(request.params.id);
      if (!current) {
        response.status(404).json({ error: 'Decision not found.' });
        return;
      }

      if (request.body && request.body.id !== undefined && request.body.id !== request.params.id) {
        throw new StoreError('The decision ID in the URL and body must match.', 400, 'ID_MISMATCH');
      }

      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new StoreError('Decision must be a JSON object.', 400, 'INVALID_DECISION');
      }

      const updatedDecision = validateDecision({
        id: current.id,
        savedAt: current.savedAt,
        outcome: body.outcome === undefined ? current.outcome : body.outcome,
        draft: body.draft === undefined ? current.draft : body.draft
      });
      const savedDecision = await store.update(request.params.id, updatedDecision);
      if (!savedDecision) {
        response.status(404).json({ error: 'Decision not found.' });
        return;
      }
      response.json({ decision: savedDecision });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/decisions/:id', async (request, response, next) => {
    try {
      const store = await storePromise;
      const deleted = await store.delete(request.params.id);
      if (!deleted) {
        response.status(404).json({ error: 'Decision not found.' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (request, response) => {
    response.status(404).json({ error: 'API route not found.' });
  });

  app.use(express.static(options.webRoot || WEB_ROOT, {
    index: 'index.html',
    fallthrough: true,
    setHeaders(response) {
      response.setHeader('X-Content-Type-Options', 'nosniff');
    }
  }));

  app.use((request, response) => {
    response.status(404).type('text/plain').send('Page not found.');
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const statusCode = Number.isInteger(error.statusCode)
      ? error.statusCode
      : Number.isInteger(error.status) ? error.status : 500;
    if (statusCode >= 500) {
      console.error('VETO request failed.', error);
    }

    const message = statusCode >= 500
      ? 'The request could not be completed.'
      : error.message;
    response.status(statusCode).json({ error: message });
  });

  return app;
}

function createServer(options = {}) {
  const app = createApp(options);
  const server = http.createServer(app);
  server.on('close', () => {
    app.locals.storePromise
      .then((store) => store.close())
      .catch((error) => console.error('VETO could not close its data store cleanly.', error));
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    const mode = process.env.VETO_STORE || 'sqlite';
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
