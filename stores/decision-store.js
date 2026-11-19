'use strict';

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ALLOWED_OUTCOMES = new Set(['bought', 'delayed', 'passed']);
const DRAFT_FIELDS = [
  'name',
  'price',
  'category',
  'trigger',
  'usesPerMonth',
  'lifespanMonths',
  'honesty',
  'owned',
  'access',
  'altName',
  'altPrice',
  'categoryAnswers'
];
const MULTI_VALUE_FIELDS = new Set(['honesty', 'owned']);
const REMINDER_TYPES = new Set(['cooling-off', 'reassessment', 'usage-audit']);

function validateReminder(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new StoreError('Reminder must be a JSON object.', 400, 'INVALID_REMINDER');
  }
  if (typeof input.decisionId !== 'string' || input.decisionId.length < 1 || input.decisionId.length > 128) {
    throw new StoreError('Reminder decision ID is invalid.', 400, 'INVALID_REMINDER');
  }
  if (!REMINDER_TYPES.has(input.type)) {
    throw new StoreError('Reminder type is invalid.', 400, 'INVALID_REMINDER');
  }
  if (typeof input.dueAt !== 'string' || !Number.isFinite(Date.parse(input.dueAt))) {
    throw new StoreError('Reminder date is invalid.', 400, 'INVALID_REMINDER');
  }
  if (input.message !== undefined && (typeof input.message !== 'string' || input.message.length > 500)) {
    throw new StoreError('Reminder message is invalid.', 400, 'INVALID_REMINDER');
  }

  return {
    id: input.id || randomUUID(),
    decisionId: input.decisionId,
    type: input.type,
    dueAt: new Date(input.dueAt).toISOString(),
    message: input.message || '',
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };
}

function validateSubscription(input) {
  const endpoint = input && input.endpoint;
  const keys = input && input.keys;
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new StoreError('Push subscription endpoint is invalid.', 400, 'INVALID_SUBSCRIPTION');
  }
  if (parsedEndpoint.protocol !== 'https:' || typeof keys?.p256dh !== 'string'
      || typeof keys?.auth !== 'string' || keys.p256dh.length > 256 || keys.auth.length > 256) {
    throw new StoreError('Push subscription keys are invalid.', 400, 'INVALID_SUBSCRIPTION');
  }
  return {
    endpoint: parsedEndpoint.toString(),
    keys: { p256dh: keys.p256dh, auth: keys.auth }
  };
}

class StoreError extends Error {
  constructor(message, statusCode = 500, code = 'STORE_ERROR') {
    super(message);
    this.name = 'StoreError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function validateDecision(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new StoreError('Decision must be a JSON object.', 400, 'INVALID_DECISION');
  }
  if (!ALLOWED_OUTCOMES.has(input.outcome)) {
    throw new StoreError('Outcome must be bought, delayed, or passed.', 400, 'INVALID_OUTCOME');
  }
  if (input.id !== undefined && (typeof input.id !== 'string' || input.id.length < 1 || input.id.length > 128)) {
    throw new StoreError('Decision ID is invalid.', 400, 'INVALID_ID');
  }
  if (input.savedAt !== undefined
      && (typeof input.savedAt !== 'string' || !Number.isFinite(Date.parse(input.savedAt)))) {
    throw new StoreError('Decision date is invalid.', 400, 'INVALID_DATE');
  }
  if (input.draft !== undefined
      && (!input.draft || typeof input.draft !== 'object' || Array.isArray(input.draft))) {
    throw new StoreError('Decision draft must be an object.', 400, 'INVALID_DRAFT');
  }

