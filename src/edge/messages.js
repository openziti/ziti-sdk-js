/*
Copyright 2019-2020 Netfoundry, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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