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

const isUndefined   = require('lodash.isundefined');
const EventEmitter  = require('events');
const randomBytes   = require('randombytes');
const createHash    = require('create-hash');
const isNull        = require('lodash.isnull');

const HttpRequest   = require('./request');
const HttpResponse  = require('./response');
const http          = require('./http');
const zitiConstants = require('../constants');
const ls            = require('../utils/localstorage');
const Receiver      = require('./receiver');
const Sender        = require('./sender');
const PerMessageDeflate = require('./permessage-deflate');


const {
    BINARY_TYPES,
    EMPTY_BUFFER,
    GUID,
    kStatusCode,
    kWebSocket,
    NOOP
} = require('./constants');

const { addEventListener, removeEventListener } = require('./event-target');

const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];

const protocolVersions = [8, 13];
const closeTimeout = 30 * 1000;
const handshakeTimeout = 5 * 1000;


/**
 * ZitiWebSocketWrapper:
 * 
 */
class ZitiWebSocketWrapper extends EventEmitter {

    /**
     * Create a new `ZitiWebSocketWrapper`.
     *
     * @param {(String|url.URL)} address The URL to which to connect
     * @param {(String|String[])} protocols The subprotocols
     * @param {Object} options Connection options
     */
    constructor(address, protocols, options) {
        super();

        ziti._ctx.logger.info('ZitiWebSocketWrapper ctor entered for url: %o', address);

        this.readyState = ZitiWebSocketWrapper.CONNECTING;
        this.protocol = '';

        this._zitiInitialized = false;

        this._binaryType = BINARY_TYPES[0];
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = '';
        this._closeTimer = null;
        this._closeCode = 1006;
        this._extensions = {};
        this._receiver = null;
        this._sender = null;
        this._socket = null;

        if (address !== null) {
            this._bufferedAmount = 0;
            this._isServer = false;
            this._redirects = 0;

            if (Array.isArray(protocols)) {
                protocols = protocols.join(', ');
            } else if (typeof protocols === 'object' && protocols !== null) {
                options = protocols;
                protocols = undefined;
            }

            initAsClient(this, address, protocols, options);

        } else {
            this._isServer = true;
        }
    }

    get CONNECTING() {
        return ZitiWebSocketWrapper.CONNECTING;
    }
    get CLOSING() {
        return ZitiWebSocketWrapper.CLOSING;
    }
    get CLOSED() {
        return ZitiWebSocketWrapper.CLOSED;
    }
    get OPEN() {
        return ZitiWebSocketWrapper.OPEN;
    }
    
    /**
     * This deviates from the WHATWG interface since ws doesn't support the
     * required default "blob" type (instead we define a custom "nodebuffer"
     * type).
     *
     * @type {String}
     */
    get binaryType() {
        return this._binaryType;
    }

    set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;

        this._binaryType = type;

