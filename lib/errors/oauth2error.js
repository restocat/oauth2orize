/**
 * `OAuth2Error` error.
 *
 * @api public
 */
class OAuth2Error extends Error {
  constructor(message, code, uri, status) {
    super();

    this.message = message;
    this.code = code || 'server_error';
    this.uri = uri;
    this.status = status || 500;
  }
}

/**
 * Expose `OAuth2Error`.
 */
module.exports = OAuth2Error;
