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
 * Module dependencies.
 */

const flatOptions     = require('flat-options');

const defaultOptions  = require('./connection-options');
const edge_protocol   = require('./protocol');
const Messages        = require('./messages');


/**
 * @typicalname connection
 */
module.exports = class ZitiConnection {

  /**
   *
   * @param {Options} [options]
   */
  constructor(options) {

    this._options = flatOptions(options, defaultOptions);

    this._ctx = this._options.ctx;

    this._data = this._options.data;

    this._state = edge_protocol.conn_state.Initial;

    this._timeout = this._ctx.getTimeout();

    this._edgeMsgSeq = 1;

    this._id = this._ctx.getNextConnectionId();

    this._messages = new Messages({ ctx: this._ctx, conn: this });

  }

  getCtx() {
    return this._ctx;
  }

  getData() {
    return this._data;
  }

  getMessages() {
    return this._messages;
  }

  getState() {
    return this._state;
  }
  setState(state) {
    this._state = state;
  }

  getId() {
    return this._id;
  }

  getAndIncrementSequence() {
    let seq = this._edgeMsgSeq;
    this._edgeMsgSeq++;
    return seq;
  }

  getSocket() {
    return this._socket;
  }
  setSocket(socket) {
    this._socket = socket;
  }
  getDataCallback() {
    return this._dataCallback;
  }
  setDataCallback(fn) {
    this._dataCallback = fn;
  }

  getChannel() {
    return this._channel;
  }
  setChannel(channel) {
    this._channel = channel;
  }

  getEncrypted() {
    return this._encrypted;
  }
  setEncrypted(encrypted) {
    this._encrypted = encrypted;
  }

  getCryptoEstablishComplete() {
    return this._cryptoEstablishComplete;
  }
  setCryptoEstablishComplete(complete) {
    this._cryptoEstablishComplete = complete;
  }

  getKeypair() {
    return this._keypair;
  }
  setKeypair(keypair) {
    this._keypair = keypair;
  }

  getSharedRx() {
    return this._sharedRx;
  }
  setSharedRx(sharedRx) {
    this._sharedRx = sharedRx;
  }

  getSharedTx() {
    return this._sharedTx;
  }
  setSharedTx(sharedTx) {
    this._sharedTx = sharedTx;
  }

  getCrypt_o() {
    return this._crypt_o;
  }
  setCrypt_o(crypt_o) {
    this._crypt_o = crypt_o;
  }

  getCrypt_i() {
    return this._crypt_i;
  }
  setCrypt_i(crypt_i) {
    this._crypt_i = crypt_i;
  }

}