  const sourceDraft = input.draft || {};
  const draft = {};
  for (const field of DRAFT_FIELDS) {
    if (!Object.hasOwn(sourceDraft, field)) continue;

    const value = sourceDraft[field];
    if (MULTI_VALUE_FIELDS.has(field)) {
      const values = Array.isArray(value) ? value : [value];
      if (values.length > 100 || values.some((item) => typeof item !== 'string' || item.length > 200)) {
        throw new StoreError(`Draft field ${field} is invalid.`, 400, 'INVALID_DRAFT_FIELD');
      }
      draft[field] = values;
    } else {
      if (field === 'categoryAnswers') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new StoreError(`Draft field ${field} is invalid.`, 400, 'INVALID_DRAFT_FIELD');
        }
        draft[field] = value;
      } else if (typeof value !== 'string' || value.length > 500) {
        throw new StoreError(`Draft field ${field} is invalid.`, 400, 'INVALID_DRAFT_FIELD');
      }
      draft[field] = value;
    }
  }

  return {
    id: input.id || randomUUID(),
    savedAt: input.savedAt ? new Date(input.savedAt).toISOString() : new Date().toISOString(),
    outcome: input.outcome,
    draft
  };
}

function sortNewestFirst(decisions) {
  return decisions.sort((a, b) => {
    const dateDifference = Date.parse(b.savedAt) - Date.parse(a.savedAt);
    return Number.isNaN(dateDifference) || dateDifference === 0 ? 0 : dateDifference;
  });
}