        //
        // Allow to change `binaryType` on the fly.
        //
        if (this._receiver) this._receiver._binaryType = type;
    }
    
    /**
     * @type {Number}
     */
    get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;

        //
        // `socket.bufferSize` is `undefined` if the socket is closed.
        //
        return (this._socket.bufferSize || 0) + this._sender._bufferedBytes;
    }

    /**
     * @type {String}
     */
    get extensions() {
        return Object.keys(this._extensions).join();
    }


  /**
   * Set up the socket and the internal resources.
   *
   * @param {net.Socket} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Number} maxPayload The maximum allowed message size
   * @private
   */
  setSocket(socket, head, maxPayload) {
    ziti._ctx.logger.info('setSocket() entered, socket: %o', socket);

    const receiver = new Receiver(
      this._binaryType,
      this._extensions,
      this._isServer,
      maxPayload
    );

    this._sender = new Sender(socket, this._extensions);
    this._receiver = receiver;
    this._socket = socket;

    receiver[kWebSocket] = this;
    socket[kWebSocket] = this;

    receiver.on('conclude', receiverOnConclude);
    receiver.on('drain', receiverOnDrain);
    receiver.on('error', receiverOnError);
    receiver.on('message', receiverOnMessage);
    receiver.on('ping', receiverOnPing);
    receiver.on('pong', receiverOnPong);

    socket.setTimeout(0);
    socket.setNoDelay();

    if (head.length > 0) socket.unshift(head);

    socket.on('close', socketOnClose);
    socket.on('data', socketOnData);
    socket.on('end', socketOnEnd);
    socket.on('error', socketOnError);

    this.readyState = ZitiWebSocketWrapper.OPEN;
    this.emit('open');
  }

  /**
   * Emit the `'close'` event.
   *
   * @private
   */
  emitClose() {
    if (!this._socket) {
        ziti._ctx.logger.debug(
        'emitClose 1: _closeCode=%o, _closeMessage=%o',
        this._closeCode,
        this._closeMessage
      );
      this.readyState = ZitiWebSocketWrapper.CLOSED;
      this.emit('close', this._closeCode, this._closeMessage);
      return;
    }

    if (this._extensions[PerMessageDeflate.extensionName]) {
      this._extensions[PerMessageDeflate.extensionName].cleanup();
    }

    ziti._ctx.logger.debug(
      'emitClose 2: _closeCode=%o, _closeMessage=%o',
      this._closeCode,
      this._closeMessage
    );

    this._receiver.removeAllListeners();
    this.readyState = ZitiWebSocketWrapper.CLOSED;
    this.emit('close', this._closeCode, this._closeMessage);
  }

  /**
   * Start a closing handshake.
   *
   *          +----------+   +-----------+   +----------+
   *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
   *    |     +----------+   +-----------+   +----------+     |
   *          +----------+   +-----------+         |
   * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
   *          +----------+   +-----------+   |
   *    |           |                        |   +---+        |
   *                +------------------------+-->|fin| - - - -
   *    |         +---+                      |   +---+
   *     - - - - -|fin|<---------------------+
   *              +---+
   *
   * @param {Number} code Status code explaining why the connection is closing
   * @param {String} data A string explaining why the connection is closing
   * @public
   */
  close(code, data) {
    if (this.readyState === ZitiWebSocketWrapper.CLOSED) return;
    if (this.readyState === ZitiWebSocketWrapper.CONNECTING) {
      const msg =
        'ZitiWebSocketWrapper was closed before the connection was established';
      return abortHandshake(this, this._req, msg);
    }

    if (this.readyState === ZitiWebSocketWrapper.CLOSING) {
      if (this._closeFrameSent && this._closeFrameReceived) this._socket.end();
      return;
    }

    this.readyState = ZitiWebSocketWrapper.CLOSING;
    this._sender.close(code, data, !this._isServer, (err) => {
      //
      // This error is handled by the `'error'` listener on the socket. We only
      // want to know if the close frame has been sent here.
      //
      if (err) return;

      this._closeFrameSent = true;
      if (this._closeFrameReceived) this._socket.end();
    });

    //
    // Specify a timeout for the closing handshake to complete.
    //
    this._closeTimer = setTimeout(
      this._socket.destroy.bind(this._socket),
      closeTimeout
    );
  }

  /**
   * Send a ping.
   *
   * @param {*} data The data to send
   * @param {Boolean} mask Indicates whether or not to mask `data`
   * @param {Function} cb Callback which is executed when the ping is sent
   * @public
   */
  ping(data, mask, cb) {
    if (this.readyState === ZitiWebSocketWrapper.CONNECTING) {
      throw new Error('ZitiWebSocketWrapper is not open: readyState 0 (CONNECTING)');
    }

    if (typeof data === 'function') {
      cb = data;
      data = mask = undefined;
    } else if (typeof mask === 'function') {
      cb = mask;
      mask = undefined;
    }

    if (typeof data === 'number') data = data.toString();

    if (this.readyState !== ZitiWebSocketWrapper.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }

    if (mask === undefined) mask = !this._isServer;
    this._sender.ping(data || EMPTY_BUFFER, mask, cb);
  }

  /**
   * Send a pong.
   *
   * @param {*} data The data to send
   * @param {Boolean} mask Indicates whether or not to mask `data`
   * @param {Function} cb Callback which is executed when the pong is sent
   * @public
   */
  pong(data, mask, cb) {
    if (this.readyState === ZitiWebSocketWrapper.CONNECTING) {
      throw new Error('ZitiWebSocketWrapper is not open: readyState 0 (CONNECTING)');
    }

    if (typeof data === 'function') {
      cb = data;
      data = mask = undefined;
    } else if (typeof mask === 'function') {
      cb = mask;
      mask = undefined;
    }

    if (typeof data === 'number') data = data.toString();

    if (this.readyState !== ZitiWebSocketWrapper.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }

    if (mask === undefined) mask = !this._isServer;
    this._sender.pong(data || EMPTY_BUFFER, mask, cb);
  }

  /**
   * Send a data message.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.compress Specifies whether or not to compress
   *     `data`
   * @param {Boolean} options.binary Specifies whether `data` is binary or text
   * @param {Boolean} options.fin Specifies whether the fragment is the last one
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Function} cb Callback which is executed when data is written out
   * @public
   */
  send(data, options, cb) {
    if (this.readyState === ZitiWebSocketWrapper.CONNECTING) {
      throw new Error('ZitiWebSocketWrapper is not open: readyState 0 (CONNECTING)');
    }

    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (typeof data === 'number') data = data.toString();

    if (this.readyState !== ZitiWebSocketWrapper.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }

    const opts = {
      binary: typeof data !== 'string',
      mask: !this._isServer,
      compress: true,
      fin: true,
      ...options
    };

    if (!this._extensions[PerMessageDeflate.extensionName]) {
      opts.compress = false;
    }

    this._sender.send(data || EMPTY_BUFFER, opts, cb);
  }

  /**
   * Forcibly close the connection.
   *
   * @public
   */
  terminate() {
    if (this.readyState === ZitiWebSocketWrapper.CLOSED) return;
    if (this.readyState === ZitiWebSocketWrapper.CONNECTING) {
      const msg =
        'ZitiWebSocketWrapper was closed before the connection was established';
      return abortHandshake(this, this._req, msg);
    }

    if (this._socket) {
      this.readyState = ZitiWebSocketWrapper.CLOSING;
      this._socket.destroy();
    }
  }
}

