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

const Buffer          = require('buffer/').Buffer  // note: the trailing slash is important!
const flatOptions     = require('flat-options');
const ls              = require('../utils/localstorage');
const defaultOptions  = require('./tls-connection-options');
const utils           = require('../utils/utils');
const zitiConstants   = require('../constants');
const forge           = require('node-forge');
const ab2str          = require('arraybuffer-to-string');
const isUndefined     = require('lodash.isundefined');
const isNull          = require('lodash.isnull');
const { v4: uuidv4 }  = require('uuid');

forge.options.usePureJavaScript = true;


/**
 * @typicalname connection
 */
module.exports = class ZitiTLSConnection {

  /**
   *
   * @param {Options} [options]
   */
  constructor(options) {

    this._options = flatOptions(options, defaultOptions);

    this._type = this._options.type;  // debugging

    this._ctx = this._options.ctx;

    this._ws = this._options.ws;

    this._ch = this._options.ch;
    this._datacb = this._options.datacb;

    this._connected = false;

    this._uuid = uuidv4();

  }
 

  /**
   * Populate this TLS Connection object with the keypair from local storage
   */
  async pullKeyPair() {

    const self = this;

    return new Promise( async (resolve, reject) => {

      this._clientCertPEM       = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);
      this._clientPrivateKeyPEM = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);

      if (
        isUndefined(this._clientCertPEM) ||
        isUndefined(this._clientPrivateKeyPEM) ||
        isNull(this._clientCertPEM) ||
        isNull(this._clientPrivateKeyPEM)
      ) {
        return reject( new Error('keypair nor present in local storage') );
      }

      return resolve();

    });

  }  
 

  getUUID() {
    return this._uuid;
  }


  create() {

    let self = this;

    this._tlsClient = forge.tls.createConnection({

      // We're always the client
      server: false,
      
      // caStore: self._caStore, /* Array of PEM-formatted certs or a CA store object */
      caStore:forge.pki.createCaStore([]),

      //
      sessionCache: {},

      // These are the cipher suites we support (in order of preference)
      cipherSuites: [
        forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA256,
        // forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA256,
        // forge.tls.CipherSuites.TLS_RSA_WITH_AES_128_CBC_SHA,
        // forge.tls.CipherSuites.TLS_RSA_WITH_AES_256_CBC_SHA
      ],

      // virtualHost: 'curt-edge-wss-router:3023',
      verify: function(connection, verified, depth, certs) {
        // skip verification for testing
        return true;

        /*
        if(depth === 0) {
          var cn = certs[0].subject.getField('CN').value;
          if(cn !== 'curt-edge-wss-router') {
            verified = {
              alert: forge.tls.Alert.Description.bad_certificate,
              message: 'Certificate common name does not match hostname.'
            };
          }
        }
        return verified;
        */
      },

      connected: function(connection) {
        self._ctx.logger.debug('TLS handshake completed successfully');

        self._connected = true;

        // send message to server
        // connection.prepare(forge.util.encodeUtf8('Hi server!'));
        /* NOTE: experimental, start heartbeat retransmission timer
        myHeartbeatTimer = setInterval(function() {
          connection.prepareHeartbeatRequest(forge.util.createBuffer('1234'));
        }, 5*60*1000);*/
      },

      // client-side cert
      getCertificate: function(connection, hint) {
        self._ctx.logger.debug('getCertificate(): for: %o, [%o]', self._uuid, self._clientCertPEM );
        return self._clientCertPEM;
      },

      // client-side private key
      getPrivateKey: function(connection, cert) {
        self._ctx.logger.debug('getPrivateKey(): for: %o, [%o]', self._uuid, self._clientPrivateKeyPEM );
        return self._clientPrivateKeyPEM;
      },

      // encrypted data is ready to be sent to the server  --->
      tlsDataReady: function(connection) {
        let chunk = new Buffer(connection.tlsData.getBytes(), "binary");
        if (chunk.length > 0) {
          self._ctx.logger.trace('tlsDataReady: encrypted data is ready to be sent to the server  ---> [%o]', chunk);
          self._ws.send(chunk);
        }
      },

      // clear data from the server is ready               <---
      dataReady: function(connection) {
        let chunk = new Buffer(connection.data.getBytes(), "binary");
        let ab = chunk.buffer.slice(0, chunk.byteLength);
        self._ctx.logger.trace('dataReady: clear data from the server is ready  <--- ' );
        self._datacb(self._ch, ab);
      },

      /* NOTE: experimental
      heartbeatReceived: function(connection, payload) {
        // restart retransmission timer, look at payload
        clearInterval(myHeartbeatTimer);
        myHeartbeatTimer = setInterval(function() {
          connection.prepareHeartbeatRequest(forge.util.createBuffer('1234'));
        }, 5*60*1000);
        payload.getBytes();
      },*/

      closed: function(connection) {
          self._ctx.logger.debug('disconnected');
      },

      error: function(connection, error) {
        debugger
          self._ctx.logger.error('uh oh', error);
          throw error;
      }
    });
  }


  /**
   * 
   */
  handshake() {
    this._tlsClient.handshake();
  }

  /**
   * 
   * @param {*} data 
   */
  isTLSHandshakeComplete() {
    return this._connected;
  }


  /**
   * 
   * @param {*} data 
   */
  process(data) {
    this._ctx.logger.trace('process: encrypted data from the server arrived  <--- [%o]', data);
    let results = this._tlsClient.process(data);
  }
  

  /**
   * 
   * @param {*} data 
   */
  prepare(wireData) {
    this._ctx.logger.trace('prepare: unencrypted data is ready to be sent to the server  ---> [%o]', wireData);
    let tlsBinaryString = Buffer.from(wireData).toString('binary')
    this._tlsClient.prepare(tlsBinaryString);
  }

}

  
  