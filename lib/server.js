const SessionStore = require('./txn/session');
const UnorderedList = require('./unorderedlist');
const authorization = require('./middleware/authorization');
const resume = require('./middleware/resume');
const decision = require('./middleware/decision');
const transactionLoader = require('./middleware/transactionLoader');
const token = require('./middleware/token');
const authorizationErrorHandler = require('./middleware/authorizationErrorHandler');
const errorHandler = require('./middleware/errorHandler');
const utils = require('./utils');
const debug = require('debug')('restocat-oauth2');


/**
 * `Server` constructor.
 *
 * @api public
 */
class Server {
  constructor(options = {}) {
    this._reqParsers = [];
    this._resHandlers = [];
    this._errHandlers = [];
    this._exchanges = [];

    this._serializers = [];
    this._deserializers = [];
    this._txnStore = options.store || new SessionStore();
  }


  /**
   * Register authorization grant middleware.
   *
   * OAuth 2.0 defines an authorization framework, in which authorization grants
   * can be of a variety of types.  Initiating and responding to an OAuth 2.0
   * authorization transaction is implemented by grant middleware, and the server
   * registers the middleware it wishes to support.
   *
   * Examples:
   *
   *     server.grant(oauth2orize.grant.code());
   *
   *     server.grant('*', function(req) {
   *       return { host: req.headers['host'] }
   *     });
   *
   *     server.grant('foo', function(req) {
   *       return { foo: req.query['foo'] }
   *     });
   *
   * @param {String|Object} type
   * @param {String} phase
   * @param {Function} fn
   * @return {Server} for chaining
   * @api public
   */
  grant(type, phase, fn) {
    const typeIsObject = typeof type === 'object';
    const phaseIsObject = typeof phase === 'object';

    if (typeIsObject || phaseIsObject) {
      const {error, request, response, name} = typeIsObject ? type : phase;

      // sig: grant(mod)
      if (request) {
        this.grant(name, 'request', request);
      }

      if (response) {
        this.grant(name, 'response', response);
      }

      if (error) {
        this.grant(name, 'error', error);
      }

      return this;
    }

    if (typeof phase === 'function') {
      // sig: grant(type, fn)
      fn = phase;
      phase = 'request';
    }
    if (type === '*') {
      type = null;
    }
    if (type) {
      type = new UnorderedList(type);
    }

    if (phase === 'request') {
      debug('register request parser %s %s', type || '*', fn.name || 'anonymous');
      this._reqParsers.push({type: type, handle: fn});
    } else if (phase === 'response') {
      debug('register response handler %s %s', type || '*', fn.name || 'anonymous');
      this._resHandlers.push({type: type, handle: fn});
    } else if (phase === 'error') {
      debug('register error handler %s %s', type || '*', fn.name || 'anonymous');
      this._errHandlers.push({type: type, handle: fn});
    }

    return this;
  };

  /**
   * Register token exchange middleware.
   *
   * OAuth 2.0 defines an authorization framework, in which authorization grants
   * can be of a variety of types.  Exchanging of these types for access tokens is
   * implemented by exchange middleware, and the server registers the middleware
   * it wishes to support.
   *
   * Examples:
   *
   *     server.exchange(oauth2orize.exchange.authorizationCode(function() {
   *       ...
   *     }));
   *
   * @param {String|Function} type
   * @param {Function} fn
   * @return {Server} for chaining
   * @api public
   */
  exchange(type, fn) {
    if (typeof type === 'function') {
      fn = type;
      type = fn.name;
    }
    if (type === '*') {
      type = null;
    }

    debug('register exchanger %s %s', type || '*', fn.name || 'anonymous');
    this._exchanges.push({type: type, handle: fn});
    return this;
  };

  /**
   * Parses requests to obtain authorization.
   *
   * @api public
   */
  authorization(options, validate, immediate, complete) {
    return authorization(this, options, validate, immediate, complete);
  };

  resume(options, immediate, complete) {
    let loader;
    if (typeof options === 'function' && typeof immediate === 'function' && typeof complete === 'function') {
      options = {loadTransaction: options};
    }

    if (options && options.loadTransaction === false) {
      return resume(this, options, immediate, complete);
    }

    if (options && typeof options.loadTransaction === 'function') {
      loader = options.loadTransaction;
    } else {
      loader = transactionLoader(this, options);
    }

    return [loader, resume(this, options, immediate, complete)];
  };

  /**
   * Handle a user's response to an authorization dialog.
   *
   * @api public
   */
  decision(options, parse, complete) {
    if (options && options.loadTransaction === false) {
      return decision(this, options, parse, complete);
    }
    return [transactionLoader(this, options), decision(this, options, parse, complete)];
  };

  authorizationErrorHandler(options) {
    const loader = transactionLoader(this, options);

    function transactionLoaderErrorWrapper(err, req, res, next) {
      loader(req, res, ierr => next(err));
    }

    return [transactionLoaderErrorWrapper, authorizationErrorHandler(this, options)];
  };

  /**
   * Handle requests to exchange an authorization grant for an access token.
   *
   * @api public
   */
  token(options) {
    return token(this, options);
  }

  /**
   * Respond to errors encountered in OAuth 2.0 endpoints.
   *
   * @api public
   */
  errorHandler(options) {
    return errorHandler(options);
  }

