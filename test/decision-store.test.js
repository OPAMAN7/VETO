'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createJsonDecisionStore, createSqliteDecisionStore, validateDecision, StoreError } = require('../stores/decision-store');

function sampleDecision(overrides = {}) {
  return validateDecision({
    outcome: 'delayed',
    draft: {
      name: 'Desk lamp',
      price: '1200',
      category: 'home',
      trigger: 'planned',
      usesPerMonth: '20',
      lifespanMonths: '24',
      honesty: ['will-use'],
      owned: ['none'],
      access: 'buy-only',
      altName: '',
      altPrice: ''
    },
    ...overrides
  });
}

test('validateDecision rejects an unsupported outcome', () => {
  assert.throws(
    () => validateDecision({ outcome: 'maybe', draft: {} }),
    (error) => error instanceof StoreError && error.statusCode === 400
  );
});

test('JSON store supports create, read, update, list and delete', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'veto-store-'));
  const store = createJsonDecisionStore(path.join(directory, 'decisions.json'));
  t.after(async () => {
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const original = sampleDecision({ id: 'decision-1' });
  const created = await store.create(original);
  assert.deepEqual(created, original);
  assert.deepEqual(await store.getById('decision-1'), original);
  assert.equal((await store.list()).length, 1);

  const updated = { ...original, outcome: 'passed' };
  assert.deepEqual(await store.update('decision-1', updated), updated);
  assert.equal((await store.getById('decision-1')).outcome, 'passed');

  assert.equal(await store.delete('decision-1'), true);
  assert.equal(await store.getById('decision-1'), null);
  assert.equal(await store.delete('decision-1'), false);
});

test('JSON store rejects duplicate IDs without overwriting the existing record', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'veto-duplicate-'));
  const store = createJsonDecisionStore(path.join(directory, 'decisions.json'));
  t.after(async () => {
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const original = sampleDecision({ id: 'same-id' });
  await store.create(original);
  await assert.rejects(
    () => store.create({ ...original, outcome: 'bought' }),
    (error) => error.statusCode === 409
  );
  assert.equal((await store.getById('same-id')).outcome, 'delayed');
});


test('SQLite store preserves the existing decision schema and supports CRUD', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'veto-sqlite-'));
  const databasePath = path.join(directory, 'veto.sqlite');
  let store = createSqliteDecisionStore(databasePath);
  t.after(async () => {
    if (store) await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const original = sampleDecision({ id: 'sqlite-decision-1' });
  await store.create(original);
  assert.deepEqual(await store.getById(original.id), original);

  const updated = { ...original, outcome: 'bought' };
  await store.update(original.id, updated);
  assert.equal((await store.list())[0].outcome, 'bought');

  await store.close();
  store = createSqliteDecisionStore(databasePath);
  assert.equal((await store.getById(original.id)).outcome, 'bought');
  assert.equal(await store.delete(original.id), true);
  assert.equal(await store.getById(original.id), null);
});