readyStates.forEach((readyState, i) => {
  ZitiWebSocketWrapper[readyState] = i;
});

//
// Add the `onopen`, `onerror`, `onclose`, and `onmessage` attributes.
// See https://html.spec.whatwg.org/multipage/comms.html#the-websocket-interface
//
['open', 'error', 'close', 'message'].forEach((method) => {
  Object.defineProperty(ZitiWebSocketWrapper.prototype, `on${method}`, {
    /**
     * Return the listener of the event.
     *
     * @return {(Function|undefined)} The event listener or `undefined`
     * @public
     */
    get() {
      const listeners = this.listeners(method);
      for (let i = 0; i < listeners.length; i++) {
        if (listeners[i]._listener) return listeners[i]._listener;
      }

      return undefined;
    },
    /**
     * Add a listener for the event.
     *
     * @param {Function} listener The listener to add
     * @public
     */
    set(listener) {
      const listeners = this.listeners(method);
      for (let i = 0; i < listeners.length; i++) {
        //
        // Remove only the listeners added via `addEventListener`.
        //
        if (listeners[i]._listener) this.removeListener(method, listeners[i]);
      }
      this.addEventListener(method, listener);
    }
  });
});

ZitiWebSocketWrapper.prototype.addEventListener = addEventListener;
ZitiWebSocketWrapper.prototype.removeEventListener = removeEventListener;

module.exports = ZitiWebSocketWrapper;


/**
 * Initialize a ZitiWebSocket client.
 *
 * @param {ZitiWebSocket} websocket The client to initialize
 * @param {(String|url.URL)} address The URL to which to connect
 * @param {String} protocols The subprotocols
 * @param {Object} options Connection options
 * @param {(Boolean|Object)} options.perMessageDeflate Enable/disable
 *     permessage-deflate
 * @param {Number} options.handshakeTimeout Timeout in milliseconds for the
 *     handshake request
 * @param {Number} options.protocolVersion Value of the `Sec-WebSocket-Version`
 *     header
 * @param {String} options.origin Value of the `Origin` or
 *     `Sec-WebSocket-Origin` header
 * @param {Number} options.maxPayload The maximum allowed message size
 * @param {Boolean} options.followRedirects Whether or not to follow redirects
 * @param {Number} options.maxRedirects The maximum number of redirects allowed
 * @private
 */
