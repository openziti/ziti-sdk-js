/**
 * Class for manage pending messages.
 * @private
 */

const PromiseController = require('promise-controller');
const promiseFinally = require('promise.prototype.finally');
const isNull = require('lodash.isnull');


module.exports = class Messages {
  constructor() {
    this._items = new Map();
  }

  /**
   * Creates new message and stores it in the list.
   *
   * @param {String|Number} messageId
   * @param {Function} fn
   * @param {Number} timeout
   * @returns {Promise}
   */
  create(messageId, fn, timeout) {
    this._rejectExistingMessage(messageId);
    return this._createNewMessage(messageId, fn, timeout);
  }

  resolve(messageId, data) {
    ziti.context.logger.debug("messages.resolve(): messageId: [%o]", messageId);
    if (!isNull(messageId) && this._items.has(messageId)) {
      ziti.context.logger.debug("messages.resolve(): messageId: [%o] FOUND.", messageId);
      this._items.get(messageId).resolve(data);
    }
  }

  rejectAll(error) {
    this._items.forEach(message => message.isPending ? message.reject(error) : null);
  }

  _rejectExistingMessage(messageId) {
    const existingMessage = this._items.get(messageId);
    if (existingMessage && existingMessage .isPending) {
      existingMessage .reject(new Error(`message is replaced, messageId: ${messageId}`));
    }
  }

  _createNewMessage(messageId, fn, timeout) {
    const message = new PromiseController({
      timeout,
      timeoutReason: `message was rejected by timeout (${timeout} ms). messageId: ${messageId}`
    });
    this._items.set(messageId, message);
    return promiseFinally(message.call(fn), () => this._deleteMessage (messageId, message));
  }

  _deleteMessage (messageId, message) {
    // this check is important when message was replaced
    if (this._items.get(messageId) === message) {
      this._items.delete(messageId);
    }
  }
};