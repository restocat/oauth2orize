/**
 * `ForbiddenError` error.
 *
 * @api public
 */
class ForbiddenError extends Error {
  constructor(message) {
    super();

    Error.captureStackTrace(this, arguments.callee);

    this.name = 'ForbiddenError';
    this.message = message;
    this.status = 403;
  }
}

/**
 * Expose `ForbiddenError`.
 */
module.exports = ForbiddenError;
