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

const flatOptions = require('flat-options');

const defaultOptions = require('./options');
const edge_protocol = require('./protocol');
const zitiConstants = require('../constants');



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

    this._ctx = ziti.context;

    this._data = this._options.data;

    this._state = edge_protocol.conn_state.Initial;

    this._timeout = zitiConstants.get().ZITI_DEFAULT_TIMEOUT;

    this._edgeMsgSeq = 0;

    this._connId = ziti.context.getNextConnectionId();

  }

  getData() {
    return this._data;
  }

  getState() {
    return this._state;
  }
  setState(state) {
    this._state = state;
  }

  getConnId() {
    return this._connId;
  }

  getAndIncrementSequence() {
    return this._edgeMsgSeq++;
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