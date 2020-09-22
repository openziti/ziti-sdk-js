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
const Mutex           = require('async-mutex');
const isNull          = require('lodash.isnull');
const forEach         = require('lodash.foreach');
const isEqual         = require('lodash.isequal');
const isUndefined     = require('lodash.isundefined');
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

    this._edgeRouterHost = this._options.edgeRouterHost;

    this._connections = new ZitiConnections();

    this._zws = new ZitiWebSocket( 'wss://' + this._edgeRouterHost + '/wss' , {} );

    this._zws.onMessage.addListener(this._recvFromWire, this);

    this._createHelloController();

    // Set the maximum timestamp
    this._helloCompletedTimestamp = new Date(8640000000000000); // http://www.ecma-international.org/ecma-262/5.1/#sec-15.9.1.1

    this._mutex = new Mutex.Mutex();

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
   * Do Hello handshake betweek this channel and associated Edge Router.
   * 
   */
  async hello() {

    await this._zws.open();

    this._ctx.logger.debug('hello(): channel [%d] awaiting mutex', this._id);

    const release = await this._mutex.acquire();

    this._ctx.logger.debug('hello(): channel [%d] aquired mutex', this._id);

    if (this.isHelloCompleted) {
      this._ctx.logger.debug('Hello handshake was previously completed');
      release();
      return this._helloing.call( this._helloing.resolve( {channel: this, data: null}) );
    }

    this._ctx.logger.debug('initiating message: edge_protocol.content_type.HelloType');

    let headers = [
      new Header( edge_protocol.header_id.SessionToken, { 
        headerType: edge_protocol.header_type.StringType, 
        headerData: this._options.session_token 
      })
    ]; 

    let sequence = this.getAndIncrementSequence();

    return this.sendMessage( edge_protocol.content_type.HelloType, headers, null, { 
      sequence: sequence,
      listener: function(msg) {
        this._helloCompletedTimestamp = Date.now();
        this._helloCompleted = true;
        this.setState(edge_protocol.conn_state.Connected);
        this._ctx.logger.debug('channel [%d] Hello handshake to Edge Router [%s] completed at timestamp[%o]', this._id, this._edgeRouterHost, this._helloCompletedTimestamp);
        this._ctx.logger.debug('hello(): channel [%d] releasing mutex', this._id);
        release();
      }
    });

  }


  /**
   * Connect specified Connection to associated Edge Router.
   * 
   */
  async connect(conn) {

    const self = this;
    return new Promise( async (resolve, reject) => {
  
      self._ctx.logger.debug('connect(): conn [%d] awaiting mutex', conn.getId());

      const release = await self._mutex.acquire();

      self._ctx.logger.debug('connect(): conn [%d] aquired mutex', conn.getId());
  
      self._ctx.logger.debug('initiating Connect to Edge Router [%s] for conn[%d]', this._edgeRouterHost, conn.getId());
  
      await sodium.ready;
    
      let keypair = sodium.crypto_kx_keypair();
  
      conn.setKeypair(keypair);
  
      let sequence = conn.getAndIncrementSequence();

      let headers = [
  
        new Header( edge_protocol.header_id.ConnId, {
          headerType: edge_protocol.header_type.IntType,
          headerData: conn.getId()
        }),
  
        new Header( edge_protocol.header_id.SeqHeader, { 
          headerType: edge_protocol.header_type.IntType, 
          headerData: 0 
        }),
  
        new Header( edge_protocol.header_id.PublicKey, { 
          headerType: edge_protocol.header_type.Uint8ArrayType, 
          headerData: keypair.publicKey
        })
  
      ];
  
      conn.setState(edge_protocol.conn_state.Connecting);
  
      self._ctx.logger.debug('about to send Connect to Edge Router [%s] for conn[%d]', conn.getChannel().getEdgeRouterHost(), conn.getId());
  
      self.sendMessage( edge_protocol.content_type.Connect, headers, self._options.network_session_token, { 
          conn: conn,
          sequence: sequence,
          listener: function(msg) {
            self._recvConnectResponse(msg);
            self._ctx.logger.debug('connect(): conn [%d] releasing mutex', conn.getId());
            release();
          }
        } 
      );
    
      resolve();
  
    });
  }


  /**
   * Receives response from Edge 'Connect' message.
   * 
   */
  async _recvConnectResponse(msg) {

    let buffer = await msg.arrayBuffer();
    let contentTypeView = new Int32Array(buffer, 4, 1);
    let contentType = contentTypeView[0];
    let sequenceView = new Int32Array(buffer, 8, 1);
    let sequence = sequenceView[0];
    let connId = await this._messageGetConnId(msg);
    let conn = this._connections._getConnection(connId);
    throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );

    this._ctx.logger.debug("ConnectResponse contentType[%d] seq[%d] received for conn[%d]", contentType, sequence, conn.getId());

    switch (contentType) {

      case edge_protocol.content_type.StateClosed:

        this._ctx.warn("conn[%d] failed to connect", conn.getId());
        conn.setState(edge_protocol.conn_state.Closed);
        break;

      case edge_protocol.content_type.StateConnected:

        if (conn.getState() == edge_protocol.conn_state.Connecting) {
          this._ctx.logger.debug("conn[%d] connected", conn.getId());

          await this._establish_crypto(conn, msg);
          this._ctx.logger.debug("establish_crypto completed for conn[%d]", conn.getId());

          await this._send_crypto_header(conn);
          this._ctx.logger.debug("send_crypto_header completed for conn[%d]", conn.getId());

          conn.setState(edge_protocol.conn_state.Connected);
        }

        else if (conn.getState() == edge_protocol.conn_state.Closed || conn.getState() == edge_protocol.conn_state.Timedout) {
          this._ctx.warn("received connect reply for closed/timedout conne[%d]", conn.getId());
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
    let buffer = await msg.arrayBuffer();
    let headersLengthView = new Int32Array(buffer, 12, 1);
    let headersLength = headersLengthView[0];
    var bodyView = new Uint8Array(buffer, 20 + headersLength);

    let state_in = sodium.crypto_secretstream_xchacha20poly1305_init_pull(bodyView, conn.getSharedRx());
    
    conn.setCrypt_i(state_in);

    // Indicate that subsequent sends on this connection should be encrypted
    conn.setEncrypted(true);

    // Unblock writes to the connection now that we have sent the crypto header
    conn.setCryptoEstablishComplete(true);
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
        conn._ctx.logger.trace('awaitConnectionCryptoEstablishComplete() conn [%d] still not yet CryptoEstablishComplete', conn.getId());
        setTimeout(waitForCryptoEstablishComplete, 100);
      })();
    });
  }


  /**
   * 
   */
  async _send_crypto_header(conn) {

    this._ctx.logger.debug('_send_crypto_header(): conn [%d] awaiting mutex', conn.getId());

    const release = await this._mutex.acquire();

    this._ctx.logger.debug('_send_crypto_header(): conn [%d] aquired mutex', conn.getId());

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

    this._ctx.logger.debug('_send_crypto_header(): conn [%d] sending Data [%o]', conn.getId(), conn.getCrypt_o().header);

    let p = this.sendMessage( edge_protocol.content_type.Data, headers, conn.getCrypt_o().header, {
        conn: conn,
        sequence: sequence,
        // listener: this._recvCryptoResponse,
        listener: function(msg) {
          this._recvCryptoResponse(msg);
          this._ctx.logger.debug('connect(): conn [%d] releasing mutex', conn.getId());
          release();
        }
      }
    );

    this._ctx.logger.debug('_send_crypto_header(): conn [%d] Data has been sent', conn.getId());

    return p;
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

    this._ctx.logger.debug("send -> conn: [%o] sequence: [%o] contentType: [%o] body: [%s]", (conn ? conn.getId() : 'n/a'), messageId, contentType, (body ? body.toString() : 'n/a'));

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
    this._ctx.logger.debug("send (no wait) -> conn: [%o] sequence: [%o] contentType: [%o] body: [%s]", (options.conn ? options.conn.getId() : 'n/a'), messageId, contentType, (body ? body.toString() : 'n/a'));

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

      /**
       * 
       */
      if (conn.getEncrypted()) {

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

    // Inject the listener if specified
    if (options.listener !== undefined) {
      this._zws.onMessage.addOnceListener(options.listener, this);
    }

    this._zws.send(wireData);
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
   * Receives a message from the Edge Router.
   * 
   * @param {*} data 
   */
  async _recvFromWire(data) {
    this._tryUnmarshal(data);   
  }


  /**
   * Unmarshals binary from the wire into a message
   * 
   * @param {*} data 
   */
  async _tryUnmarshal(data) {

    let buffer = await data.arrayBuffer();

    let versionView = new Uint8Array(buffer, 0, 4);
    throwIf(!isEqual(versionView[0], this._view_version[0]), formatMessage('Unexpected message version. Got { actual }, expected { expected }', { actual: versionView[0], expected:  this._view_version[0]}) );

    // let acceptableContentTypes = [edge_protocol.content_type.ResultType, edge_protocol.content_type.StateConnected]
    let contentTypeView = new Int32Array(buffer, 4, 1);
    let contentType = contentTypeView[0];
    // throwIf(!acceptableContentTypes.includes(contentType), formatMessage('Unexpected message content-type. Got { actual }, expected { expected }', { actual: contentType, expected:  edge_protocol.content_type.ResultType}) );

    let sequenceView = new Int32Array(buffer, 8, 1);
    // throwIf(!isEqual(sequenceView[0], -1), formatMessage('Unexpected message sequence. Got { actual }, expected { expected }', { actual: sequenceView[0], expected:  -1 }));
    this._ctx.logger.debug("recv <- contentType: [%o], seq: [%o]", contentType, sequenceView[0]);

    let responseSequence = sequenceView[0];

    if (contentType >= edge_protocol.content_type.StateConnected) {
      responseSequence--;
      this._ctx.logger.debug("reducing seq by 1 to [%o]", responseSequence);
    }

    let headersLengthView = new Int32Array(buffer, 12, 1);
    let headersLength = headersLengthView[0];
    var bodyView = new Uint8Array(buffer, 20 + headersLength);

    let conn;
    if (contentType >= edge_protocol.content_type.Connect) {
      let connId = await this._messageGetConnId(data);
      throwIf(isUndefined(connId), formatMessage('Cannot find ConnId header', { } ) );
      conn = this._connections._getConnection(connId);
      throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );
    }

    /**
     *  Data msgs might need to be decrypted before passing along
     */
    if (contentType == edge_protocol.content_type.Data) {

      if (conn.getEncrypted()) {

        let unencrypted_data = sodium.crypto_secretstream_xchacha20poly1305_pull(conn.getCrypt_i(), bodyView);

        let [m1, tag1] = [sodium.to_string(unencrypted_data.message), unencrypted_data.tag];
        this._ctx.logger.debug("recv <- unencrypted_data: %s", m1);

        bodyView = unencrypted_data.message;
      }

      // 
      let dataCallback = conn.getDataCallback();
      if (!isUndefined(dataCallback)) {
        this._ctx.logger.debug("recv <- passing body to dataCallback ", bodyView);
        dataCallback(conn, bodyView);
      }
    }
    
    this._ctx.logger.debug("recv <- response body: ", bodyView);
    this._tryHandleResponse(conn, responseSequence, {channel: this, data: bodyView});
  }


  /**
   * 
   */
  _tryHandleResponse(conn, responseSequence, data) {
    let messagesQueue = this._messages;
    if (!isUndefined(conn)) {
      messagesQueue = conn.getMessages()
    }
    this._ctx.logger.debug("_tryHandleResponse():  conn[%d] seq[%d]", (conn ? conn.getId() : 'n/a'), responseSequence);
    if (!isNull(responseSequence)) {
      messagesQueue.resolve(responseSequence, data);
    } else {
      debugger
    }
  }


  /**
   * 
   */
  async _findHeader(msg, headerToFind) {

    let buffer = await msg.arrayBuffer();

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