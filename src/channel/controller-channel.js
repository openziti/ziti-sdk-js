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
const formatMessage   = require('format-message');
const sodium          = require('libsodium-wrappers');

const defaultOptions  = require('./controller-channel-options');
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
 * @typicalname controllerChannel
 */
module.exports = class ZitiControllerChannel {

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

    this._controllerHost = this._options.controllerHost;
    this._controllerPort = this._options.controllerPort;

    this._connections = new ZitiConnections();

    this._zws = new ZitiWebSocket( 'ws://' + this._controllerHost + ':' +  this._controllerPort + '/ws' , { ctx: this._ctx} );

    this._zws.onMessage.addListener(this._recvFromWire, this);

    this._messages = new Messages({ ctx: this._ctx, channel: this });

    this._view_version = new Uint8Array(new ArrayBuffer(4));
    this._view_version.set(edge_protocol.VERSION, 0);

    this._msgSeq = 1;

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
   * Open websocket to Controller and do TLS handshake.
   * 
   */
  async connect() {

    await this._zws.open();

    // if (this.isHelloCompleted) {
    //   this._ctx.logger.debug('Connect was previously completed');
    //   return new Promise( async (resolve) => {
    //     resolve( {channel: this, data: null});
    //   });
    // }

    this._tlsConn = new ZitiTLSConnection({
      type: 'controller',
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

    return new Promise( async (resolve) => {
      resolve( {channel: this, data: null});
    });
  }


  /**
   * 
   * 
   */
  async request(options) {

    const self = this;
    return new Promise( async (resolve, reject) => {
    
      self._ctx.logger.debug('initiating request to Controller: [%o]', options);
    
      let sequence = this.getAndIncrementSequence();

      let headers = [
        new Header( edge_protocol.header_id.SeqHeader, { 
          headerType: edge_protocol.header_type.IntType, 
          headerData: sequence
        }),
      ];
      
      let msg = await self.sendMessage( edge_protocol.content_type.Data, headers, options, { sequence: sequence } );
    
      resolve(msg.data);
    });
  }


  /**
   * Do echo test with Controller.
   * 
   */
  async echo(wireData) {
    this._tlsConn.prepare(wireData);
  }

  // /**
  //  * Connect specified Connection to associated Edge Router.
  //  * 
  //  */
  // async connect(conn) {

  //   const self = this;
  //   return new Promise( async (resolve, reject) => {
    
  //     self._ctx.logger.debug('initiating Connect to Edge Router [%s] for conn[%d]', this._edgeRouterHost, conn.getId());
  
  //     await sodium.ready;
    
  //     let keypair = sodium.crypto_kx_keypair();
  
  //     conn.setKeypair(keypair);
  
  //     let sequence = this.getAndIncrementSequence();

  //     let headers = [
  
  //       new Header( edge_protocol.header_id.ConnId, {
  //         headerType: edge_protocol.header_type.IntType,
  //         headerData: conn.getId()
  //       }),
  
  //       new Header( edge_protocol.header_id.SeqHeader, { 
  //         headerType: edge_protocol.header_type.IntType, 
  //         headerData: 0 
  //       }),
  
  //       new Header( edge_protocol.header_id.PublicKey, { 
  //         headerType: edge_protocol.header_type.Uint8ArrayType, 
  //         headerData: keypair.publicKey
  //       })
  
  //     ];
  
  //     conn.setState(edge_protocol.conn_state.Connecting);
  
  //     self._ctx.logger.debug('about to send Connect to Edge Router [%s] for conn[%d]', conn.getChannel().getEdgeRouterHost(), conn.getId());
  
  //     let msg = await self.sendMessage( edge_protocol.content_type.Connect, headers, self._options.network_session_token, { 
  //         conn: conn,
  //         sequence: sequence,
  //       } 
  //     );

  //     self._ctx.logger.debug('connect() calling _recvConnectResponse() for conn[%d]', conn.getId());
  //     await self._recvConnectResponse(msg.data, conn);
    
  //     resolve();
  
  //   });
  // }


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
    
    // let messagesQueue = this._messages;
    // let conn;
    // if (!isUndefined(options.conn)) {
    //   conn = options.conn;
    //   messagesQueue = options.conn.getMessages();
    // }

    this._ctx.logger.debug("send -> seq[%o] contentType[%o] body[%s]", messageId, contentType, (body ? body.toString() : 'n/a'));

    return this._messages.create(messageId, () => {
      this._sendMarshaled(contentType, headers, body, options, messageId);
    }, timeout);
  }


  /**
   * Marshals message into binary wire format and sends to the Controller.
   *
   * @param {String|Number} contentType
   * @param {[Header]} headers
   * @param {*} body
   * @param {Object} [options]
   * @param {int} messageId
   */
  _sendMarshaled(contentType, headers, body, options, messageId) {

    let dataToMarshal = body;

    const wireData = this._marshalMessage(contentType, headers, dataToMarshal, options, messageId);

    this._dumpHeaders(' -> ', wireData);

    // Inject the listener if specified
    if (options.listener !== undefined) {
      this._zws.onMessage.addOnceListener(options.listener, this);
    }

    this._tlsConn.prepare(wireData);
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
   * Receives encrypted message from the Controller.
   * 
   * @param {*} data 
   */
  async _recvFromWire(data) {
    let buffer = await data.arrayBuffer();
    let tlsBinaryString = Buffer.from(buffer).toString('binary');
    this._tlsConn.process(tlsBinaryString);
  }


  /**
   * Receives un-encrypted message from the Controller.
   * 
   * @param {*} data 
   */
  async _recvFromWireAfterDecrypt(ch, data) {
    ch._tryUnmarshal(data);   
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

    // let acceptableContentTypes = [edge_protocol.content_type.ResultType, edge_protocol.content_type.StateConnected]
    let contentTypeView = new Int32Array(buffer, 4, 1);
    let contentType = contentTypeView[0];
    // throwIf(!acceptableContentTypes.includes(contentType), formatMessage('Unexpected message content-type. Got { actual }, expected { expected }', { actual: contentType, expected:  edge_protocol.content_type.ResultType}) );

    let sequenceView = new Int32Array(buffer, 8, 1);
    // throwIf(!isEqual(sequenceView[0], -1), formatMessage('Unexpected message sequence. Got { actual }, expected { expected }', { actual: sequenceView[0], expected:  -1 }));
    this._ctx.logger.debug("recv <- contentType[%o] seq[%o]", contentType, sequenceView[0]);

    let responseSequence = sequenceView[0];

    let headersLengthView = new Int32Array(buffer, 12, 1);
    let headersLength = headersLengthView[0];
    var headersView = new Uint8Array(buffer, 20);
    // this._dumpHeaders(' <- ', data);
    var bodyView = new Uint8Array(buffer, 20 + headersLength);

    // let connId;
    // let conn;
    // let replyForView;
    // let haveResponseSequence = false;
    
    this._ctx.logger.debug("recv <- response body: ", bodyView);
    this._tryHandleResponse(responseSequence, {channel: this, data: bodyView});
  }


  /**
   * 
   */
  _tryHandleResponse(responseSequence, data) {
    // let messagesQueue = this._messages;
    // if (!isUndefined(conn)) {
      // messagesQueue = conn.getMessages()
    // }
    // this._ctx.logger.debug("_tryHandleResponse():  conn[%d] seq[%d]", (conn ? conn.getId() : 'n/a'), responseSequence);
    this._ctx.logger.debug("_tryHandleResponse(): seq[%d]", responseSequence);
    if (!isNull(responseSequence)) {
      this._messages.resolve(responseSequence, data);
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
    } else {
      buffer = await msg.buffer;
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