async function initAsClient(websocket, address, protocols, options) {

    let serviceName;

    const opts = {
      enableTrace: true,
      protocolVersion: protocolVersions[1],
      maxPayload: 100 * 1024 * 1024,
      perMessageDeflate: true,
      followRedirects: false,
      maxRedirects: 10,
      href: address,
      ...options,
      createConnection: undefined,
      socketPath: undefined,
      hostname: undefined,
      protocol: undefined,
      timeout: undefined,
      method: undefined,
      host: undefined,
      path: undefined,
      port: undefined
    };
  
    ziti._ctx.logger.info(
      'ZitiWebSocketWrapper initAsClient(), address is: %s, options is: %o',
      address,
      opts
    );
  
    // /**
    //  *  Defer the Ziti init sequence for the moment.  We currently rely on
    //  *  ziti-electron-fetch component to have completed it for us.
    //  */
    // websocket.doZitiInitialization();

    // await websocket
    //   .isZitiInitialized()
    //   .catch((e) => logger.error('isZitiInitialized(), Error: ', e.message));
  
    if (!protocolVersions.includes(opts.protocolVersion)) {
      throw new RangeError(
        `Unsupported protocol version: ${opts.protocolVersion} ` +
          `(supported versions: ${protocolVersions.join(', ')})`
      );
    }
  
    let parsedUrl;
  
    if (address instanceof URL) {
      parsedUrl = address;
      websocket.url = address.href;
    } else {
      parsedUrl = new URL(address);
      websocket.url = address;
    }
  
    const isUnixSocket = parsedUrl.protocol === 'ws+unix:';
  
    if (!parsedUrl.host && (!isUnixSocket || !parsedUrl.pathname)) {
      throw new Error(`Invalid URL: ${websocket.url}`);
    }
  
    const isSecure = parsedUrl.protocol === 'wss:' || parsedUrl.protocol === 'https:';
    const defaultPort = isSecure ? 443 : 80;
    const key = randomBytes(16).toString('base64');
    const get = http.get;
    let perMessageDeflate;

    // await loadCookies(parsedUrl.hostname);

    // We only want to intercept fetch requests that target the Ziti HTTP Agent
    var regex = new RegExp( zitiConfig.httpAgent.self.host, 'g' );

    if (address.match( regex )) { // the request is targeting the Ziti HTTP Agent

        var newUrl = new URL( address );
        newUrl.hostname = zitiConfig.httpAgent.target.host;
        newUrl.port = zitiConfig.httpAgent.target.port;
        ziti._ctx.logger.trace( 'ZitiWebSocketWrapper: transformed URL: ', newUrl.toString());

        serviceName = await ziti._ctx.shouldRouteOverZiti( newUrl );

        if (isUndefined(serviceName)) { // If we have no serviceConfig associated with the hostname:port, do not intercept
            ziti._ctx.logger.warn('ZitiWebSocketWrapper(): no associated serviceConfig, bypassing intercept of [%s]', url);
            opts.createConnection = isSecure ? tlsConnect : netConnect;
            opts.host = parsedUrl.hostname.startsWith('[')
            ? parsedUrl.hostname.slice(1, -1)
            : parsedUrl.hostname;      
        } else {

            opts.createConnection = zitiConnect;    // We're going over Ziti

            newUrl.protocol = "http:";
            opts.href = newUrl.toString().toLowerCase();
            opts.origin = "http://" + (zitiConfig.httpAgent.target.host).toLowerCase();
            opts.host = zitiConfig.httpAgent.target.host + ":" + zitiConfig.httpAgent.target.port;
        }

    } else {  // the request is targeting the raw internet

        ziti._ctx.logger.warn('ZitiWebSocketWrapper(): no associated serviceConfig, bypassing intercept of [%s]', url);
        opts.createConnection = isSecure ? tlsConnect : netConnect;
        opts.host = parsedUrl.hostname.startsWith('[')
        ? parsedUrl.hostname.slice(1, -1)
        : parsedUrl.hostname;  
    }

  
    opts.defaultPort = opts.defaultPort || defaultPort;
    opts.port = parsedUrl.port || defaultPort;

    opts.headers = {
      'Sec-WebSocket-Version': opts.protocolVersion,
      'Sec-WebSocket-Key': key,
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      ...opts.headers
    };
    opts.path = parsedUrl.pathname + parsedUrl.search;

    let cookieString = '';

    let zitiCookies = await ls.getWithExpiry(zitiConstants.get().ZITI_COOKIES);
    if (!isNull(zitiCookies)) {

        for (const cookie in zitiCookies) {
            if (zitiCookies.hasOwnProperty(cookie)) {
                cookieString += cookie + '=' + zitiCookies[cookie] + ';';
            }
        }

    }


    opts.headers.Cookie = cookieString;
  
    opts.timeout = opts.handshakeTimeout;
    if (!opts.timeout) {
      opts.timeout = handshakeTimeout;
    }
  
    // if (opts.perMessageDeflate) {
    //   perMessageDeflate = new PerMessageDeflate(
    //     opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
    //     false,
    //     opts.maxPayload
    //   );
    //   opts.headers['Sec-WebSocket-Extensions'] = format({
    //     [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
    //   });
    // }
    if (protocols) {
      opts.headers['Sec-WebSocket-Protocol'] = protocols;
    }
    if (opts.origin) {
      if (opts.protocolVersion < 13) {
        opts.headers['Sec-WebSocket-Origin'] = opts.origin;
      } else {
        opts.headers.Origin = opts.origin;
      }
    }
    if (parsedUrl.username || parsedUrl.password) {
      opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
    }
  
    if (isUnixSocket) {
      const parts = opts.path.split(':');
      opts.socketPath = parts[0];
      opts.path = parts[1];
    }
  
    // build HTTP request object
    let request = new HttpRequest(serviceName, opts.href, opts);
    const req_options = await request.getRequestOptions();
    req_options.isWebSocket = true;
    
    // Send request
    let req = (websocket._req = get(req_options));
  
    ziti._ctx.logger.info('WebSocket handshake request has been sent: %o', websocket._req);
  
    if (opts.timeout) {
      req.on('timeout', () => {
        ziti._ctx.logger.info('req.on.timeout');
        abortHandshake(
          websocket,
          websocket._req,
            'Opening handshake has timed out'
        );
      });
    }
  
    req.on('error', (err) => {
        ziti._ctx.logger.error('req.on.error %o', err);
  
        if (websocket._req.aborted) return;
  
        req = websocket._req = null;
        websocket.readyState = ZitiWebSocketWrapper.CLOSING;
        websocket.emit('error', err);
        websocket.emitClose();
    });
  
    req.on('response', (res) => {
        ziti._ctx.logger.info('req.on.response %o', res);
  
        const location = res.headers.location;
        const statusCode = res.statusCode;
    
        if (
            location &&
            opts.followRedirects &&
            statusCode >= 300 &&
            statusCode < 400
        ) {
            if (++websocket._redirects > opts.maxRedirects) {
                abortHandshake(websocket, req, 'Maximum redirects exceeded');
                return;
            }
    
            req.abort();
    
            const addr = new URL(location, address);
    
            initAsClient(websocket, addr, protocols, options);

        } else if (!websocket.emit('unexpected-response', req, res)) {
            abortHandshake(
            websocket,
            req,
                `Unexpected server response: ${res.statusCode}`
            );
        }
    });
  
    req.on('upgrade', (res, socket, head) => {
        ziti._ctx.logger.info('WebSocket handshake on.upgrade \nsocket=[%o] \nHTTP Response=[%o]', socket, res);
  
        websocket.emit('upgrade', res);
  
        //
        // The user may have closed the connection from a listener of the `upgrade`
        // event.
        //
        if (websocket.readyState !== ZitiWebSocketWrapper.CONNECTING) return;
  
        req = websocket._req = null;
  
        const digest = createHash('sha1')
            .update(key + GUID)
            .digest('base64');
  
        ziti._ctx.logger.info(
            'WebSocket handshake on.upgrade\ndigest=%o\nheaders[sec-websocket-accept]=%o',
            digest,
            res.headers['sec-websocket-accept']
        );
  
        if (res.headers['sec-websocket-accept'] !== digest) {
            abortHandshake(websocket, socket, 'Invalid Sec-WebSocket-Accept header');
            return;
        }
  
        const serverProt = res.headers['sec-websocket-protocol'];
        const protList = (protocols || '').split(/, */);
        let protError;
  
        if (!protocols && serverProt) {
            protError = 'Server sent a subprotocol but none was requested';
        } else if (protocols && !serverProt) {
            protError = 'Server sent no subprotocol';
        } else if (serverProt && !protList.includes(serverProt)) {
            protError = 'Server sent an invalid subprotocol';
        }
  
        if (protError) {
            ziti._ctx.logger.error('protError=%o', protError);
            abortHandshake(websocket, socket, protError);
            return;
        }
  
        if (serverProt) websocket.protocol = serverProt;
  
        if (perMessageDeflate) {
            try {
            const extensions = parse(res.headers['sec-websocket-extensions']);
    
            if (extensions[PerMessageDeflate.extensionName]) {
                perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
                websocket._extensions[
                PerMessageDeflate.extensionName
                ] = perMessageDeflate;
            }
            } catch (err) {
            abortHandshake(
                websocket,
                socket,
                'Invalid Sec-WebSocket-Extensions header'
            );
            return;
            }
        }
  
        ziti._ctx.logger.info('WebSocket handshake SUCCESSFUL');
  
        websocket.setSocket(socket, head, opts.maxPayload);
    });
}
  

