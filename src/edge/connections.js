/**
 * Class for manage pending messages.
 * @private
 */

const PromiseController = require('promise-controller');
const promiseFinally = require('promise.prototype.finally');

module.exports = class ZitiConnections {
  constructor() {
    this._items = new Map();
  }

  _saveConnection(conn) {
    this._items.set(conn.getConnId(), conn);
  }

  _deleteConnection(conn) {
      this._items.delete(conn.getConnId());
  }

  _getConnection(connId) {
    if (this._items.has(connId)) {
      return this._items.get(connId);
    } else {
      return undefined;
    }
  }

};