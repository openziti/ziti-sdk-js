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

const isEqual = require('lodash.isequal');
const isUndefined = require('lodash.isundefined');
const isNull = require('lodash.isnull');
const forEach = require('lodash.foreach');

const formatMessage = require('format-message');
const Channel = require('chnl');
const PromiseController = require('promise-controller');
const sodium = require('libsodium-wrappers');


const utils = require('../utils/utils');
const {throwIf} = require('../utils/throwif');
const edge_protocol = require('./protocol');
const ZitiWebSocket = require('../websocket/websocket');
const ZitiConnection = require('./connection');
const defaultOptions = require('./options');
const Messages = require('./messages');
const ZitiConnections = require('./connections');
const Header = require('./header');




formatMessage.setup({
  locale: 'es-ES', // what locale strings should be displayed
  missingReplacement: '!!NOT TRANSLATED!!', // use this when a translation is missing instead of the default message
  missingTranslation: 'ignore', // don't console.warn or throw an error when a translation is missing
})


/**
 * @typicalname edge
 */
class ZitiEdge {
  /**
   *
   * @param {String} edgeRouterHost WebSocket URL
   * @param {Options} [options]
   */
  constructor(edgeRouterHost, options) {
    this._edgeRouterHost = edgeRouterHost;
    this._options = flatOptions(options, defaultOptions);
    this._conn_id = 0;
    this._sequence = 0;
    this._Subscription = null;
    this._messages = new Messages();
    this._connections = new ZitiConnections();

    this._createHelloController();
    this._createChannels();

    this._zws = new ZitiWebSocket('wss://'+this._edgeRouterHost+'/wss', {} );

    this._zws.onMessage.addListener(this._recvFromWire, this);


    this._view_version = new Uint8Array(new ArrayBuffer(4));
    this._view_version.set(edge_protocol.VERSION, 0);

  }

  /**
   * Has this Edge already completed the 'hello' sequence?
   *
   * @returns {Boolean}
   */
  get isHelloCompleted() {
    return Boolean(this._helloCompleted);
  }


  _createHelloController() {
    const helloTimeout = this._options.helloTimeout || this._options.timeout;
    this._helloing = new PromiseController({
      timeout: helloTimeout,
      timeoutReason: `Can't complete 'Hello' within allowed timeout: ${helloTimeout} ms.`
    });
  }