function createJsonArrayRepository(filePath) {
  const resolvedPath = path.resolve(filePath);
  let operationQueue = Promise.resolve();

  function serialize(task) {
    const next = operationQueue.then(task, task);
    operationQueue = next.catch(() => undefined);
    return next;
  }

  async function readAll() {
    await fsPromises.mkdir(path.dirname(resolvedPath), { recursive: true });
    try {
      await fsPromises.access(resolvedPath, fs.constants.F_OK);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fsPromises.writeFile(resolvedPath, '[]\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        .catch((writeError) => {
          if (writeError.code !== 'EEXIST') throw writeError;
        });
    }

    try {
      const records = JSON.parse(await fsPromises.readFile(resolvedPath, 'utf8'));
      if (!Array.isArray(records)) throw new SyntaxError('Expected an array.');
      return records;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new StoreError('A JSON storage file is invalid. Restore a valid backup before continuing.', 500, 'CORRUPT_JSON');
      }
      throw error;
    }
  }

  async function writeAll(records) {
    const temporaryPath = `${resolvedPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fsPromises.writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx'
      });
      await fsPromises.rename(temporaryPath, resolvedPath);
    } catch (error) {
      await fsPromises.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  return {
    list() {
      return serialize(readAll);
    },
    create(record, keyField, replaceExisting = false) {
      return serialize(async () => {
        const records = await readAll();
        const existingIndex = records.findIndex((existing) => existing[keyField] === record[keyField]);
        if (existingIndex !== -1) {
          if (!replaceExisting) {
            throw new StoreError('A record with this ID already exists.', 409, 'DUPLICATE_ID');
          }
          records.splice(existingIndex, 1);
        }
        records.push(record);
        await writeAll(records);
        return record;
      });
    },
    update(key, keyField, transform) {
      return serialize(async () => {
        const records = await readAll();
        const index = records.findIndex((record) => record[keyField] === key);
        if (index === -1) return null;
        records[index] = transform(records[index]);
        await writeAll(records);
        return records[index];
      });
    },
    delete(key, keyField) {
      return serialize(async () => {
        const records = await readAll();
        const remaining = records.filter((record) => record[keyField] !== key);
        if (remaining.length === records.length) return false;
        await writeAll(remaining);
        return true;
      });
    },
    removeWhere(predicate) {
      return serialize(async () => {
        const records = await readAll();
        const remaining = records.filter((record) => !predicate(record));
        if (remaining.length === records.length) return false;
        await writeAll(remaining);
        return true;
      });
    }
  };
}

function createSqliteDecisionStore(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      saved_at TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('bought', 'delayed', 'passed')),
      draft_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      due_at TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'sent')),
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS reminders_due_at_idx ON reminders(status, due_at);
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const listStatement = database.prepare(
    'SELECT id, saved_at, outcome, draft_json FROM decisions ORDER BY saved_at DESC, rowid DESC'
  );
  const getStatement = database.prepare(
    'SELECT id, saved_at, outcome, draft_json FROM decisions WHERE id = ?'
  );
  const insertStatement = database.prepare(
    'INSERT INTO decisions (id, saved_at, outcome, draft_json) VALUES (?, ?, ?, ?)'
  );
  const updateStatement = database.prepare(
    'UPDATE decisions SET saved_at = ?, outcome = ?, draft_json = ? WHERE id = ?'
  );
  const deleteStatement = database.prepare('DELETE FROM decisions WHERE id = ?');
  const listRemindersStatement = database.prepare(
    'SELECT id, decision_id, type, due_at, message, status, created_at, sent_at FROM reminders ORDER BY due_at'
  );
  const getReminderStatement = database.prepare(
    'SELECT id, decision_id, type, due_at, message, status, created_at, sent_at FROM reminders WHERE id = ?'
  );
  const insertReminderStatement = database.prepare(`
    INSERT INTO reminders (id, decision_id, type, due_at, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteReminderStatement = database.prepare('DELETE FROM reminders WHERE id = ?');
  const dueRemindersStatement = database.prepare(`
    SELECT id, decision_id, type, due_at, message, status, created_at, sent_at
    FROM reminders WHERE status = 'scheduled' AND due_at <= ? ORDER BY due_at
  `);
  const markReminderSentStatement = database.prepare(
    "UPDATE reminders SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'scheduled'"
  );
  const listSubscriptionsStatement = database.prepare(
    'SELECT subscription_json FROM push_subscriptions ORDER BY created_at'
  );
  const saveSubscriptionStatement = database.prepare(`
    INSERT INTO push_subscriptions (endpoint, subscription_json, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET subscription_json = excluded.subscription_json
  `);
  const deleteSubscriptionStatement = database.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

  function fromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      savedAt: row.saved_at,
      outcome: row.outcome,
      draft: JSON.parse(row.draft_json)
    };
  }

  function fromReminderRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      decisionId: row.decision_id,
      type: row.type,
      dueAt: row.due_at,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      sentAt: row.sent_at || null
    };
  }

  return {
    kind: 'sqlite',
    async list() {
      return listStatement.all().map(fromRow);
    },
    async getById(id) {
      return fromRow(getStatement.get(id));
    },
    async create(decision) {
      if (getStatement.get(decision.id)) {
        throw new StoreError('A decision with this ID already exists.', 409, 'DUPLICATE_ID');
      }
      insertStatement.run(decision.id, decision.savedAt, decision.outcome, JSON.stringify(decision.draft));
      return fromRow(getStatement.get(decision.id));
    },
    async update(id, decision) {
      if (!getStatement.get(id)) return null;
      updateStatement.run(decision.savedAt, decision.outcome, JSON.stringify(decision.draft), id);
      return fromRow(getStatement.get(id));
    },
    async delete(id) {
      return deleteStatement.run(id).changes > 0;
    },
    async listReminders() {
      return listRemindersStatement.all().map(fromReminderRow);
    },
    async createReminder(reminder) {
      insertReminderStatement.run(
        reminder.id,
        reminder.decisionId,
        reminder.type,
        reminder.dueAt,
        reminder.message,
        reminder.status,
        reminder.createdAt
      );
      return fromReminderRow(getReminderStatement.get(reminder.id));
    },
    async deleteReminder(id) {
      return deleteReminderStatement.run(id).changes > 0;
    },
    async listDueReminders(now) {
      return dueRemindersStatement.all(now).map(fromReminderRow);
    },
    async markReminderSent(id, sentAt) {
      return markReminderSentStatement.run(sentAt, id).changes > 0;
    },
    async listSubscriptions() {
      return listSubscriptionsStatement.all().map((row) => JSON.parse(row.subscription_json));
    },
    async saveSubscription(subscription) {
      saveSubscriptionStatement.run(
        subscription.endpoint,
        JSON.stringify(subscription),
        new Date().toISOString()
      );
    },
    async deleteSubscription(endpoint) {
      return deleteSubscriptionStatement.run(endpoint).changes > 0;
    },
    async close() {
      database.close();
    }
  };
}

