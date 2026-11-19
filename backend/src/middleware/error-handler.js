'use strict';

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : Number.isInteger(error.status) ? error.status : 500;
  const code = error.code || 'REQUEST_FAILED';

  if (statusCode >= 500) {
    console.error('VETO request failed.', {
      method: request.method,
      path: request.path,
      code
    });
  }

  const message = statusCode >= 500
    ? (statusCode === 503 && error.exposeMessage ? error.message : 'The request could not be completed.')
    : error.message;
  response.status(statusCode).json({ error: message, code });
}

module.exports = { errorHandler };