  _createChannels() {
    this._onHello = new Channel();
    // this._onOpen = new Channel();
    // this._onMessage = new Channel();
    // this._onUnpackedMessage = new Channel();
    // this._onResponse = new Channel();
    // this._onSend = new Channel();
    // this._onClose = new Channel();
    // this._onError = new Channel();
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
    const timeout = options.timeout !== undefined ? options.timeout : this._options.timeout;
    const messageId = options.sequence || this._sequence;
    ziti.context.logger.debug("send -----> conn: [%o] sequence: [%o] contentType: [%o] body: [%s]", (options.conn ? options.conn.getConnId() : 'n/a'), messageId, contentType, (body ? body.toString() : ''));

    return this._messages.create(messageId, () => {
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
    const timeout = options.timeout !== undefined ? options.timeout : this._options.timeout;
    const messageId = options.sequence || this._sequence;
    ziti.context.logger.debug("send -----> conn: [%o] sequence: [%o] contentType: [%o] body: [%s]", (options.conn ? options.conn.getConnId() : 'n/a'), messageId, contentType, (body ? body.toString() : ''));

    this._sendMarshaled(contentType, headers, body, options, messageId);
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

    // throwIf(!acceptableContentTypes.includes(contentTypeView[0]), formatMessage('Unexpected message content-type. Got { actual }, expected { expected }', { actual: contentTypeView[0], expected:  edge_protocol.content_type.ResultType}) );

    let sequenceView = new Int32Array(buffer, 8, 1);
    // throwIf(!isEqual(sequenceView[0], -1), formatMessage('Unexpected message sequence. Got { actual }, expected { expected }', { actual: sequenceView[0], expected:  -1 }));
    ziti.context.logger.debug("recv <----- contentType: [%o], seq: [%o]", contentType, sequenceView[0]);

    let responseSequence = sequenceView[0];

    if (edge_protocol.content_type.Data == contentType) {
      responseSequence--;
      ziti.context.logger.debug("reducing seq by 1 to [%o]", responseSequence);

      // TEMP HACK
      if (responseSequence > 4) {
        responseSequence--;
        ziti.context.logger.debug("TEMP HACK: reducing seq by 1 to [%o]", responseSequence);  
      }
    }

    this._setSequence(responseSequence);

    //
    let headersLengthView = new Int32Array(buffer, 12, 1);
    let headersLength = headersLengthView[0];
    var bodyView = new Uint8Array(buffer, 20 + headersLength);


    /**
     *  Data msgs might need to be decrypted before passing along
     */
    if (contentType == edge_protocol.content_type.Data) {

      let connId = await this._messageGetConnId(data);
      throwIf(isUndefined(connId), formatMessage('Cannot find ConnId heder', { } ) );
      let conn = this._connections._getConnection(connId);
      throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );

      if (conn.getEncrypted()) {

        let unencrypted_data = sodium.crypto_secretstream_xchacha20poly1305_pull(conn.getCrypt_i(), bodyView);

        // ziti.context.logger.debug("recv <----- unencrypted_data: ", unencrypted_data);
        let [m1, tag1] = [sodium.to_string(unencrypted_data.message), unencrypted_data.tag];
        ziti.context.logger.debug("recv <----- unencrypted_data: ", m1);

        // bodyView = sodium.to_string(unencrypted_data.message);

        bodyView = unencrypted_data.message;
      }

      // 
      let dataCallback = conn.getDataCallback();
      if (dataCallback) {
        dataCallback(conn, bodyView);
      }


    }
    
    ziti.context.logger.debug("recv <----- response body: ", bodyView);
    this._tryHandleResponse(responseSequence, bodyView);
  }

  /**
   * 
   */
  _tryHandleResponse(responseSequence, data) {
    ziti.context.logger.debug("_tryHandleResponse():  sequence[%d]", responseSequence);
    if (!isNull(responseSequence)) {
      this._messages.resolve(responseSequence, data);
    } else {
      debugger
    }
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
   * Open websocket to Edge Router. 
   *
   * @returns {Promise}
   */
  open() {
    return this._zws.open();
  }


  /**
   * Receives response from Edge 'Hello' message.
   * 
   */
  async _recvHelloResponse(msg) {
    this._helloCompleted = true;
    ziti.context.logger.debug('response received: edge_protocol.content_type.HelloType');
  }


  /**
   * Do Hello handshake with Edge Router. 
   *
   * @returns {Promise}
   */
  hello() {

    if (this.isHelloCompleted) {
      return this._helloing.promise;
    }

    ziti.context.logger.debug('initiating message: edge_protocol.content_type.HelloType');

    let headers = [
      new Header( edge_protocol.header_id.SessionToken, { 
        headerType: edge_protocol.header_type.StringType, 
        headerData: this._options.session_token 
        })
    ]; 

    return this.sendMessage( edge_protocol.content_type.HelloType, headers, null, { 
      sequence: -1,
      listener: this._recvHelloResponse,
    } );
  }


  /**
   * Create a connection with Edge Router. This will instantiate a network session that reaches through Fabric at terminates at designated service.
   *
   * @returns {Promise}
   */
  async connect() {

    const self = this;
    return new Promise( async (resolve, reject) => {

      ziti.context.logger.debug("connect() entered");

      await sodium.ready;

      let conn = new ZitiConnection();

      self._connections._saveConnection(conn);

      let sequence = conn.getAndIncrementSequence();
      ziti.context.logger.debug('connect() sequence [%d]', sequence);

      let keypair = sodium.crypto_kx_keypair();

      conn.setKeypair(keypair);

      let headers = [

        new Header( edge_protocol.header_id.ConnId, {
          headerType: edge_protocol.header_type.IntType,
          headerData: conn.getConnId()
        }),

        new Header( edge_protocol.header_id.SeqHeader, { 
          headerType: edge_protocol.header_type.IntType, 
          headerData: sequence 
        }),

        new Header( edge_protocol.header_id.PublicKey, { 
          headerType: edge_protocol.header_type.Uint8ArrayType, 
          headerData: keypair.publicKey
        })

      ];

      conn.setState(edge_protocol.conn_state.Connecting);

      ziti.context.logger.debug('connect() about to send Connect to edge router');

      self.sendMessage( edge_protocol.content_type.Connect, headers, self._options.network_session_token, { 
          conn: conn,
          sequence: sequence,
          listener: self._recvConnectResponse,
        } 
      );

      ziti.context.logger.debug('connect() back from send of Connect to edge router');

      ziti.context.logger.debug('connect() returning conn [%o]', conn);

      resolve(conn);

    });

  }


  awaitConnectionCryptoEstablishComplete(conn) {
    return new Promise((resolve) => {
      (function waitForCryptoEstablishComplete() {
        if (conn.getCryptoEstablishComplete()) return resolve();
        ziti.context.logger.debug('awaitConnectionCryptoEstablishComplete() conn [%d] still not yet CryptoEstablishComplete', conn.getConnId());
        setTimeout(waitForCryptoEstablishComplete, 100);
      })();
    });
  }
  

  /**
   * Write data over specified Edge Router connection.
   *
   * @returns {Promise}
   */
  async write(conn, data) {

    throwIf(isEqual(conn.getState(), edge_protocol.conn_state.Closed), formatMessage('Attempt to write data to a closed connection { actual }', { actual: conn.getConnId()}) );

    let sequence = conn.getAndIncrementSequence();

    let headers = [
      new Header( edge_protocol.header_id.ConnId, {
        headerType: edge_protocol.header_type.IntType,
        headerData: conn.getConnId()
      }),
      new Header( edge_protocol.header_id.SeqHeader, { 
        headerType: edge_protocol.header_type.IntType, 
        headerData: sequence 
      })
    ];

    this.sendMessageNoWait( edge_protocol.content_type.Data, headers, data, { sequence: sequence });
  }


  
  /**
   * Initiate Hello handshake with Edge Router. If handshake was previously completed, promise will be resolved with "hello event".
   *
   * @returns {Promise<Event>}
   */
  sendHello() {

        // wire-protocol: message-section
        let buffer_message_section = new ArrayBuffer(
          4  // Version
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
       bytes.writeUInt32LE(edge_protocol.content_type.HelloType, 0);
       view_message_section.set(
         bytes, 
         4 // Offset 4
       );
       
       bytes = new Buffer(4);
       
       // wire-protocol: Sequence
       bytes.writeUInt32LE(this._sequence, 0);
       view_message_section.set(
         bytes, 
         8 // Offset 8
       );
       
       // Build the header
       let sessionTokenLength = Buffer.byteLength(this._options.session_token, 'utf8');
       bytes = new Buffer(
          4
         +4
       );
       bytes.writeUInt32LE(edge_protocol.header_id.SessionToken, 0);
       bytes.writeUInt32LE(sessionTokenLength, 4);
       let session_token_bytes = utils.toUTF8Array(this._options.session_token);
       let bytesToken = Buffer.from(session_token_bytes);
       let bytes_session_header = Buffer.concat([bytes, bytesToken], 4+4+sessionTokenLength);
       
       bytes = new Buffer(4);
     
       // wire-protocol: hdrs-len
       bytes.writeUInt32LE(bytes_session_header.length, 0);
       view_message_section.set(
         bytes, 
         12  // Offset 12
       );
       
       bytes = new Buffer(4);
     
       let body_length = 0;
       
       // wire-protocol: body-len
       bytes.writeUInt32LE(body_length, 0);
       view_message_section.set(
         bytes, 
         16  // Offset 16
       );
       
       // wire-protocol: headers
       let buffer_headers_section = new ArrayBuffer(bytes_session_header.length);
       let view_headers_section = new Uint8Array(buffer_headers_section);
       view_headers_section.set(bytes_session_header, 0);
       
       // wire-protocol: body
       let buffer_body_section = new ArrayBuffer(body_length);
       
       // Put it all together
       let buffer_combined = utils.appendBuffer(buffer_message_section, buffer_headers_section);
       buffer_combined = utils.appendBuffer(buffer_combined, buffer_body_section);
       let view_combined = new Uint8Array(buffer_combined);
     
       // Transmit the Hello msg
       //  this._zws.send(view_combined.buffer);
       this._sendMessage(view_combined.buffer);
    }

  _createHello() {
    this._Subscription = new Channel.Subscription([
      {channel: this._zws, event: 'hello', listener: e => this._handleHello(e)},
      // {channel: this._ws, event: 'open', listener: e => this._handleOpen(e)},
      // {channel: this._ws, event: 'message', listener: e => this._handleMessage(e)},
      {channel: this._ws, event: 'error', listener: e => this._handleError(e)},
      {channel: this._ws, event: 'close', listener: e => this._handleClose(e)},
    ]).on();
  }

  _handleHello(event) {
    this._onHello.dispatchAsync(event);
    this._helloing.resolve(event);
  }


  _cleanupEdge() {
    if (this._Subscription) {
      this._Subscription.off();
      this._Subscription = null;
    }
    this._zws = null;
  }

  _cleanup(error) {
    this._cleanupEdge();
    this._requests.rejectAll(error);
  }



  /**
   * Sends Edge 'hello' message.
   * 
   */
  async _sendHello() {

    // wire-protocol: message-section
    let buffer_message_section = new ArrayBuffer(
       4  // Version
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
    bytes.writeUInt32LE(edge_protocol.content_type.HelloType, 0);
    view_message_section.set(
      bytes, 
      4 // Offset 4
    );
    
    bytes = new Buffer(4);
    
    // wire-protocol: Sequence
    bytes.writeUInt32LE(this._sequence, 0);
    view_message_section.set(
      bytes, 
      8 // Offset 8
    );
    
    // Build the header
    let sessionTokenLength = Buffer.byteLength(this._options.session_token, 'utf8');
    bytes = new Buffer(
       4
      +4
    );
    bytes.writeUInt32LE(edge_protocol.header_id.SessionToken, 0);
    bytes.writeUInt32LE(sessionTokenLength, 4);
    let session_token_bytes = utils.toUTF8Array(this._options.session_token);
    let bytesToken = Buffer.from(session_token_bytes);
    let bytes_session_header = Buffer.concat([bytes, bytesToken], 4+4+sessionTokenLength);
    
    bytes = new Buffer(4);
  
    // wire-protocol: hdrs-len
    bytes.writeUInt32LE(bytes_session_header.length, 0);
    view_message_section.set(
      bytes, 
      12  // Offset 12
    );
    
    bytes = new Buffer(4);
  
    let body_length = 0;
    
    // wire-protocol: body-len
    bytes.writeUInt32LE(body_length, 0);
    view_message_section.set(
      bytes, 
      16  // Offset 16
    );
    
    // wire-protocol: headers
    let buffer_headers_section = new ArrayBuffer(bytes_session_header.length);
    let view_headers_section = new Uint8Array(buffer_headers_section);
    view_headers_section.set(bytes_session_header, 0);
    
    // wire-protocol: body
    let buffer_body_section = new ArrayBuffer(body_length);
    
    // Put it all together
    let buffer_combined = utils.appendBuffer(buffer_message_section, buffer_headers_section);
    buffer_combined = utils.appendBuffer(buffer_combined, buffer_body_section);
    let view_combined = new Uint8Array(buffer_combined);
  
    // Transmit the Hello msg
    this._zws.send(view_combined.buffer);
  }


  /**
   * 
   * @param {*} sequence 
   */
  _setSequence(sequence) {
    this._sequence = sequence;
  }


  /**
   * 
   */
  _getSequence() {
    return this._sequence;
  }


  /**
   * 
   */
  _incrementSequence() {
    this._sequence++;
    return this._sequence;
  }


  /**
   * 
   */
  _incrementConnId() {
    this._conn_id++;
    return this._conn_id;
  }

  /**
   * 
   */
  getConnId() {
    return this._conn_id;
  }


  /**
   * Receives ACK from Edge 'hello' message.
   * 
   */
  async _recvHelloAck(data) {

    let buffer = await data.arrayBuffer();

    let versionView = new Uint8Array(buffer, 0, 4);
    throwIf(!isEqual(versionView[0], this._view_version[0]), formatMessage('Unexpected message version. Got { actual }, expected { expected }', { actual: versionView[0], expected:  this._view_version[0]}) );

    let acceptableContentTypes = [edge_protocol.content_type.ResultType, edge_protocol.content_type.StateConnected]
    let contentTypeView = new Int32Array(buffer, 4, 1);
    ziti.context.logger.debug("_recvHelloAck(): contentType is: ", contentTypeView[0]);
    throwIf(!acceptableContentTypes.includes(contentTypeView[0]), formatMessage('Unexpected message content-type. Got { actual }, expected { expected }', { actual: contentTypeView[0], expected:  edge_protocol.content_type.ResultType}) );

    let sequenceView = new Int32Array(buffer, 8, 1);
    // throwIf(!isEqual(sequenceView[0], -1), formatMessage('Unexpected message sequence. Got { actual }, expected { expected }', { actual: sequenceView[0], expected:  -1 }));


    // this._setSequence(sequenceView[0]);
   

  }


  /**
   * Sends Edge 'Connect' message.
   * 
   */
  async _sendConnect() {

    // wire-protocol: message-section
    let buffer_message_section = new ArrayBuffer(
      4  // Version
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
    bytes.writeUInt32LE(edge_protocol.content_type.Connect, 0);
    view_message_section.set(
      bytes, 
      4 // Offset 4
    );
    
    bytes = new Buffer(4);
    
    // wire-protocol: Sequence
    bytes.writeUInt32LE(this._incrementSequence(), 0);
    view_message_section.set(
      bytes, 
      8 // Offset 8
    );
    
    // Build headers
    let bytes_connIdHeader = new Buffer(
      4
      +4
      +4
    );
    bytes_connIdHeader.writeUInt32LE(edge_protocol.header_id.ConnId, 0);
    bytes_connIdHeader.writeUInt32LE(4, 4);
    bytes_connIdHeader.writeUInt32LE(this._incrementConnId(), 8);

    let bytes_seqHeader = new Buffer(
      4
      +4
      +4
    );
    bytes_seqHeader.writeUInt32LE(edge_protocol.header_id.SeqHeader, 0);
    bytes_seqHeader.writeUInt32LE(4, 4);
    bytes_seqHeader.writeUInt32LE(this._getSequence(), 8);

    let sessionTokenLength = Buffer.byteLength(this._options.session_token, 'utf8');
    bytes = new Buffer(
       4
      +4
    );
    bytes.writeUInt32LE(edge_protocol.header_id.SessionToken, 0);
    bytes.writeUInt32LE(sessionTokenLength, 4);
    let session_token_bytes = utils.toUTF8Array(this._options.session_token);
    let bytesToken = Buffer.from(session_token_bytes);
    let bytes_session_header = Buffer.concat([bytes, bytesToken], 4+4+sessionTokenLength);


  
    bytes = new Buffer(4);
  
    // wire-protocol: hdrs-len
    let hdrsLength = Buffer.byteLength(bytes_connIdHeader, 'utf8') + Buffer.byteLength(bytes_seqHeader, 'utf8') + Buffer.byteLength(bytes_session_header, 'utf8');
    bytes.writeUInt32LE(hdrsLength, 0);
    view_message_section.set(
      bytes, 
      12  // Offset 12
    );
    
    bytes = new Buffer(4);
  
    let body_length = sessionTokenLength;
    
    // wire-protocol: body-len
    bytes.writeUInt32LE(body_length, 0);
    view_message_section.set(
      bytes, 
      16  // Offset 16
    );
    
    // wire-protocol: headers
    let buffer_headers_section = new ArrayBuffer(( ( 4 * 3 ) * 2) + bytes_session_header.length);
    let view_headers_section = new Uint8Array(buffer_headers_section);
    view_headers_section.set(bytes_connIdHeader, 0);
    view_headers_section.set(bytes_seqHeader, (4 * 3));
    view_headers_section.set(bytes_session_header, ( ( 4 * 3 ) * 2));
    
    // wire-protocol: body
    let buffer_body_section = new ArrayBuffer(body_length);
    let view_body_section = new Uint8Array(buffer_body_section);
    view_body_section.set(bytesToken, 0);

    
    // Put it all together
    let buffer_combined = utils.appendBuffer(buffer_message_section, buffer_headers_section);
    buffer_combined = utils.appendBuffer(buffer_combined, buffer_body_section);
    let view_combined = new Uint8Array(buffer_combined);
  
    //
    this._zws.onMessage.addListener(this._recvConnectResponse, this);

    // Transmit the Connect msg
    this._zws.send(view_combined.buffer);
   
  }


  /**
   * 
   */
  async _findHeader(msg, headerToFind) {

    let buffer = await msg.arrayBuffer();

    var versionView = new Uint8Array(buffer, 0, 4);    
    var contentTypeView = new Int32Array(buffer, 4, 1);
    var sequenceView = new Int32Array(buffer, 8, 1);
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

  
  /**
   * 
   */
  async _establish_crypto(conn, msg) {

    ziti.context.logger.debug("_establish_crypto(): entered for conn[%d]", conn.getConnId());

    let result = await this._messageGetBytesHeader(msg, edge_protocol.header_id.PublicKey);
    let peerKey = result.data;
    ziti.context.logger.debug("_establish_crypto(): peerKey is: ", peerKey);

    if (peerKey == undefined) {
      ziti.context.logger.debug("_establish_crypto(): did not receive peer key. connection[%d] will not be encrypted: ", conn.getConnId());
      conn.setEncrypted(false);
      return;
    }

    if (conn.getState() == edge_protocol.conn_state.Connecting) {

      let keypair = conn.getKeypair();

      let results = sodium.crypto_kx_client_session_keys(keypair.publicKey, keypair.privateKey, peerKey);

      conn.setSharedRx(results.sharedRx);
      conn.setSharedTx(results.sharedTx);

    } else {
      ziti.context.logger.error("_establish_crypto(): cannot establish crypto while connection is in %d state: ", conn.getState());
    }

  }


  /**
   * Receives response from Edge 'Data' message where we sent the Crypto header.
   * 
   */
  async _recvCryptoResponse(msg) {

    let connId = await this._messageGetConnId(msg);
    ziti.context.logger.debug("_recvCryptoResponse(): entered for conn[%d]", connId);
    let conn = this._connections._getConnection(connId);
    throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking conn { actual }', { actual: connId}) );

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
   * 
   */
  async _send_crypto_header(conn) {

    ziti.context.logger.debug("_send_crypto_header(): entered for conn[%d]", conn.getConnId());

    let results = sodium.crypto_secretstream_xchacha20poly1305_init_push( conn.getSharedTx() );

    conn.setCrypt_o(results);

    let sequence = conn.getAndIncrementSequence();

    let headers = [

      new Header( edge_protocol.header_id.ConnId, {
        headerType: edge_protocol.header_type.IntType,
        headerData: conn.getConnId()
      }),

      new Header( edge_protocol.header_id.SeqHeader, { 
        headerType: edge_protocol.header_type.IntType, 
        headerData: sequence 
      })
  
    ];    

    ziti.context.logger.debug("_send_crypto_header(): sending Data [%o]", conn.getCrypt_o().header);

    let p = this.sendMessage( edge_protocol.content_type.Data, headers, conn.getCrypt_o().header,
      {
        conn: conn,
        sequence: sequence,
        listener: this._recvCryptoResponse,
      }
    );

    ziti.context.logger.debug("_send_crypto_header(): Data has been sent");

    return p;

  }


  /**
   * Receives response from Edge 'Connect' message.
   * 
   */
  async _recvConnectResponse(msg) {

    let connId = await this._messageGetConnId(msg);

    let conn = this._connections._getConnection(connId);
    throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );

    let buffer = await msg.arrayBuffer();
    let contentTypeView = new Int32Array(buffer, 4, 1);
    let contentType = contentTypeView[0];


    switch (contentType) {

      case edge_protocol.content_type.StateClosed:
        ziti.context.logger.debug("_recvConnectResponse(): edge conn[%d] failed to connect", connId);
        conn.setState(edge_protocol.conn_state.Closed);
        break;

      case edge_protocol.content_type.StateConnected:
        if (conn.getState() == edge_protocol.conn_state.Connecting) {
          ziti.context.logger.debug("_recvConnectResponse(): edge conn[%d] connected", connId);

          await this._establish_crypto(conn, msg);
          ziti.context.logger.debug("_recvConnectResponse(): _establish_crypto completed");

          await this._send_crypto_header(conn);
          ziti.context.logger.debug("_recvConnectResponse(): _send_crypto_header completed");

          conn.setState(edge_protocol.conn_state.Connected);

          // req->cb(conn, ZITI_OK);
        }
        else if (conn.getState() == edge_protocol.conn_state.Closed || conn.getState() == edge_protocol.conn_state.Timedout) {
          ziti.context.logger.debug("_recvConnectResponse(): received connect reply for closed/timedout connection[%d]", connId);
          // ziti_disconnect(conn);
        }
        break;

      default:
        ziti.context.logger.error("_recvConnectResponse(): unexpected content_type[%d] conn[%d]", contentType, connId);
        // ziti_disconnect(conn);
    }


    // let peerKey = await this._messageGetBytesHeader(msg, edge_protocol.header_id.PublicKey);
    // ziti.context.logger.debug("_recvConnectResponse(): peerKey is: ", peerKey[0]);


  }


  /**
   * Sends Edge 'Data' message.
   * 
   */
  async _sendData(conn, data) {

    // wire-protocol: message-section
    let buffer_message_section = new ArrayBuffer(
      4  // Version
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
    bytes.writeUInt32LE(edge_protocol.content_type.Data, 0);
    view_message_section.set(
      bytes, 
      4 // Offset 4
    );
    
    bytes = new Buffer(4);
    
    // wire-protocol: Sequence
    bytes.writeUInt32LE(this._incrementSequence(), 0);
    view_message_section.set(
      bytes, 
      8 // Offset 8
    );
    
    // Build headers
    let bytes_connIdHeader = new Buffer(
      4
      +4
      +4
    );
    bytes_connIdHeader.writeUInt32LE(edge_protocol.header_id.ConnId, 0);
    bytes_connIdHeader.writeUInt32LE(4, 4);
    // bytes_connIdHeader.writeUInt32LE(this._getConnId(), 8);
    bytes_connIdHeader.writeUInt32LE(conn, 8);

    let bytes_seqHeader = new Buffer(
      4
      +4
      +4
    );
    bytes_seqHeader.writeUInt32LE(edge_protocol.header_id.SeqHeader, 0);
    bytes_seqHeader.writeUInt32LE(4, 4);
    bytes_seqHeader.writeUInt32LE(this._getSequence(), 8);

  
    bytes = new Buffer(4);
  
    // wire-protocol: hdrs-len
    let hdrsLength = Buffer.byteLength(bytes_connIdHeader, 'utf8') + Buffer.byteLength(bytes_seqHeader, 'utf8');
    bytes.writeUInt32LE(hdrsLength, 0);
    view_message_section.set(
      bytes, 
      12  // Offset 12
    );
    
    bytes = new Buffer(4);
  
    let body_length = data.length;
    
    // wire-protocol: body-len
    bytes.writeUInt32LE(body_length, 0);
    view_message_section.set(
      bytes, 
      16  // Offset 16
    );
    
    // wire-protocol: headers
    let buffer_headers_section = new ArrayBuffer(( ( 4 * 3 ) * 2));
    let view_headers_section = new Uint8Array(buffer_headers_section);
    view_headers_section.set(bytes_connIdHeader, 0);
    view_headers_section.set(bytes_seqHeader, (4 * 3));
    
    // wire-protocol: body
    let data_bytes = utils.toUTF8Array(data);
    let bytesData = Buffer.from(data_bytes);
    let buffer_body_section = new ArrayBuffer(body_length);
    let view_body_section = new Uint8Array(buffer_body_section);
    view_body_section.set(bytesData, 0);
    
    // Put it all together
    let buffer_combined = utils.appendBuffer(buffer_message_section, buffer_headers_section);
    buffer_combined = utils.appendBuffer(buffer_combined, buffer_body_section);
    let view_combined = new Uint8Array(buffer_combined);
  
    // Transmit the data
    this._zws.send(view_combined.buffer);
   
  }


    /**
   * Receives response from Edge 'Data' message.
   * 
   */
  async _recvDataResponse(data) {

    let buffer = await data.arrayBuffer();

    var versionView = new Uint8Array(buffer, 0, 4);
    throwIf(!isEqual(versionView[0], this._view_version[0]), formatMessage('Unexpected message version. Got { actual }, expected { expected }', { actual: versionView[0], expected:  this._view_version[0]}) );

    var contentTypeView = new Int32Array(buffer, 4, 1);
    ziti.context.logger.debug("_recvDataResponse(): contentType is: ", contentTypeView[0]);

    // throwIf(!isEqual(contentTypeView[0], edge_protocol.content_type.Data), formatMessage('Unexpected message content-type. Got { actual }, expected { expected }', { actual: contentTypeView[0], expected:  edge_protocol.content_type.Data}) );
    var sequenceView = new Int32Array(buffer, 8, 1);
    // throwIf(!isEqual(sequenceView[0], this._getSequence()), formatMessage('Unexpected message sequence. Got { actual }, expected { expected }', { actual: sequenceView[0], expected:  this._getSequence()}));


    var responseView = new Uint8Array(buffer, 20);
    var responseString = new TextDecoder("utf-8").decode(responseView);

    ziti.context.logger.debug(responseString);

    // return responseString;


  }


}

/**
 * Expose `ZitiEdge`.
 */

module.exports = ZitiEdge;
