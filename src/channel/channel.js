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
const PromiseController = require('promise-controller');
const isNull          = require('lodash.isnull');
const forEach         = require('lodash.foreach');
const isEqual         = require('lodash.isequal');
const isUndefined     = require('lodash.isundefined');
const concat          = require('lodash.concat');
const formatMessage   = require('format-message');
const sodium          = require('libsodium-wrappers');

const defaultOptions  = require('./channel-options');
const edge_protocol   = require('./protocol');
const zitiConstants   = require('../constants');
const ZitiConnections = require('./connections');
const ZitiWebSocket   = require('../websocket/websocket');
const Header          = require('./header');
const Messages        = require('./messages');
const {throwIf}       = require('../utils/throwif');
const utils           = require('../utils/utils');
const ZitiTLSConnection   = require('./tls-connection');


/**
 * @typicalname channel
 */
module.exports = class ZitiChannel {

  /**
   *
   * @param {Options} [options]
   */
  constructor(options) {

    this._options = flatOptions(options, defaultOptions);

    this._ctx = this._options.ctx;

    this._id = this._ctx.getNextChannelId();

    this._data = this._options.data;

    this._timeout = this._options.timeout;
    this._helloTimeout = this._options.helloTimeout;

    this._state = edge_protocol.conn_state.Initial;

    this._msgSeq = -1;

    this._edgeRouter = this._options.edgeRouter;
    this._edgeRouterHost = this._edgeRouter.hostname;

    this._connections = new ZitiConnections();

    this._zws = new ZitiWebSocket( this._edgeRouter.urls.ws + '/ws' , { ctx: this._ctx} );
    this._callerId = "ws:";

    this._zws.onMessage.addListener(this._recvFromWire, this);

    this._zws.onClose.addListener(this._recvClose, this);

    this._createHelloController();

    // Set the maximum timestamp
    this._helloCompletedTimestamp = new Date(8640000000000000); // http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.1

    this._messages = new Messages({ ctx: this._ctx, channel: this });

    this._view_version = new Uint8Array(new ArrayBuffer(4));
    this._view_version.set(edge_protocol.VERSION, 0);

  }

  getCtx() {
    return this._ctx;
  }

  getId() {
    return this._id;
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

  getAndIncrementSequence() {
    return this._msgSeq++;
  }

  getEdgeRouterHost() {
    return this._edgeRouterHost;
  }


  /**
   * 
   */
  get helloCompletedTimestamp() {
    return this._helloCompletedTimestamp;
  }


  /**
   * Has this Channel already completed the 'hello' sequence?
   *
   * @returns {Boolean}
   */
  get isHelloCompleted() {
    return Boolean(this._helloCompleted);
  }


  _createHelloController() {
    const helloTimeout = this._helloTimeout || this._timeout;
    this._helloing = new PromiseController({
      timeout: helloTimeout,
      timeoutReason: `Can't complete 'Hello' within allowed timeout: ${helloTimeout} ms.`
    });
  }


  /**
   * Remain in lazy-sleepy loop until tlsConn has completed its TLS handshake.
   * 
   */
  async awaitTLSHandshakeComplete() {
    let self = this;
    return new Promise((resolve) => {
      (function waitForTLSHandshakeComplete() {
        if (!self._tlsConn.isTLSHandshakeComplete()) {
          self._ctx.logger.trace('awaitTLSHandshakeComplete() tlsConn for ch[%d] TLS handshake still not complete', self.getId());
          setTimeout(waitForTLSHandshakeComplete, 100);  
        } else {
          self._ctx.logger.trace('tlsConn for ch[%d] TLS handshake is now complete', self.getId());
          return resolve();
        }
      })();
    });
  }

  /**
   * Do Hello handshake between this channel and associated Edge Router.
   * 
   */
  async hello() {

    await this._zws.open();

    if (this.isHelloCompleted) {
      this._ctx.logger.trace('Hello handshake was previously completed');
      return new Promise( async (resolve) => {
        resolve( {channel: this, data: null});
      });
    }

    if (isEqual(this._callerId, "ws:")) {

      this._tlsConn = new ZitiTLSConnection({
        type: 'edge-router',
        ctx: this._ctx,
        ws: this._zws,
        ch: this,
        datacb: this._recvFromWireAfterDecrypt

      });
  
      this._tlsConn.create();

      this._ctx.logger.debug('initiating TLS handshake');

      this._tlsConn.handshake();

      await this.awaitTLSHandshakeComplete();

      this._ctx.logger.debug('TLS handshake completed');

    }

    this._ctx.logger.debug('initiating message: edge_protocol.content_type.HelloType');

    let headers = [
      new Header( edge_protocol.header_id.SessionToken, { 
        headerType: edge_protocol.header_type.StringType, 
        headerData: this._options.session_token 
      }),
      new Header( edge_protocol.header_id.CallerId, { 
        headerType: edge_protocol.header_type.StringType, 
        headerData: this._callerId 
      })
    ]; 

    let sequence = this.getAndIncrementSequence();

    let msg = await this.sendMessage( edge_protocol.content_type.HelloType, headers, null, { 
      sequence: sequence,
    });

    this._helloCompletedTimestamp = Date.now();
    this._helloCompleted = true;
    this.setState(edge_protocol.conn_state.Connected);
    this._ctx.logger.debug('ch[%d] Hello handshake to Edge Router [%s] completed at timestamp[%o]', this._id, this._edgeRouterHost, this._helloCompletedTimestamp);

    return new Promise( async (resolve) => {
      resolve( {channel: this, data: null});
    });

  }


  /**
   * Connect specified Connection to associated Edge Router.
   * 
   */
  async connect(conn) {

    const self = this;
    return new Promise( async (resolve, reject) => {
    
      self._ctx.logger.debug('initiating Connect to Edge Router [%s] for conn[%d]', this._edgeRouterHost, conn.getId());
  
      await sodium.ready;
    
      let keypair = sodium.crypto_kx_keypair();
  
      conn.setKeypair(keypair);
  
      let sequence = this.getAndIncrementSequence();

      let headers = [
    
        new Header( edge_protocol.header_id.ConnId, {
          headerType: edge_protocol.header_type.IntType,
          headerData: conn.getId()
        }),
  
        new Header( edge_protocol.header_id.SeqHeader, { 
          headerType: edge_protocol.header_type.IntType, 
          headerData: 0 
        }),
    
      ];

      if (conn.getEncrypted()) {  // if connected to a service that has 'encryptionRequired'

        headers.push(
        
          new Header( edge_protocol.header_id.PublicKey, { 
            headerType: edge_protocol.header_type.Uint8ArrayType, 
            headerData: keypair.publicKey
          })
    
        );
      }
  
      conn.setState(edge_protocol.conn_state.Connecting);
  
      self._ctx.logger.debug('about to send Connect to Edge Router [%s] for conn[%d]', conn.getChannel().getEdgeRouterHost(), conn.getId());
  
      let msg = await self.sendMessage( edge_protocol.content_type.Connect, headers, self._options.network_session_token, { 
          conn: conn,
          sequence: sequence,
        } 
      );

      self._ctx.logger.debug('connect() calling _recvConnectResponse() for conn[%d]', conn.getId());

      await self._recvConnectResponse(msg.data, conn);
    
      resolve();
  
    });
  }


  /**
   * Close specified Connection to associated Edge Router.
   * 
   */
  async close(conn) {

    const self = this;
    return new Promise( async (resolve, reject) => {
    
      self._ctx.logger.debug('initiating Close to Edge Router [%s] for conn[%d]', this._edgeRouterHost, conn.getId());
  
      let sequence = conn.getAndIncrementSequence();

      let headers = [
    
        new Header( edge_protocol.header_id.ConnId, {
          headerType: edge_protocol.header_type.IntType,
          headerData: conn.getId()
        }),
  
        new Header( edge_protocol.header_id.SeqHeader, { 
          headerType: edge_protocol.header_type.IntType, 
          headerData: sequence
        }),
    
      ];
    
      self._ctx.logger.debug('about to send Close to Edge Router [%s] for conn[%d]', conn.getChannel().getEdgeRouterHost(), conn.getId());
  
      let msg = await self.sendMessage( edge_protocol.content_type.StateClosed, headers, self._options.network_session_token, { 
          conn: conn,
          sequence: sequence,
        } 
      );

      self._ctx.logger.debug('close() completed with response[%o]', msg);

      conn.setState(edge_protocol.conn_state.Closed);
    
      resolve();
  
    });
  }


  /**
   * Receives response from Edge 'Connect' message.
   * 
   */
  async _recvConnectResponse(msg, expectedConn) {

    // let buffer = await msg.arrayBuffer();
    let buffer = await msg.buffer;
    let contentTypeView = new Int32Array(buffer, 4, 1);
    let contentType = contentTypeView[0];
    let sequenceView = new Int32Array(buffer, 8, 1);
    let sequence = sequenceView[0];
    let connId = await this._messageGetConnId(msg);
    let conn = this._connections._getConnection(connId);
    throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );
    if (!isEqual(conn.getId(), expectedConn.getId())) {
      this._ctx.logger.error("_recvConnectResponse() actual conn[%d] expected conn[%d]", conn.getId(), expectedConn.getId());
    }

    this._ctx.logger.debug("ConnectResponse contentType[%d] seq[%d] received for conn[%d]", contentType, sequence, conn.getId());

    switch (contentType) {

      case edge_protocol.content_type.StateClosed:

        this._ctx.logger.warn("conn[%d] failed to connect", conn.getId());
        conn.setState(edge_protocol.conn_state.Closed);
        break;

      case edge_protocol.content_type.StateConnected:

        if (conn.getState() == edge_protocol.conn_state.Connecting) {
          this._ctx.logger.debug("conn[%d] connected", conn.getId());

          if (conn.getEncrypted()) {  // if connected to a service that has 'encryptionRequired'

            await this._establish_crypto(conn, msg);
            this._ctx.logger.debug("establish_crypto completed for conn[%d]", conn.getId());

            await this._send_crypto_header(conn);
            this._ctx.logger.debug("send_crypto_header completed for conn[%d]", conn.getId());

          }

          conn.setState(edge_protocol.conn_state.Connected);
        }

        else if (conn.getState() == edge_protocol.conn_state.Closed || conn.getState() == edge_protocol.conn_state.Timedout) {
          this._ctx.logger.warn("received connect reply for closed/timedout conne[%d]", conn.getId());
          // ziti_disconnect(conn);
        }
        break;

      default:
        this._ctx.logger.error("unexpected content_type[%d] conn[%d]", contentType, conn.getId());
        // ziti_disconnect(conn);
    }

  }


  /**
   * 
   */
  async _establish_crypto(conn, msg) {

    this._ctx.logger.debug("_establish_crypto(): entered for conn[%d]", conn.getId());

    let result = await this._messageGetBytesHeader(msg, edge_protocol.header_id.PublicKey);
    let peerKey = result.data;
    this._ctx.logger.debug("_establish_crypto(): peerKey is: ", peerKey);

    if (peerKey == undefined) {
      this._ctx.logger.debug("_establish_crypto(): did not receive peer key. connection[%d] will not be encrypted: ", conn.getId());
      conn.setEncrypted(false);
      return;
    }

    if (conn.getState() == edge_protocol.conn_state.Connecting) {

      let keypair = conn.getKeypair();

      let results = sodium.crypto_kx_client_session_keys(keypair.publicKey, keypair.privateKey, peerKey);

      conn.setSharedRx(results.sharedRx);
      conn.setSharedTx(results.sharedTx);

    } else {
      this._ctx.logger.error("_establish_crypto(): cannot establish crypto while connection is in %d state: ", conn.getState());
    }

  }


  /**
   * Receives response from Edge 'Data' message where we sent the Crypto header.
   * 
   */
  async _recvCryptoResponse(msg) {

    let connId = await this._messageGetConnId(msg);
    this._ctx.logger.debug("_recvCryptoResponse(): entered for conn[%d]", connId);
    let conn = this._connections._getConnection(connId);
    throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );

    //
    let buffer = await msg.buffer;
    let headersLengthView = new Int32Array(buffer, 12, 1);
    let headersLength = headersLengthView[0];
    var bodyView = new Uint8Array(buffer, 20 + headersLength);

    let state_in = sodium.crypto_secretstream_xchacha20poly1305_init_pull(bodyView, conn.getSharedRx());
    
    conn.setCrypt_i(state_in);

    // Indicate that subsequent sends on this connection should be encrypted
    conn.setEncrypted(true);

    // Unblock writes to the connection now that we have sent the crypto header
    conn.setCryptoEstablishComplete(true);

    this._ctx.logger.debug("_recvCryptoResponse(): setCryptoEstablishComplete for conn[%d]", connId);

  }


  /**
   * Remain in lazy-sleepy loop until specified connection's crypto handshake is complete.
   * 
   * @param {*} conn 
   */
  awaitConnectionCryptoEstablishComplete(conn) {
    return new Promise((resolve) => {
      (function waitForCryptoEstablishComplete() {
        if (conn.getCryptoEstablishComplete()) {
          conn._ctx.logger.debug('Connection [%d] now Crypto-enabled with Edge Router', conn.getId());
          return resolve();
        }
        conn._ctx.logger.trace('awaitConnectionCryptoEstablishComplete() conn[%d] still not yet CryptoEstablishComplete', conn.getId());
        setTimeout(waitForCryptoEstablishComplete, 100);
      })();
    });
  }


  /**
   * 
   */
  async _send_crypto_header(conn) {

    const self = this;
    return new Promise( async (resolve, reject) => {

      let results = sodium.crypto_secretstream_xchacha20poly1305_init_push( conn.getSharedTx() );

      conn.setCrypt_o(results);

      let sequence = conn.getAndIncrementSequence();

      let headers = [

        new Header( edge_protocol.header_id.ConnId, {
          headerType: edge_protocol.header_type.IntType,
          headerData: conn.getId()
        }),

        new Header( edge_protocol.header_id.SeqHeader, { 
          headerType: edge_protocol.header_type.IntType, 
          headerData: sequence 
        })

      ];    

      self._ctx.logger.debug('_send_crypto_header(): conn[%d] sending Data [%o]', conn.getId(), conn.getCrypt_o().header);

      // self.sendMessageNoWait( edge_protocol.content_type.Data, headers, conn.getCrypt_o().header, { conn: conn, sequence: sequence });

      let msg = await self.sendMessage( edge_protocol.content_type.Data, headers, conn.getCrypt_o().header, {
          conn: conn,
          sequence: sequence,
        }
      );

      self._ctx.logger.debug('_send_crypto_header() calling _recvCryptoResponse() for conn[%d]', conn.getId());
      await self._recvCryptoResponse(msg.data, conn);

      resolve();

    });
  }


  /**
   * Write data over specified Edge Router connection.
   *
   * @returns {Promise}
   */
  async write(conn, data) {

    throwIf(isEqual(conn.getState(), edge_protocol.conn_state.Closed), formatMessage('Attempt to write data to a closed connection { actual }', { actual: conn.getId()}) );

    let sequence = conn.getAndIncrementSequence();

    let headers = [
      new Header( edge_protocol.header_id.ConnId, {
        headerType: edge_protocol.header_type.IntType,
        headerData: conn.getId()
      }),
      new Header( edge_protocol.header_id.SeqHeader, { 
        headerType: edge_protocol.header_type.IntType, 
        headerData: sequence 
      })
    ];

    this.sendMessageNoWait( edge_protocol.content_type.Data, headers, data, { conn: conn, sequence: sequence });
  }


  /**
   * Sends message and waits for response.
   *
   * @param {String|Number} contentType
   * @param {[Header]} headers
   * @param {*} body
   * @param {Object} [options]
   * @returns {Promise}
   */
  sendMessage(contentType, headers, body, options = {}) {
    const timeout = options.timeout !== undefined ? options.timeout : this._timeout;
    let messageId;
    if (!isUndefined(options.sequence)) {
      messageId = options.sequence;
    } else if (!isUndefined(this._sequence)) {
      messageId = this._sequence;
    } 
    throwIf(isUndefined(messageId), formatMessage('messageId is undefined', { } ) );
    
    let messagesQueue = this._messages;
    let conn;
    if (!isUndefined(options.conn)) {
      conn = options.conn;
      messagesQueue = options.conn.getMessages();
    }

    this._ctx.logger.debug("send -> conn[%o] seq[%o] contentType[%o] body[%s]", (conn ? conn.getId() : 'n/a'), messageId, contentType, (body ? body.toString() : 'n/a'));

    return messagesQueue.create(messageId, () => {
      this._sendMarshaled(contentType, headers, body, options, messageId);
    }, timeout);
  }


  /**
   * Sends message and does not wait for response.
   *
   * @param {String|Number} contentType
   * @param {[Header]} headers
   * @param {*} body
   * @param {Object} [options]
   * @returns {Promise}
   */
  sendMessageNoWait(contentType, headers, body, options = {}) {
    const timeout = options.timeout !== undefined ? options.timeout : this._timeout;
    const messageId = options.sequence || this._sequence;
    this._ctx.logger.debug("send (no wait) -> conn[%o] seq[%o] contentType[%o]", 
      (options.conn ? options.conn.getId() : 'n/a'), 
      messageId, contentType, 
      (body ? body.toString() : 'n/a'));

    this._sendMarshaled(contentType, headers, body, options, messageId);
  }


  /**
   * Marshals message into binary wire format and sends to the Edge Router.
   *
   * @param {String|Number} contentType
   * @param {[Header]} headers
   * @param {*} body
   * @param {Object} [options]
   * @param {int} messageId
   */
  _sendMarshaled(contentType, headers, body, options, messageId) {

    let dataToMarshal = body;

    if (contentType != edge_protocol.content_type.HelloType) {

      let connId;
      forEach(headers, function(header) {
        if (header.getId() == edge_protocol.header_id.ConnId) {
          connId = header.getData();
        }
      });
      throwIf(isUndefined(connId), formatMessage('Cannot find ConnId heder', { } ) );

      let conn = this._connections._getConnection(connId);
      throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );

      if (conn.getEncrypted() && conn.getCryptoEstablishComplete()) {  // if connected to a service that has 'encryptionRequired'

        let [state_out, header] = [conn.getCrypt_o().state, conn.getCrypt_o().header];

        let encryptedData = sodium.crypto_secretstream_xchacha20poly1305_push(
          state_out,
          body,
          null,
          sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE);

        dataToMarshal = encryptedData;
      }
    }

    const wireData = this._marshalMessage(contentType, headers, dataToMarshal, options, messageId);

    this._dumpHeaders(' -> ', wireData);

    // Inject the listener if specified
    if (options.listener !== undefined) {
      this._zws.onMessage.addOnceListener(options.listener, this);
    }

    // If connected to a WS edge router
    if (isEqual(this._callerId, "ws:")) {
      this._tlsConn.prepare(wireData);
    }
    else {
      this._zws.send(wireData);
    }
  }


  /**
   * Marshals message into binary wire format.
   *
   * @param {String|Number} contentType
   * @param {[Header]} headers
   * @param {*} body
   * @param {Object} [options]
   * @returns {byte[]}   
   */
  _marshalMessage(contentType, headers, body, options, messageId) {

    // wire-protocol: message-section
    let buffer_message_section = new ArrayBuffer(
      4   // Version
      +4  // ContentType  (offset 4)
      +4  // Sequence     (offset 8)
      +4  // hdrs-len     (offset 12)
      +4  // body-len     (offset 16)
    );
    
    // wire-protocol: Version
    let view_message_section = new Uint8Array(buffer_message_section);
    view_message_section.set(
      edge_protocol.VERSION, 
      0 // Offset 0
    );
    
    var bytes = new Buffer(4);
    
    // wire-protocol: ContentType
    bytes.writeUInt32LE(contentType, 0);
    view_message_section.set(
      bytes, 
      4 // Offset 4
    );
    
    bytes = new Buffer(4);
    
    // wire-protocol: Sequence
    bytes.writeInt32LE(messageId, 0);
    view_message_section.set(
      bytes, 
      8 // Offset 8
    );
        
    bytes = new Buffer(4);
  
    let hdrsLen = utils.sumBy(headers, function (header) {
      return header.getLength(); 
    });

    // wire-protocol: hdrs-len
    bytes.writeInt32LE(hdrsLen, 0);
    view_message_section.set(
      bytes, 
      12  // Offset 12
    );
    
    bytes = new Buffer(4);
     
    // wire-protocol: body-len
    let bodyLength = 0;
    if (!isNull(body)) {
      bodyLength = body.length;
    }

    bytes.writeUInt32LE(bodyLength, 0);
    view_message_section.set(
      bytes, 
      16  // Offset 16
    );
    
    // wire-protocol: headers
    let buffer_headers_section = new ArrayBuffer(hdrsLen);
    let view_headers_section = new Uint8Array(buffer_headers_section);
    let view_headers_section_offset = 0;
    forEach(headers, function(header) {
      view_headers_section.set(header.getBytesForWire(), view_headers_section_offset);
      view_headers_section_offset += header.getLength(); 
    });
    
    
    // wire-protocol: body
    let buffer_body_section = new ArrayBuffer(bodyLength);
    if (bodyLength > 0) {
      let view_body_section = new Uint8Array(buffer_body_section);
      let body_bytes;
      if (typeof body === 'string') {
        body_bytes = utils.toUTF8Array(body);
      } else {
        body_bytes = body;
      }
      let bytesBuffer = Buffer.from(body_bytes);
      view_body_section.set(bytesBuffer, 0);
    }
    
    // Put it all together
    let buffer_combined = utils.appendBuffer(buffer_message_section, buffer_headers_section);
    buffer_combined = utils.appendBuffer(buffer_combined, buffer_body_section);
    let view_combined = new Uint8Array(buffer_combined);
  
    return view_combined.buffer;
  }


  /**
   * Receives a close event from the Websocket.
   * 
   * @param {*} data 
   */
  async _recvClose(data) {

    this._ctx.closeChannelByEdgeRouter( this._edgeRouterHost );

  }


  /**
   * Receives a message from the Edge Router.
   * 
   * @param {*} data 
   */
  async _recvFromWire(data) {
    let buffer = await data.arrayBuffer();
    this._ctx.logger.trace("_recvFromWire <- data len[%o]", buffer.byteLength);
    let tlsBinaryString = Buffer.from(buffer).toString('binary');
    this._tlsConn.process(tlsBinaryString);
  }


  /**
   * Receives un-encrypted binary data from the Edge Router (which is either an entire edge protocol message, or a fragment thereof)
   * 
   * @param ArrayBuffer data 
   */
  async _recvFromWireAfterDecrypt(ch, data) {

    let buffer = data;

    if (!isUndefined(ch._partialMessage)) {  // if we are awaiting rest of a partial msg to arrive, append this chunk onto the end, then proceed
      let dataView = new Uint8Array(data);
      ch._partialMessage = utils.concatTypedArrays(ch._partialMessage, dataView);
      buffer = ch._partialMessage.buffer.slice(0);
    } 

    let versionView = new Uint8Array(buffer, 0, 4);
    throwIf(!isEqual(versionView[0], ch._view_version[0]), formatMessage('Unexpected message version. Got { actual }, expected { expected }', { actual: versionView[0], expected:  ch._view_version[0]}) );

    let headersLengthView = new Int32Array(buffer, 12, 1);
    let headersLength = headersLengthView[0];

    let bodyLengthView = new Int32Array(buffer, 16, 1);
    let bodyLength = bodyLengthView[0];

    let msgLength = ( 20 + headersLength + bodyLength );

    if (isEqual(msgLength, buffer.byteLength)) {  // if entire edge message is present, proceed with unmarshaling effort

      ch._partialMessage = undefined;
      
      ch._tryUnmarshal(buffer);

    } else {

      ch._partialMessage = new Uint8Array(buffer);

      if (buffer.byteLength > 20) { // if we have a portion of the data section of the edge message 
        ch._ctx.logger.debug("Only [%o] of msgLength [%o] received; will await rest of fragments before unmarshaling", buffer.byteLength, msgLength);
      }
    }
  }


  /**
   * Unmarshals binary from the wire into a message
   * 
   * @param {*} data 
   */
  async _tryUnmarshal(data) {

    let buffer = data;

    let versionView = new Uint8Array(buffer, 0, 4);
    throwIf(!isEqual(versionView[0], this._view_version[0]), formatMessage('Unexpected message version. Got { actual }, expected { expected }', { actual: versionView[0], expected:  this._view_version[0]}) );

    let contentTypeView = new Int32Array(buffer, 4, 1);
    let contentType = contentTypeView[0];

    let sequenceView = new Int32Array(buffer, 8, 1);
    this._ctx.logger.trace("recv <- contentType[%o] seq[%o]", contentType, sequenceView[0]);

    let responseSequence = sequenceView[0];

    let headersLengthView = new Int32Array(buffer, 12, 1);
    let headersLength = headersLengthView[0];
    this._ctx.logger.trace("recv <- headersLength[%o]", headersLength);

    let bodyLengthView = new Int32Array(buffer, 16, 1);
    let bodyLength = bodyLengthView[0];
    this._ctx.logger.trace("recv <- bodyLength[%o]", bodyLength);

    this._dumpHeaders(' <- ', buffer);
    var bodyView = new Uint8Array(buffer, 20 + headersLength);

    let connId;
    let conn;
    let replyForView;
    let haveResponseSequence = false;

    /**
     *  First Data msg for a new connection needs special handling
     */
    if (contentType == edge_protocol.content_type.Data) {
      connId = await this._messageGetConnId(data);
      if (!isUndefined(connId)) {
        conn = this._connections._getConnection(connId);
        if (!isUndefined(conn)) {
          if (isEqual(conn.getState(), edge_protocol.conn_state.Connecting)) {
            let result = await this._messageGetBytesHeader(data, edge_protocol.header_id.SeqHeader);
            if (!isUndefined(result)) {
              replyForView = new Int32Array(result.data, 0, 1);
              responseSequence = replyForView[0];  
              haveResponseSequence = true;
              this._ctx.logger.debug("recv <- ReplyFor[%o] (should be for the crypto_header response)", responseSequence);
            }  
          }
        }
      }
    }


    if (!haveResponseSequence && (contentType >= edge_protocol.content_type.StateConnected)) {

      let result = await this._messageGetBytesHeader(data, edge_protocol.header_id.ReplyFor);
      if (!isUndefined(result)) {

        replyForView = new Int32Array(result.data, 0, 1);
        responseSequence = replyForView[0];  
        this._ctx.logger.trace("recv <- ReplyFor[%o]", responseSequence);

      } else {

        if ( isEqual(contentType, edge_protocol.content_type.Data) && isEqual(bodyLength, 0) ) {

          let result = await this._messageGetBytesHeader(data, edge_protocol.header_id.SeqHeader);
          replyForView = new Int32Array(result.data, 0, 1);
          responseSequence = replyForView[0];  
          this._ctx.logger.trace("recv <- Close Response For [%o]", responseSequence);  
  
        } else {

          this._ctx.logger.trace("recv <- ReplyFor[%o]", 'n/a');  
          responseSequence--;
          this._ctx.logger.trace("reducing seq by 1 to [%o]", responseSequence);

        }
      }
    }


    if ((contentType >= edge_protocol.content_type.Connect) && (isUndefined(conn))) {
      let connId = await this._messageGetConnId(data);
      throwIf(isUndefined(connId), formatMessage('Cannot find ConnId header', { } ) );
      conn = this._connections._getConnection(connId);
      throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );
    }

    /**
     *  Data msgs might need to be decrypted before passing along
     */
    if (contentType == edge_protocol.content_type.Data) {

      if (bodyLength > 0) {

        if (conn.getEncrypted() && conn.getCryptoEstablishComplete()) {  // if connected to a service that has 'encryptionRequired'

          let unencrypted_data = sodium.crypto_secretstream_xchacha20poly1305_pull(conn.getCrypt_i(), bodyView);

          if (!unencrypted_data) {
            this._ctx.logger.error("crypto_secretstream_xchacha20poly1305_pull failed. bodyLength[%d]", bodyLength);
          }

          try {
            let [m1, tag1] = [sodium.to_string(unencrypted_data.message), unencrypted_data.tag];
            let len = m1.length;
            if (len > 2000) {
              len = 2000;
            }
            this._ctx.logger.debug("recv <- unencrypted_data (first 2000): %s", m1.substring(0, len));
          } catch (e) { /* nop */ }

          bodyView = unencrypted_data.message;
        }
      }

      // 
      let dataCallback = conn.getDataCallback();
      if (!isUndefined(dataCallback)) {
        this._ctx.logger.trace("recv <- passing body to dataCallback ", bodyView);
        dataCallback(conn, bodyView);
      }
    }
    
    this._ctx.logger.trace("recv <- response body: ", bodyView);
    this._tryHandleResponse(conn, responseSequence, {channel: this, data: bodyView});
  }


  /**
   * 
   */
  _tryHandleResponse(conn, responseSequence, data) {

    if (!isUndefined(conn)) {
      let socket = conn.getSocket();
      if (!isUndefined(socket)) {
        if (socket.isWebSocket) {
          return;
        }
      }
    }


    let messagesQueue = this._messages;
    if (!isUndefined(conn)) {
      messagesQueue = conn.getMessages()
    }
    // var uint8array = new TextEncoder().encode(data);
    var string = new TextDecoder().decode(data.data);

    this._ctx.logger.trace("_tryHandleResponse():  conn[%d] seq[%d] data[%o]", (conn ? conn.getId() : 'n/a'), responseSequence, string);
    if (!isNull(responseSequence)) {
      messagesQueue.resolve(responseSequence, data);
    } else {
      debugger
    }
  }


  /**
   * 
   */
  async _dumpHeaders(pfx, buffer) {

    var headersView = new Int32Array(buffer, 12, 1);

    let headersLength = headersView[0];
    let headersOffset = 16 + 4;
    let ndx = 0;

    let view = new DataView(buffer);

    this._ctx.logger.trace("_dumpHeaders: "+pfx+"vv----------------------------------");

    for ( ; ndx < headersLength; ) {

      var _headerId = view.getInt32(headersOffset + ndx, true);
      ndx += 4;

      var _headerDataLength = view.getInt32(headersOffset + ndx, true);
      ndx += 4;

      var _headerData = new Uint8Array(buffer, headersOffset + ndx, _headerDataLength);
      ndx += _headerDataLength;

      let connId = 'n/a';
      if (isEqual(_headerId, edge_protocol.header_id.ConnId)) {
        let buffer = Buffer.from(_headerData);
        connId = buffer.readUIntLE(0, _headerDataLength);
      }

      this._ctx.logger.trace("headerId[%d] conn[%d] dataLength[%d] data[%o]", _headerId, connId, _headerDataLength, _headerData);
    }

    this._ctx.logger.trace("_dumpHeaders: "+pfx+"^^----------------------------------");
  }


  /**
   * 
   */
  async _findHeader(msg, headerToFind) {

    let buffer;

    if (!isUndefined(msg.arrayBuffer)) {
      buffer = await msg.arrayBuffer();
    } else if (!isUndefined(msg.buffer)) {
      buffer = await msg.buffer;
    } else {
      buffer = msg;
    }

    var headersView = new Int32Array(buffer, 12, 1);

    let headersLength = headersView[0];
    let headersOffset = 16 + 4;
    let ndx = 0;

    let view = new DataView(buffer);

    for ( ; ndx < headersLength; ) {

      var _headerId = view.getInt32(headersOffset + ndx, true);
      ndx += 4;

      var _headerDataLength = view.getInt32(headersOffset + ndx, true);
      ndx += 4;

      var _headerData = new Uint8Array(buffer, headersOffset + ndx, _headerDataLength);
      ndx += _headerDataLength;

      if (_headerId == headerToFind) {

        let result = {
          dataLength: _headerDataLength,
          data:       _headerData,
        };

        return result;
      }
    }

    return undefined;
  }


  /**
   * 
   */
  async _messageGetBytesHeader(msg, headerToFind) {
    return await this._findHeader(msg, headerToFind);
  }


  /**
   * 
   */
  async _messageGetConnId(msg) {
    let results = await this._findHeader(msg, edge_protocol.header_id.ConnId);
    throwIf(results == undefined, formatMessage('No ConnId header found'));

    var length = results.data.length;
    let buffer = Buffer.from(results.data);
    var connId = buffer.readUIntLE(0, length);

    return connId;
  }


  getConnection(id) {
    return this._connections._getConnection(id);
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