/**
 *
 * @param {*} options
 */
function zitiConnect(options) {

    ziti._ctx.logger.info('zitiConnect() entered: %o', options);
  
    options.path = undefined;
  
    if (!options.servername && options.servername !== '') {
        options.servername = options.host;
    }
  
    const socket = new ZitiSocket(ziti);
    socket.connect(options);
  
    logger.info('zitiConnect(): ZitiSocket is now connected to Ziti network: \n%o', socket);
  
    options.socket = socket;
    
    return socket;
}
  

/**
 * Abort the handshake and emit an error.
 *
 * @param {ZitiWebSocketWrapper} websocket The ZitiWebSocketWrapper instance
 * @param {(http.ClientRequest|net.Socket)} stream The request to abort or the
 *     socket to destroy
 * @param {String} message The error message
 * @private
 */
function abortHandshake(websocket, stream, message) {
    ziti._ctx.logger.info(
      'abortHandshake() entered: message: %o, stream: %o',
      message,
      stream
    );
  
    websocket.readyState = ZitiWebSocketWrapper.CLOSING;
  
    const err = new Error(message);
    Error.captureStackTrace(err, abortHandshake);
  
    if (stream.setHeader) {
      stream.abort();
      stream.once('abort', websocket.emitClose.bind(websocket));
      websocket.emit('error', err);
    } else {
      stream.destroy(err);
      stream.once('error', websocket.emit.bind(websocket, 'error'));
      stream.once('close', websocket.emitClose.bind(websocket));
    }
}
  

