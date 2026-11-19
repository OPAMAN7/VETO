'use strict';

const { HttpError } = require('../utils/http-error');

function createRateLimit({ limit, windowMs }) {
  const requests = new Map();
  let operations = 0;

  return function rateLimit(request, response, next) {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let entry = requests.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      requests.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > limit) {
      response.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      next(new HttpError('Too many requests. Please try again shortly.', 429, 'RATE_LIMITED'));
      return;
    }

    operations += 1;
    if (operations % 256 === 0) {
      for (const [requestKey, value] of requests) {
        if (now >= value.resetAt) requests.delete(requestKey);
      }
    }
    next();
  };
}

module.exports = { createRateLimit };
