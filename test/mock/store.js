class MockStore {
  constructor(store) {
    this._store = store;
  }

  load(req, cb) {
    process.nextTick(function() {
      cb(null, {transactionID: req.body.state, redirectURI: 'http://www.example.com/auth/callback'})
    });
  }

  store(req, txn, cb) {
    req.__mock_store__ = {};
    req.__mock_store__.txn = txn;
    process.nextTick(function() {
      cb(null, 'mocktxn-1')
    });
  }

  update(req, h, txn, cb) {
    req.__mock_store__ = {};
    req.__mock_store__.uh = h;
    req.__mock_store__.utxn = txn;
    process.nextTick(function() {
      cb(null, 'mocktxn-1u')
    });
  }

  remove(req, h, cb) {
    req.__mock_store__ = {};
    req.__mock_store__.removed = h;
    process.nextTick(function() {
      cb(null)
    });
  }
}

module.exports = MockStore;