function createJsonDecisionStore(filePath) {
  const resolvedPath = path.resolve(filePath);
  const reminders = createJsonArrayRepository(`${resolvedPath}.reminders.json`);
  const subscriptions = createJsonArrayRepository(`${resolvedPath}.subscriptions.json`);
  let operationQueue = Promise.resolve();

  function serialize(task) {
    const next = operationQueue.then(task, task);
    operationQueue = next.catch(() => undefined);
    return next;
  }

  async function ensureFile() {
    await fsPromises.mkdir(path.dirname(resolvedPath), { recursive: true });
    try {
      await fsPromises.access(resolvedPath, fs.constants.F_OK);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fsPromises.writeFile(resolvedPath, '[]\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' }).catch((writeError) => {
        if (writeError.code !== 'EEXIST') throw writeError;
      });
    }
  }

  async function readAll() {
    await ensureFile();
    let parsed;
    try {
      parsed = JSON.parse(await fsPromises.readFile(resolvedPath, 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new StoreError('The JSON decision file is invalid. Restore a valid backup before continuing.', 500, 'CORRUPT_JSON');
      }
      throw error;
    }
    if (!Array.isArray(parsed)) {
      throw new StoreError('The JSON decision file must contain an array.', 500, 'CORRUPT_JSON');
    }
    return parsed;
  }

  async function writeAll(decisions) {
    const temporaryPath = `${resolvedPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fsPromises.writeFile(temporaryPath, `${JSON.stringify(decisions, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx'
      });
      await fsPromises.rename(temporaryPath, resolvedPath);
    } catch (error) {
      await fsPromises.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  return {
    kind: 'json',
    list() {
      return serialize(async () => sortNewestFirst(await readAll()));
    },
    getById(id) {
      return serialize(async () => (await readAll()).find((decision) => decision.id === id) || null);
    },
    create(decision) {
      return serialize(async () => {
        const decisions = await readAll();
        if (decisions.some((existing) => existing.id === decision.id)) {
          throw new StoreError('A decision with this ID already exists.', 409, 'DUPLICATE_ID');
        }
        decisions.push(decision);
        await writeAll(decisions);
        return decision;
      });
    },
    update(id, decision) {
      return serialize(async () => {
        const decisions = await readAll();
        const index = decisions.findIndex((existing) => existing.id === id);
        if (index === -1) return null;
        decisions[index] = decision;
        await writeAll(decisions);
        return decision;
      });
    },
    delete(id) {
      return serialize(async () => {
        const decisions = await readAll();
        const remaining = decisions.filter((decision) => decision.id !== id);
        if (remaining.length === decisions.length) return false;
        await writeAll(remaining);
        await reminders.removeWhere((reminder) => reminder.decisionId === id);
        return true;
      });
    },
    async listReminders() {
      return reminders.list();
    },
    async createReminder(reminder) {
      return reminders.create(reminder, 'id');
    },
    async deleteReminder(id) {
      return reminders.delete(id, 'id');
    },
    async listDueReminders(now) {
      return (await reminders.list())
        .filter((reminder) => reminder.status === 'scheduled' && reminder.dueAt <= now);
    },
    async markReminderSent(id, sentAt) {
      return reminders.update(id, 'id', (reminder) => ({ ...reminder, status: 'sent', sentAt }));
    },
    async listSubscriptions() {
      return subscriptions.list();
    },
    async saveSubscription(subscription) {
      return subscriptions.create(subscription, 'endpoint', true);
    },
    async deleteSubscription(endpoint) {
      return subscriptions.delete(endpoint, 'endpoint');
    },
    async close() {}
  };
}

async function createMongoDecisionStore(uri) {
  if (!uri) {
    throw new StoreError('MONGODB_URI is required when VETO_STORE=mongodb.', 500, 'MISSING_MONGODB_URI');
  }

  const mongoose = require('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  const schema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    savedAt: { type: String, required: true },
    outcome: { type: String, required: true, enum: Array.from(ALLOWED_OUTCOMES) },
    draft: { type: mongoose.Schema.Types.Mixed, required: true, default: {} }
  }, {
    collection: 'decisions',
    versionKey: false,
    strict: true
  });

  const Decision = mongoose.models.VetoDecision || mongoose.model('VetoDecision', schema);
  const reminderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    decisionId: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: Array.from(REMINDER_TYPES) },
    dueAt: { type: String, required: true, index: true },
    message: { type: String, default: '' },
    status: { type: String, required: true, enum: ['scheduled', 'sent'], default: 'scheduled' },
    createdAt: { type: String, required: true },
    sentAt: { type: String, default: null }
  }, { collection: 'reminders', versionKey: false, strict: true });
  const Reminder = mongoose.models.VetoReminder || mongoose.model('VetoReminder', reminderSchema);
  const subscriptionSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  }, { collection: 'push_subscriptions', versionKey: false, strict: true });
  const PushSubscription = mongoose.models.VetoPushSubscription
    || mongoose.model('VetoPushSubscription', subscriptionSchema);

  return {
    kind: 'mongodb',
    async list() {
      const rows = await Decision.find({}).sort({ savedAt: -1, _id: -1 }).lean().exec();
      return rows.map(({ _id, ...decision }) => decision);
    },
    async getById(id) {
      const row = await Decision.findOne({ id }).lean().exec();
      if (!row) return null;
      const { _id, ...decision } = row;
      return decision;
    },
    async create(decision) {
      try {
        await Decision.create(decision);
        return decision;
      } catch (error) {
        if (error && error.code === 11000) {
          throw new StoreError('A decision with this ID already exists.', 409, 'DUPLICATE_ID');
        }
        throw error;
      }
    },
    async update(id, decision) {
      const row = await Decision.findOneAndUpdate(
        { id },
        { $set: { savedAt: decision.savedAt, outcome: decision.outcome, draft: decision.draft } },
        { new: true, runValidators: true }
      ).lean().exec();
      if (!row) return null;
      const { _id, ...updated } = row;
      return updated;
    },
    async delete(id) {
      const result = await Decision.deleteOne({ id }).exec();
      if (result.deletedCount > 0) await Reminder.deleteMany({ decisionId: id }).exec();
      return result.deletedCount > 0;
    },
    async listReminders() {
      return Reminder.find({}).sort({ dueAt: 1 }).select('-_id').lean().exec();
    },
    async createReminder(reminder) {
      await Reminder.create(reminder);
      return reminder;
    },
    async deleteReminder(id) {
      const result = await Reminder.deleteOne({ id }).exec();
      return result.deletedCount > 0;
    },
    async listDueReminders(now) {
      return Reminder.find({ status: 'scheduled', dueAt: { $lte: now } })
        .sort({ dueAt: 1 }).select('-_id').lean().exec();
    },
    async markReminderSent(id, sentAt) {
      const result = await Reminder.updateOne(
        { id, status: 'scheduled' },
        { $set: { status: 'sent', sentAt } }
      ).exec();
      return result.modifiedCount > 0;
    },
    async listSubscriptions() {
      return PushSubscription.find({}).select('-_id').lean().exec();
    },
    async saveSubscription(subscription) {
      await PushSubscription.updateOne(
        { endpoint: subscription.endpoint },
        { $set: subscription },
        { upsert: true, runValidators: true }
      ).exec();
    },
    async deleteSubscription(endpoint) {
      const result = await PushSubscription.deleteOne({ endpoint }).exec();
      return result.deletedCount > 0;
    },
    async close() {
      await mongoose.disconnect();
    }
  };
}

async function createDecisionStore(options = {}) {
  const mode = String(options.mode || 'sqlite').toLowerCase();
  if (mode === 'sqlite') {
    const databasePath = options.databasePath || process.env.VETO_DB_PATH || path.join(__dirname, '..', 'data', 'veto.sqlite');
    return createSqliteDecisionStore(databasePath);
  }
  if (mode === 'json') {
    const jsonPath = options.jsonPath || process.env.VETO_JSON_PATH || path.join(__dirname, '..', 'data', 'decisions.json');
    return createJsonDecisionStore(jsonPath);
  }
  if (mode === 'mongodb') {
    return createMongoDecisionStore(options.mongoUri || process.env.MONGODB_URI);
  }
  throw new StoreError('VETO_STORE must be sqlite, json, or mongodb.', 500, 'INVALID_STORE_MODE');
}

module.exports = {
  StoreError,
  validateDecision,
  validateReminder,
  validateSubscription,
  createSqliteDecisionStore,
  createJsonDecisionStore,
  createMongoDecisionStore,
  createDecisionStore
};
