'use strict';

const path = require('node:path');
const express = require('express');
const { createDecisionStore, validateDecision, validateReminder, validateSubscription, StoreError } = require('../../stores/decision-store');
const { readConfig } = require('./config/env');
const { errorHandler } = require('./middleware/error-handler');
const { createRateLimit } = require('./middleware/rate-limit');
const { buildAnalytics } = require('./services/analytics-service');
const { createCoachService } = require('./services/coach-service');
const { createProductSearchService } = require('./services/product-search-service');
const { createPushService, startReminderScheduler } = require('./services/reminder-service');

const WEB_ROOT = path.resolve(__dirname, '../../', 'Html');

function createApp(options = {}) {
  const config = readConfig(options.environment || process.env);
  const storePromise = options.store
    ? Promise.resolve(options.store)
    : createDecisionStore({
      mode: options.storeMode || config.storageDriver,
      databasePath: options.databasePath || config.databasePath,
      jsonPath: options.jsonPath || config.jsonPath,
      mongoUri: options.mongoUri || config.mongoUri
    });
  const coach = createCoachService(config, options.fetch);
  const productSearch = createProductSearchService(config, options.fetch);
  const pushService = createPushService(config);

  const app = express();
  app.disable('x-powered-by');
  app.locals.storePromise = storePromise;
  app.locals.config = config;

  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (request.path.startsWith('/api/')) response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '256kb', strict: true }));

  app.get('/api/health', async (request, response, next) => {
    try {
      const store = await storePromise;
      response.json({
        status: 'ok',
        storage: store.kind,
        integrations: {
          coach: Boolean(config.geminiApiKey),
          productSearch: Boolean(config.ebayClientId && config.ebayClientSecret),
          webPush: pushService.isConfigured
        }
      });
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
        response.status(404).json({ error: 'Decision not found.', code: 'DECISION_NOT_FOUND' });
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
      response.status(201).json({ decision: await store.create(decision) });
    } catch (error) {
      next(error);
    }
  });
  app.put('/api/decisions/:id', async (request, response, next) => {
    try {
      const store = await storePromise;
      const current = await store.getById(request.params.id);
      if (!current) {
        response.status(404).json({ error: 'Decision not found.', code: 'DECISION_NOT_FOUND' });
        return;
      }
      if (request.body?.id !== undefined && request.body.id !== request.params.id) {
        throw new StoreError('The decision ID in the URL and body must match.', 400, 'ID_MISMATCH');
      }
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new StoreError('Decision must be a JSON object.', 400, 'INVALID_DECISION');
      }
      const updated = validateDecision({
        id: current.id,
        savedAt: body.savedAt === undefined ? current.savedAt : body.savedAt,
        outcome: body.outcome === undefined ? current.outcome : body.outcome,
        draft: body.draft === undefined ? current.draft : body.draft
      });
      const saved = await store.update(request.params.id, updated);
      if (!saved) {
        response.status(404).json({ error: 'Decision not found.', code: 'DECISION_NOT_FOUND' });
        return;
      }
      response.json({ decision: saved });
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/decisions/:id', async (request, response, next) => {
    try {
      const store = await storePromise;
      if (!await store.delete(request.params.id)) {
        response.status(404).json({ error: 'Decision not found.', code: 'DECISION_NOT_FOUND' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/analytics/summary', async (request, response, next) => {
    try {
      const store = await storePromise;
      response.json(buildAnalytics(await store.list()));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/coach/analyze',
    createRateLimit({ limit: 10, windowMs: 10 * 60 * 1000 }),
    async (request, response, next) => {
      try {
        response.json(await coach.analyze(request.body));
      } catch (error) {
        next(error);
      }
    });

  app.get('/api/products/search', async (request, response, next) => {
    try {
      response.json({ products: await productSearch.search(request.query.q) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/reminders', async (request, response, next) => {
    try {
      const store = await storePromise;
      if (typeof store.createReminder !== 'function') {
        response.status(501).json({ error: 'This storage adapter does not support reminders yet.', code: 'REMINDERS_NOT_SUPPORTED' });
        return;
      }
      const reminder = validateReminder(request.body);
      if (!await store.getById(reminder.decisionId)) {
        response.status(404).json({ error: 'Decision not found.', code: 'DECISION_NOT_FOUND' });
        return;
      }
      response.status(201).json({ reminder: await store.createReminder(reminder) });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/reminders', async (request, response, next) => {
    try {
      const store = await storePromise;
      if (typeof store.listReminders !== 'function') {
        response.json({ reminders: [] });
        return;
      }
      response.json({ reminders: await store.listReminders() });
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/reminders/:id', async (request, response, next) => {
    try {
      const store = await storePromise;
      if (!await store.deleteReminder(request.params.id)) {
        response.status(404).json({ error: 'Reminder not found.', code: 'REMINDER_NOT_FOUND' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/push/subscribe', async (request, response, next) => {
    try {
      if (!pushService.isConfigured) {
        response.status(503).json({ error: 'Web Push is not configured. Generate VAPID keys and add them to .env.', code: 'PUSH_NOT_CONFIGURED' });
        return;
      }
      const subscription = validateSubscription(request.body);
      const store = await storePromise;
      await store.saveSubscription(subscription);
      response.status(201).json({ publicKey: pushService.publicKey });
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/push/unsubscribe', async (request, response, next) => {
    try {
      const subscription = validateSubscription(request.body);
      const store = await storePromise;
      const deleted = await store.deleteSubscription(subscription.endpoint);
      response.status(deleted ? 204 : 404).end();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/push/public-key', (request, response) => {
    if (!pushService.isConfigured) {
      response.status(503).json({ error: 'Web Push is not configured.', code: 'PUSH_NOT_CONFIGURED' });
      return;
    }
    response.json({ publicKey: pushService.publicKey });
  });

  app.use('/api', (request, response) => {
    response.status(404).json({ error: 'API route not found.', code: 'API_NOT_FOUND' });
  });
  app.use(express.static(options.webRoot || WEB_ROOT, {
    index: 'index.html',
    fallthrough: true,
    setHeaders(response) {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'same-origin');
    }
  }));
  app.use((request, response) => {
    response.status(404).type('text/plain').send('Page not found.');
  });
  app.use(errorHandler);

  app.locals.stopScheduler = options.disableScheduler
    ? null
    : startReminderScheduler(storePromise, pushService);

  return app;
}

module.exports = { createApp };
