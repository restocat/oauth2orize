/**
 * `BadRequestError` error.
 *
 * @api public
 */
class BadRequestError extends Error {
  constructor(message) {
    super();

    Error.captureStackTrace(this, arguments.callee);

    this.name = 'BadRequestError';
    this.message = message;
    this.status = 400;
  }
}

/**
 * Expose `BadRequestError`.
 */
module.exports = BadRequestError;