/**
 * Handle cases where the `ping()`, `pong()`, or `send()` methods are called
 * when the `readyState` attribute is `CLOSING` or `CLOSED`.
 *
 * @param {ZitiWebSocketWrapper} websocket The ZitiWebSocketWrapper instance
 * @param {*} data The data to send
 * @param {Function} cb Callback
 * @private
 */
function sendAfterClose(websocket, data, cb) {
    if (data) {
      const length = toBuffer(data).length;
  
      //
      // The `_bufferedAmount` property is used only when the peer is a client and
      // the opening handshake fails. Under these circumstances, in fact, the
      // `setSocket()` method is not called, so the `_socket` and `_sender`
      // properties are set to `null`.
      //
      if (websocket._socket) websocket._sender._bufferedBytes += length;
      else websocket._bufferedAmount += length;
    }
  
    if (cb) {
      const err = new Error(
        `ZitiWebSocketWrapper is not open: readyState ${websocket.readyState} ` +
          `(${readyStates[websocket.readyState]})`
      );
      cb(err);
    }
}
  

/**
 * The listener of the `Receiver` `'conclude'` event.
 *
 * @param {Number} code The status code
 * @param {String} reason The reason for closing
 * @private
 */
 function receiverOnConclude(code, reason) {
    const websocket = this[kWebSocket];
  
    websocket._socket.removeListener('data', socketOnData);
    websocket._socket.resume();
  
    websocket._closeFrameReceived = true;
    websocket._closeMessage = reason;
    websocket._closeCode = code;
  
    if (code === 1005) websocket.close();
    else websocket.close(code, reason);
  }
  
  /**
   * The listener of the `Receiver` `'drain'` event.
   *
   * @private
   */
  function receiverOnDrain() {
    this[kWebSocket]._socket.resume();
  }
  
  /**
   * The listener of the `Receiver` `'error'` event.
   *
   * @param {(RangeError|Error)} err The emitted error
   * @private
   */
  function receiverOnError(err) {
    const websocket = this[kWebSocket];
  
    websocket._socket.removeListener('data', socketOnData);
  
    websocket.readyState = ZitiWebSocketWrapper.CLOSING;
    websocket._closeCode = err[kStatusCode];
    websocket.emit('error', err);
    websocket._socket.destroy();
  }
  
  /**
   * The listener of the `Receiver` `'finish'` event.
   *
   * @private
   */
  function receiverOnFinish() {
    ziti._ctx.logger.info('receiverOnFinish() entered');
    this[kWebSocket].emitClose();
  }
  
  /**
   * The listener of the `Receiver` `'message'` event.
   *
   * @param {(String|Buffer|ArrayBuffer|Buffer[])} data The message
   * @private
   */
  function receiverOnMessage(data) {
    this[kWebSocket].emit('message', data);
  }
  
  /**
   * The listener of the `Receiver` `'ping'` event.
   *
   * @param {Buffer} data The data included in the ping frame
   * @private
   */
  function receiverOnPing(data) {
    const websocket = this[kWebSocket];
  
    websocket.pong(data, !websocket._isServer, NOOP);
    websocket.emit('ping', data);
  }
  
  /**
   * The listener of the `Receiver` `'pong'` event.
   *
   * @param {Buffer} data The data included in the pong frame
   * @private
   */
  function receiverOnPong(data) {
    this[kWebSocket].emit('pong', data);
  }

  
  /**
 * The listener of the `net.Socket` `'close'` event.
 *
 * @private
 */
