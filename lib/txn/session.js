const utils = require('../utils');
const AuthorizationError = require('../errors/authorizationerror');
const BadRequestError = require('../errors/badrequesterror');
const ForbiddenError = require('../errors/forbiddenerror');

class SessionStore {
  constructor() {
    this.legacy = true;
  }

  load(server, options, req, cb) {
    const field = options.transactionField || 'transaction_id';
    const key = options.sessionKey || 'authorize';

    if (!req.session) {
      return cb(new Error('OAuth2orize requires session support. Did you forget app.use(express.session(...))?'));
    }
    if (!req.session[key]) {
      return cb(new ForbiddenError('Unable to load OAuth 2.0 transactions from session'));
    }

    const query = req.query || {};
    const body = req.body || {};
    const tid = query[field] || body[field];

    if (!tid) {
      return cb(new BadRequestError('Missing required parameter: ' + field));
    }
    const txn = req.session[key][tid];
    if (!txn) {
      return cb(new ForbiddenError('Unable to load OAuth 2.0 transaction: ' + tid));
    }

    const self = this;
    server.deserializeClient(txn.client, function(err, client) {
      if (err) {
        return cb(err);
      }
      if (!client) {
        // At the time the request was initiated, the client was validated.
        // Since then, however, it has been invalidated.  The transaction will
        // be invalidated and no response will be sent to the client.
        self.remove(options, req, tid, function(err) {
          if (err) {
            return cb(err);
          }
          return cb(new AuthorizationError('Unauthorized client', 'unauthorized_client'));
        });
        return;
      }

      txn.transactionID = tid;
      txn.client = client;
      cb(null, txn);
    });
  }

  store(server, options, req, txn, cb) {
    const lenTxnID = options.idLength || 8;
    const key = options.sessionKey || 'authorize';

    if (!req.session) {
      return cb(new Error('OAuth2orize requires session support. Did you forget app.use(express.session(...))?'));
    }

    server.serializeClient(txn.client, function(err, obj) {
      if (err) {
        return cb(err);
      }

      const tid = utils.uid(lenTxnID);
      txn.client = obj;

      // store transaction in session
      const txns = req.session[key] = req.session[key] || {};
      txns[tid] = txn;

      cb(null, tid);
    });
  }

  update(server, options, req, tid, txn, cb) {
    const key = options.sessionKey || 'authorize';

    server.serializeClient(txn.client, function(err, obj) {
      if (err) {
        return cb(err);
      }

      txn.client = obj;

      // store transaction in session
      const txns = req.session[key] = req.session[key] || {};
      txns[tid] = txn;

      cb(null, tid);
    });
  }

  remove(options, req, tid, cb) {
    const key = options.sessionKey || 'authorize';

    if (!req.session) {
      return cb(new Error('OAuth2orize requires session support. Did you forget app.use(express.session(...))?'));
    }

    if (req.session[key]) {
      delete req.session[key][tid];
    }

    cb();
  }
}

module.exports = SessionStore;
