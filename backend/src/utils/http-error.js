'use strict';

class HttpError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.exposeMessage = statusCode < 500 || statusCode === 503;
  }
}

module.exports = { HttpError };