  /**
   * Registers a function used to serialize client objects into the session.
   *
   * Examples:
   *
   *     server.serializeClient(function(client, done) {
   *       done(null, client.id);
   *     });
   *
   * @api public
   */
  serializeClient(fn, done) {
    if (typeof fn === 'function') {
      return this._serializers.push(fn);
    }

    // private implementation that traverses the chain of serializers, attempting
    // to serialize a client
    const client = fn;
    const stack = this._serializers;
    (function pass(i, err, obj) {
      // serializers use 'pass' as an error to skip processing
      if ('pass' === err) {
        err = undefined;
      }

      // an error or serialized object was obtained, done
      if (err || obj) {
        return done(err, obj);
      }

      const layer = stack[i];
      if (!layer) {
        return done(new Error('Failed to serialize client. Register serialization function using serializeClient().'));
      }

      try {
        layer(client, (e, o) => pass(i + 1, e, o));
      } catch (ex) {
        return done(ex);
      }
    })(0);
  }

  /**
   * Registers a function used to deserialize client objects out of the session.
   *
   * Examples:
   *
   *     server.deserializeClient(function(id, done) {
   *       Client.findById(id, function (err, client) {
   *         done(err, client);
   *       });
   *     });
   *
   * @api public
   */
  deserializeClient(fn, done) {
    if (typeof fn === 'function') {
      return this._deserializers.push(fn);
    }

    // private implementation that traverses the chain of deserializers,
    // attempting to deserialize a client
    const obj = fn;
    const stack = this._deserializers;
    (function pass(i, err, client) {
      // deserializers use 'pass' as an error to skip processing
      if ('pass' === err) {
        err = undefined;
      }
      // an error or deserialized client was obtained, done
      if (err || client) {
        return done(err, client);
      }
      // a valid client existed when establishing the session, but that client has
      // since been deauthorized
      if (client === null || client === false) {
        return done(null, false);
      }

      const layer = stack[i];
      if (!layer) {
        return done(new Error('Failed to deserialize client. Register deserialization function using deserializeClient().'));
      }

      try {
        layer(obj, (e, c) => pass(i + 1, e, c));
      } catch (ex) {
        return done(ex);
      }
    })(0);
  }


  /**
   * Parse authorization request into transaction using registered grant middleware.
   *
   * @param {String} type
   * @param {http.ServerRequest} req
   * @param {Function} cb
   * @api private
   */
  _parse(type, req, cb) {
    const ultype = new UnorderedList(type);
    const stack = this._reqParsers;
    const areq = {};

    if (type) {
      areq.type = type;
    }

    (function pass(i) {
      const layer = stack[i];
      if (!layer) {
        return cb(null, areq);
      }

      try {
        debug('parse:%s', layer.handle.name || 'anonymous');
        if (layer.type === null || layer.type.equalTo(ultype)) {

          const arity = layer.handle.length;
          if (arity === 1) { // sync
            const o = layer.handle(req);

            utils.merge(areq, o);
            pass(i + 1);
          } else { // async
            layer.handle(req, (err, o) => {
              if (err) {
                return cb(err);
              }

              utils.merge(areq, o);
              pass(i + 1);
            });
          }
        } else {
          pass(i + 1);
        }
      } catch (ex) {
        return cb(ex);
      }
    })(0);
  }

  /**
   * Respond to authorization transaction using registered grant middleware.
   *
   * @param {Object} txn
   * @param {http.ServerResponse} res
   * @param {Function} cb
   * @api private
   */
  _respond(txn, res, complete, cb) {
    if (cb === undefined) {
      cb = complete;
      complete = undefined;
    }

    const ultype = new UnorderedList(txn.req.type);
    const stack = this._resHandlers;
    let idx = 0;

    function next(err) {
      if (err) {
        return cb(err);
      }

      const layer = stack[idx++];
      if (!layer) {
        return cb();
      }

      try {
        debug('respond:%s', layer.handle.name || 'anonymous');
        if (layer.type === null || layer.type.equalTo(ultype)) {
          const arity = layer.handle.length;
          if (arity === 4) {
            layer.handle(txn, res, complete, next);
          } else {
            layer.handle(txn, res, next);
          }
        } else {
          next();
        }
      } catch (ex) {
        return cb(ex);
      }
    }

    next();
  }

  _respondError(err, txn, res, cb) {
    const ultype = new UnorderedList(txn.req.type);
    const stack = this._errHandlers;
    let idx = 0;

    function next(err) {
      const layer = stack[idx++];
      if (!layer) {
        return cb(err);
      }

      try {
        debug('error:%s', layer.handle.name || 'anonymous');
        if (layer.type === null || layer.type.equalTo(ultype)) {
          layer.handle(err, txn, res, next);
        } else {
          next(err);
        }
      } catch (ex) {
        return cb(ex);
      }
    }

    next(err);
  }

  /**
   * Process token request using registered exchange middleware.
   *
   * @param {String} type
   * @param {http.ServerRequest} req
   * @param {http.ServerResponse} res
   * @param {Function} cb
   * @api private
   */
  _exchange(type, req, res, cb) {
    const stack = this._exchanges;
    let idx = 0;

    function next(err) {
      if (err) {
        return cb(err);
      }

      const layer = stack[idx++];
      if (!layer) {
        return cb();
      }

      try {
        debug('exchange:%s', layer.handle.name || 'anonymous');
        if (layer.type === null || layer.type === type) {
          layer.handle(req, res, next);
        } else {
          next();
        }
      } catch (ex) {
        return cb(ex);
      }
    }

    next();
  }
}

Server.prototype.authorizeError = Server.prototype.authorizationErrorHandler;
Server.prototype.authorizationError = Server.prototype.authorizationErrorHandler;

exports = module.exports = Server;
