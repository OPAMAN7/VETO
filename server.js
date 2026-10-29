'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const WEB_ROOT = path.join(__dirname, 'Html');
const DEFAULT_DATABASE_PATH = path.join(__dirname, 'data', 'veto.sqlite');
const MAX_BODY_BYTES = 256 * 1024;
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
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function readRequestBody(request) {
  return new Promise(function (resolve, reject) {
    let body = '';
    let size = 0;
    let exceededLimit = false;

    request.setEncoding('utf8');
    request.on('data', function (chunk) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        exceededLimit = true;
        return;
      }
      body += chunk;
    });
    request.on('end', function () {
      if (exceededLimit) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function validateDecision(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Decision must be a JSON object.'), { statusCode: 400 });
  }
  if (!ALLOWED_OUTCOMES.has(input.outcome)) {
    throw Object.assign(new Error('Outcome must be bought, delayed, or passed.'), { statusCode: 400 });
  }
  if (input.id !== undefined && (typeof input.id !== 'string' || input.id.length > 128)) {
    throw Object.assign(new Error('Decision ID is invalid.'), { statusCode: 400 });
  }
  if (input.savedAt !== undefined
      && (typeof input.savedAt !== 'string' || !Number.isFinite(Date.parse(input.savedAt)))) {
    throw Object.assign(new Error('Decision date is invalid.'), { statusCode: 400 });
  }
  if (input.draft !== undefined
      && (!input.draft || typeof input.draft !== 'object' || Array.isArray(input.draft))) {
    throw Object.assign(new Error('Decision draft must be an object.'), { statusCode: 400 });
  }

  const sourceDraft = input.draft || {};
  const draft = {};
  for (const field of DRAFT_FIELDS) {
    if (!Object.hasOwn(sourceDraft, field)) {
      continue;
    }

    const value = sourceDraft[field];
    if (MULTI_VALUE_FIELDS.has(field)) {
      const values = Array.isArray(value) ? value : [value];
      if (values.length > 100 || values.some((item) => typeof item !== 'string' || item.length > 200)) {
        throw Object.assign(new Error(`Draft field ${field} is invalid.`), { statusCode: 400 });
      }
      draft[field] = values;
    } else {
      if (typeof value !== 'string' || value.length > 500) {
        throw Object.assign(new Error(`Draft field ${field} is invalid.`), { statusCode: 400 });
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

function createServer(options = {}) {
  const databasePath = options.databasePath || process.env.VETO_DB_PATH || DEFAULT_DATABASE_PATH;
  const webRoot = path.resolve(options.webRoot || WEB_ROOT);

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

  const listDecisions = database.prepare(
    'SELECT id, saved_at, outcome, draft_json FROM decisions ORDER BY saved_at DESC, rowid DESC'
  );
  const findDecision = database.prepare(
    'SELECT id, saved_at, outcome, draft_json FROM decisions WHERE id = ?'
  );
  const insertDecision = database.prepare(`
    INSERT INTO decisions (id, saved_at, outcome, draft_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  function toDecision(row) {
    return {
      id: row.id,
      savedAt: row.saved_at,
      outcome: row.outcome,
      draft: JSON.parse(row.draft_json)
    };
  }

  const server = http.createServer(async function (request, response) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      sendJson(response, 400, { error: 'Request path is invalid.' });
      return;
    }

    if (pathname === '/api/decisions' && request.method === 'GET') {
      sendJson(response, 200, { decisions: listDecisions.all().map(toDecision) });
      return;
    }

    if (pathname === '/api/decisions' && request.method === 'POST') {
      try {
        const input = await readRequestBody(request);
        const decision = validateDecision(input);
        insertDecision.run(
          decision.id,
          decision.savedAt,
          decision.outcome,
          JSON.stringify(decision.draft)
        );
        sendJson(response, 201, { decision: toDecision(findDecision.get(decision.id)) });
      } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) {
          console.error('VETO could not save a decision.', error);
        }
        sendJson(response, statusCode, {
          error: error.statusCode ? error.message : 'The decision could not be saved.'
        });
      }
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'API route not found.' });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    const relativePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(webRoot, `.${relativePath}`);
    if (filePath !== webRoot && !filePath.startsWith(webRoot + path.sep)) {
      sendJson(response, 403, { error: 'File access is not allowed.' });
      return;
    }

    fs.readFile(filePath, function (error, content) {
      if (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
          console.error('VETO could not read a website file.', error);
          sendJson(response, 500, { error: 'The website file could not be read.' });
          return;
        }
        sendJson(response, 404, { error: 'Page not found.' });
        return;
      }

      response.writeHead(200, {
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    });
  });

  server.on('close', function () {
    database.close();
  });

  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer();
  server.listen(port, '127.0.0.1', function () {
    console.log(`VETO is running at http://127.0.0.1:${port}`);
    console.log(`Decision database: ${process.env.VETO_DB_PATH || DEFAULT_DATABASE_PATH}`);
  });
}

module.exports = { createServer };
