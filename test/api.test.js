'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

function createMemoryStore() {
  const records = new Map();
  return {
    kind: 'memory-test',
    async list() { return Array.from(records.values()); },
    async getById(id) { return records.get(id) || null; },
    async create(decision) {
      if (records.has(decision.id)) {
        const error = new Error('Duplicate ID');
        error.statusCode = 409;
        throw error;
      }
      records.set(decision.id, decision);
      return decision;
    },
    async update(id, decision) {
      if (!records.has(id)) return null;
      records.set(id, decision);
      return decision;
    },
    async delete(id) { return records.delete(id); },
    async close() {}
  };
}

test('decision API exposes full CRUD while keeping collection response compatible', async (t) => {
  const server = createServer({ store: createMemoryStore() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).storage, 'memory-test');

  const emptyResponse = await fetch(`${baseUrl}/api/decisions`);
  assert.deepEqual(await emptyResponse.json(), { decisions: [] });

  const payload = {
    id: 'api-test-1',
    outcome: 'delayed',
    draft: { name: 'Headphones', price: '3000', owned: ['none'], honesty: [] }
  };
  const createResponse = await fetch(`${baseUrl}/api/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).decision;
  assert.equal(created.id, 'api-test-1');
  assert.equal(created.outcome, 'delayed');

  const getResponse = await fetch(`${baseUrl}/api/decisions/api-test-1`);
  assert.equal((await getResponse.json()).decision.id, 'api-test-1');

  const updateResponse = await fetch(`${baseUrl}/api/decisions/api-test-1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome: 'passed' })
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).decision.outcome, 'passed');

  const deleteResponse = await fetch(`${baseUrl}/api/decisions/api-test-1`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await fetch(`${baseUrl}/api/decisions/api-test-1`);
  assert.equal(missingResponse.status, 404);
});

test('decision API validates new records', async (t) => {
  const server = createServer({ store: createMemoryStore() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/api/decisions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome: 'maybe', draft: {} })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Outcome must be/);
});

test('analytics summarizes actual saved decisions', async (t) => {
  const memory = createMemoryStore();
  await memory.create({
    id: 'analytics-bought',
    savedAt: '2026-11-01T00:00:00.000Z',
    outcome: 'bought',
    draft: { name: 'Lamp', price: '3000', category: 'furniture', trigger: 'offer', honesty: [], owned: ['none'] }
  });
  await memory.create({
    id: 'analytics-passed',
    savedAt: '2026-11-02T00:00:00.000Z',
    outcome: 'passed',
    draft: { name: 'Shoes', price: '5000', category: 'footwear', trigger: 'impulse', honesty: [], owned: ['none'] }
  });
  const server = createServer({ store: memory, disableScheduler: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/analytics/summary`);
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.totalDecisions, 2);
  assert.equal(summary.purchases, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.totalSpent, 3000);
  assert.equal(summary.estimatedMoneyAvoided, 5000);
  assert.equal(summary.commonTriggers[0].trigger, 'impulse');
});

test('external integrations report missing credentials clearly', async (t) => {
  const server = createServer({ store: createMemoryStore(), disableScheduler: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const coachResponse = await fetch(`${baseUrl}/api/coach/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Lamp', price: '3000' })
  });
  assert.equal(coachResponse.status, 503);
  assert.match((await coachResponse.json()).error, /GEMINI_API_KEY/);

  const productResponse = await fetch(`${baseUrl}/api/products/search?q=lamp`);
  assert.equal(productResponse.status, 503);
  assert.match((await productResponse.json()).error, /EBAY_CLIENT/);
});