function socketOnClose() {
    ziti._ctx.logger.info('ZitiWebSocketWrapper socketOnClose entered');
  
    const websocket = this[kWebSocket];
  
    this.removeListener('close', socketOnClose);
    this.removeListener('end', socketOnEnd);
  
    websocket.readyState = ZitiWebSocketWrapper.CLOSING;
  
    //
    // The close frame might not have been received or the `'end'` event emitted,
    // for example, if the socket was destroyed due to an error. Ensure that the
    // `receiver` stream is closed after writing any remaining buffered data to
    // it. If the readable side of the socket is in flowing mode then there is no
    // buffered data as everything has been already written and `readable.read()`
    // will return `null`. If instead, the socket is paused, any possible buffered
    // data will be read as a single chunk and emitted synchronously in a single
    // `'data'` event.
    //
    websocket._socket.read();
    websocket._receiver.end();
  
    this.removeListener('data', socketOnData);
    this[kWebSocket] = undefined;
  
    clearTimeout(websocket._closeTimer);
  
    if (
      websocket._receiver._writableState.finished ||
      websocket._receiver._writableState.errorEmitted
    ) {
      websocket.emitClose();
    } else {
      websocket._receiver.on('error', receiverOnFinish);
      websocket._receiver.on('finish', receiverOnFinish);
    }
  }
  
  /**
   * The listener of the `net.Socket` `'data'` event.
   *
   * @param {Buffer} chunk A chunk of data
   * @private
   */
  function socketOnData(chunk) {
    ziti._ctx.logger.info('ZitiWebSocketWrapper socketOnData entered');
  
    if (!this[kWebSocket]._receiver.write(chunk)) {
      this.pause();
    }
  }
  
  /**
   * The listener of the `net.Socket` `'end'` event.
   *
   * @private
   */
  function socketOnEnd() {
    ziti._ctx.logger.debug('ZitiWebSocketWrapper socketOnEnd entered');
  
    const websocket = this[kWebSocket];
  
    websocket.readyState = ZitiWebSocketWrapper.CLOSING;
    websocket._receiver.end();
    this.end();
  }
  
  /**
   * The listener of the `net.Socket` `'error'` event.
   *
   * @private
   */
  function socketOnError() {
    ziti._ctx.logger.debug('ZitiWebSocketWrapper socketOnError entered');
  
    const websocket = this[kWebSocket];
  
    this.removeListener('error', socketOnError);
    this.on('error', NOOP);
  
    if (websocket) {
      websocket.readyState = ZitiWebSocketWrapper.CLOSING;
      this.destroy();
    }
  }
  