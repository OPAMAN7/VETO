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
  'altPrice'
];
const MULTI_VALUE_FIELDS = new Set(['honesty', 'owned']);

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
      if (typeof value !== 'string' || value.length > 500) {
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

function createSqliteDecisionStore(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      saved_at TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('bought', 'delayed', 'passed')),
      draft_json TEXT NOT NULL
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

  function fromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      savedAt: row.saved_at,
      outcome: row.outcome,
      draft: JSON.parse(row.draft_json)
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
    async close() {
      database.close();
    }
  };
}

function createJsonDecisionStore(filePath) {
  const resolvedPath = path.resolve(filePath);
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
        return true;
      });
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
  createSqliteDecisionStore,
  createJsonDecisionStore,
  createMongoDecisionStore,
  createDecisionStore
};
