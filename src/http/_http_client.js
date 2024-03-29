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


'use strict';

const url = require('url');
const assert = require('assert');

const {
  _checkIsHttpToken: checkIsHttpToken,
  freeParser,
  parsers,
  HTTPParser,
  prepareError,
} = require('./_http_common');

const { OutgoingMessage } = require('./_http_outgoing');
const ZitiAgent = require('./ziti-agent');
const { Buffer } = require('buffer');
const searchParamsSymbol = Symbol('search');
const { kOutHeaders, kNeedDrain } = require('./internal/http');
const { connResetException, codes } = require('./internal/errors');
const {
  ERR_HTTP_HEADERS_SENT,
  ERR_INVALID_ARG_TYPE,
  ERR_INVALID_HTTP_TOKEN,
  ERR_INVALID_PROTOCOL,
  ERR_UNESCAPED_CHARACTERS
} = codes;


// Utility function that converts a URL object into an ordinary
// options object as expected by the http.request API.
function urlToOptions(url) {
  const options = {
    serviceName: url.serviceName,
    conn: url.conn,
    protocol: url.protocol,
    hostname: typeof url.hostname === 'string' && url.hostname.startsWith('[') ?
      url.hostname.slice(1, -1) :
      url.hostname,
    hash: url.hash,
    headers: url.headers,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname || ''}${url.search || ''}`,
    href: url.href
  };
  if (url.port !== '') {
    options.port = Number(url.port);
  }
  if (url.username || url.password) {
    options.auth = `${url.username}:${url.password}`;
  }
  return options;
}


const INVALID_PATH_REGEX = /[^\u0021-\u00ff]/;
const kError = Symbol('kError');

function validateHost(host, name) {
  if (host !== null && host !== undefined && typeof host !== 'string') {
    throw new ERR_INVALID_ARG_TYPE(`options.${name}`,
                                   ['string', 'undefined', 'null'],
                                   host);
  }
  return host;
}


let urlWarningEmitted = false;

function ClientRequest(input, options, cb) {

  OutgoingMessage.call(this);
  
  if (typeof input === 'string') {
    const urlStr = input;
    try {
      input = urlToOptions(new URL(urlStr));
    } catch (err) {
      input = url.parse(urlStr);
      if (!input.hostname) {
        throw err;
      }
      if (!urlWarningEmitted && !process.noDeprecation) {
        urlWarningEmitted = true;
        process.emitWarning(
          `The provided URL ${urlStr} is not a valid URL, and is supported ` +
          'in the http module solely for compatibility.',
          'DeprecationWarning', 'DEP0109');
      }
    }
  } else if (input.search) {
    // url.URL instance
    input = urlToOptions(input);
  } else {
    cb = options;
    options = input;
    input = null;
  }

  if (typeof options === 'function') {
    cb = options;
    options = input || {};
  } else {
    options = Object.assign(input || {}, options);
  }

  this.agent = new ZitiAgent(options);

  const protocol = 'https:';

  let path;
  if (options.path) {
    path = String(options.path);
    if (INVALID_PATH_REGEX.test(path))
      throw new ERR_UNESCAPED_CHARACTERS('Request path');
  }

  const defaultPort = options.defaultPort ||
                    (this.agent && this.agent.defaultPort);

  const port = options.port = options.port || defaultPort || 80;
  const host = options.host = validateHost(options.hostname, 'hostname') ||
                            validateHost(options.host, 'host') || 'localhost';

  this.socketPath = options.socketPath;

  let method = options.method;
  const methodIsString = (typeof method === 'string');
  if (method !== null && method !== undefined && !methodIsString) {
    throw new ERR_INVALID_ARG_TYPE('options.method', 'string', method);
  }

  if (methodIsString && method) {
    if (!checkIsHttpToken(method)) {
      throw new ERR_INVALID_HTTP_TOKEN('Method', method);
    }
    method = this.method = method.toUpperCase();
  } else {
    method = this.method = 'GET';
  }

  this.maxHeaderSize = options.maxHeaderSize;

  this.path = options.path || '/';
  if (cb) {
    this.once('response', cb);
  }

  this.domProxyHit = options.domProxyHit || 0;

  if (method === 'GET' ||
      method === 'HEAD' ||
      method === 'DELETE' ||
      method === 'OPTIONS' ||
      method === 'TRACE' ||
      method === 'CONNECT') {
    this.useChunkedEncodingByDefault = false;
  } else {
    this.useChunkedEncodingByDefault = true;
  }

  this._ended = false;
  this.res = null;
  this.aborted = false;
  this.timeoutCb = null;
  this.upgradeOrConnect = false;
  this.parser = null;
  this.maxHeadersCount = null;
  this.reusedSocket = false;
  this.host = host;
  this.protocol = protocol;

  let called = false;

  if (this.agent) {
    // If there is an agent we should default to Connection:keep-alive,
    // but only if the Agent will actually reuse the connection!
    // If it's not a keepAlive agent, and the maxSockets==Infinity, then
    // there's never a case where this socket will actually be reused
    // if (!this.agent.keepAlive && !NumberIsFinite(this.agent.maxSockets)) {
    if (!this.agent.keepAlive) {
        this._last = true;
      this.shouldKeepAlive = false;
    } else {
      this._last = false;
      this.shouldKeepAlive = true;
    }
  }

  const headersArray = Array.isArray(options.headers.raw());
  if (!headersArray) {
    if (options.headers.raw()) {
      const keys = Object.keys(options.headers.raw());
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = options.headers.raw()[key][0];
        this.setHeader(key, val);
      }
    }

    if (host && !this.getHeader('host') /* && setHost */) {
      let hostHeader = host;

      // For the Host header, ensure that IPv6 addresses are enclosed
      // in square brackets, as defined by URI formatting
      // https://tools.ietf.org/html/rfc3986#section-3.2.2
      const posColon = hostHeader.indexOf(':');
      if (posColon !== -1 &&
          hostHeader.includes(':', posColon + 1) &&
          hostHeader.charCodeAt(0) !== 91/* '[' */) {
        hostHeader = `[${hostHeader}]`;
      }

      if (port && +port !== defaultPort) {
        hostHeader += ':' + port;
      }
      this.setHeader('Host', hostHeader);
    }

    if (options.auth && !this.getHeader('Authorization')) {
      this.setHeader('Authorization', 'Basic ' +
                     Buffer.from(options.auth).toString('base64'));
    }

    if (this.getHeader('expect')) {
      if (this._header) {
        throw new ERR_HTTP_HEADERS_SENT('render');
      }

      this._storeHeader(this.method + ' ' + this.path + ' HTTP/1.1\r\n',
                        this[kOutHeaders]);
    }
  } else {
    this._storeHeader(this.method + ' ' + this.path + ' HTTP/1.1\r\n',
                      options.headers.raw());
  }

  const oncreate = (err, socket) => {
    if (called)
      return;
    called = true;
    if (err) {
      process.nextTick(() => this.emit('error', err));
      return;
    }
    this.onSocket(socket);
    this._deferToConnect(null, null, () => this._flush());
  };

  // initiate connection
  this.agent.addRequest(this, options);

  this._deferToConnect(null, null, () => this._flush());
}
Object.setPrototypeOf(ClientRequest.prototype, OutgoingMessage.prototype);
Object.setPrototypeOf(ClientRequest, OutgoingMessage);

ClientRequest.prototype._finish = function _finish() {
  // DTRACE_HTTP_CLIENT_REQUEST(this, this.socket);
  OutgoingMessage.prototype._finish.call(this);
};

ClientRequest.prototype._implicitHeader = function _implicitHeader() {
  if (this._header) {
    throw new ERR_HTTP_HEADERS_SENT('render');
  }
  this._storeHeader(this.method + ' ' + this.path + ' HTTP/1.1\r\n',
                    this[kOutHeaders]);
};

ClientRequest.prototype.abort = function abort() {
  if (this.aborted) {
    return;
  }
  this.aborted = true;
  process.nextTick(emitAbortNT, this);
  this.destroy();
};

ClientRequest.prototype.destroy = function destroy(err) {
  if (this.destroyed) {
    return this;
  }
  this.destroyed = true;

  // If we're aborting, we don't care about any more response data.
  if (this.res) {
    this.res._dump();
  }

  // In the event that we don't have a socket, we will pop out of
  // the request queue through handling in onSocket.
  if (this.socket) {
    _destroy(this, this.socket, err);
  } else if (err) {
    this[kError] = err;
  }

  return this;
};

function _destroy(req, socket, err) {
  // TODO (ronag): Check if socket was used at all (e.g. headersSent) and
  // re-use it in that case. `req.socket` just checks whether the socket was
  // assigned to the request and *might* have been used.
  if (socket && (!req.agent || req.socket)) {
    socket.destroy(err);
  } else {
    if (socket) {
      socket.emit('free');
    }
    if (!req.aborted && !err) {
      err = connResetException('socket hang up');
    }
    if (err) {
      req.emit('error', err);
    }
    req._closed = true;
    req.emit('close');
  }
}

function emitAbortNT(req) {
  req.emit('abort');
}

function ondrain() {
  const msg = this._httpMessage;
  if (msg && !msg.finished && msg[kNeedDrain]) {
    msg[kNeedDrain] = false;
    msg.emit('drain');
  }
}

function socketCloseListener() {
  const socket = this;
  const req = socket._httpMessage;
  // debug('HTTP socket close');

  // Pull through final chunk, if anything is buffered.
  // the ondata function will handle it properly, and this
  // is a no-op if no final chunk remains.
  socket.read();

  // NOTE: It's important to get parser here, because it could be freed by
  // the `socketOnData`.
  const parser = socket.parser;
  const res = req.res;

  req.destroyed = true;
  if (res) {
    // Socket closed before we emitted 'end' below.
    // TOOD(ronag): res.destroy(err)
    if (!res.complete) {
      res.aborted = true;
      res.emit('aborted');
      if (res.listenerCount('error') > 0) {
        res.emit('error', connResetException('aborted'));
      }
    }
    req._closed = true;
    req.emit('close');
    if (!res.aborted && res.readable) {
      res.on('end', function() {
        this.destroyed = true;
        this.emit('close');
      });
      res.push(null);
    } else {
      res.destroyed = true;
      res.emit('close');
    }
  } else {
    if (!req.socket._hadError) {
      // This socket error fired before we started to
      // receive a response. The error needs to
      // fire on the request.
      req.socket._hadError = true;
      req.emit('error', connResetException('socket hang up'));
    }
    req._closed = true;
    req.emit('close');
  }

  // Too bad.  That output wasn't getting written.
  // This is pretty terrible that it doesn't raise an error.
  // Fixed better in v0.10
  if (req.outputData)
    req.outputData.length = 0;

  if (parser) {
    parser.finish();
    freeParser(parser, req, socket);
  }
}

function socketErrorListener(err) {
  const socket = this;
  const req = socket._httpMessage;
  // debug('SOCKET ERROR:', err.message, err.stack);

  if (req) {
    // For Safety. Some additional errors might fire later on
    // and we need to make sure we don't double-fire the error event.
    req.socket._hadError = true;
    req.emit('error', err);
  }

  const parser = socket.parser;
  if (parser) {
    parser.finish();
    freeParser(parser, req, socket);
  }

  // Ensure that no further data will come out of the socket
  socket.removeListener('data', socketOnData);
  socket.removeListener('end', socketOnEnd);
  socket.destroy();
}

function socketOnEnd() {
  const socket = this;
  const req = this._httpMessage;
  const parser = this.parser;

  if (!req.res && !req.socket._hadError) {
    // If we don't have a response then we know that the socket
    // ended prematurely and we need to emit an error on the request.
    req.socket._hadError = true;
    req.emit('error', connResetException('socket hang up'));
  }
  if (parser) {
    parser.finish();
    freeParser(parser, req, socket);
  }
  socket.destroy();
}

function socketOnData(d) {  
  const socket = this;
  const req = this._httpMessage;
  const parser = this.parser;

  assert(parser && parser.socket === socket);

  const ret = parser.execute(d);
  if (ret instanceof Error) {
    prepareError(ret, parser, d);
    // debug('parse error', ret);
    freeParser(parser, req, socket);
    socket.destroy();
    req.socket._hadError = true;
    req.emit('error', ret);
  } else if (parser.incoming && parser.incoming.upgrade) {
    // Upgrade (if status code 101) or CONNECT
    const bytesParsed = ret;
    const res = parser.incoming;
    req.res = res;

    socket.removeListener('data', socketOnData);
    socket.removeListener('end', socketOnEnd);
    socket.removeListener('drain', ondrain);

    if (req.timeoutCb)
      socket.removeListener('timeout', req.timeoutCb);

    parser.finish();
    freeParser(parser, req, socket);

    const bodyHead = d.slice(bytesParsed, d.length);

    const eventName = req.method === 'CONNECT' ? 'connect' : 'upgrade';
    if (req.listenerCount(eventName) > 0) {
      req.upgradeOrConnect = true;

      // detach the socket
      socket.emit('agentRemove');
      socket.removeListener('close', socketCloseListener);
      socket.removeListener('error', socketErrorListener);

      socket._httpMessage = null;
      socket.readableFlowing = null;

      req.emit(eventName, res, socket, bodyHead);
      req.destroyed = true;
      req._closed = true;
      req.emit('close');
    } else {
      // Requested Upgrade or used CONNECT method, but have no handler.
      socket.destroy();
    }
  } else if (parser.incoming && parser.incoming.complete &&
             // When the status code is informational (100, 102-199),
             // the server will send a final response after this client
             // sends a request body, so we must not free the parser.
             // 101 (Switching Protocols) and all other status codes
             // should be processed normally.
             !statusIsInformational(parser.incoming.statusCode)) {
    socket.removeListener('data', socketOnData);
    socket.removeListener('end', socketOnEnd);
    socket.removeListener('drain', ondrain);
    freeParser(parser, req, socket);
  }
}

function statusIsInformational(status) {
  // 100 (Continue)    RFC7231 Section 6.2.1
  // 102 (Processing)  RFC2518
  // 103 (Early Hints) RFC8297
  // 104-199 (Unassigned)
  return (status < 200 && status >= 100 && status !== 101);
}

// client
function parserOnIncomingClient(res, shouldKeepAlive) {
  const socket = this.socket;
  const req = socket._httpMessage;

  // debug('AGENT incoming response!');

  if (req.res) {
    // We already have a response object, this means the server
    // sent a double response.
    socket.destroy();
    return 0;  // No special treatment.
  }
  req.res = res;

  // Skip body and treat as Upgrade.
  if (res.upgrade)
    return 2;

  // Responses to CONNECT request is handled as Upgrade.
  const method = req.method;
  if (method === 'CONNECT') {
    res.upgrade = true;
    return 2;  // Skip body and treat as Upgrade.
  }

  if (statusIsInformational(res.statusCode)) {
    // Restart the parser, as this is a 1xx informational message.
    req.res = null; // Clear res so that we don't hit double-responses.
    // Maintain compatibility by sending 100-specific events
    if (res.statusCode === 100) {
      req.emit('continue');
    }
    // Send information events to all 1xx responses except 101 Upgrade.
    req.emit('information', {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      httpVersion: res.httpVersion,
      httpVersionMajor: res.httpVersionMajor,
      httpVersionMinor: res.httpVersionMinor,
      headers: res.headers,
      rawHeaders: res.rawHeaders
    });

    return 1;  // Skip body but don't treat as Upgrade.
  }

  if (req.shouldKeepAlive && !shouldKeepAlive && !req.upgradeOrConnect) {
    // Server MUST respond with Connection:keep-alive for us to enable it.
    // If we've been upgraded (via WebSockets) we also shouldn't try to
    // keep the connection open.
    req.shouldKeepAlive = false;
  }

  // DTRACE_HTTP_CLIENT_RESPONSE(socket, req);
  req.res = res;
  res.req = req;

  // Add our listener first, so that we guarantee socket cleanup
  res.on('end', responseOnEnd);
  req.on('prefinish', requestOnPrefinish);

  // If the user did not listen for the 'response' event, then they
  // can't possibly read the data, so we ._dump() it into the void
  // so that the socket doesn't hang there in a paused state.
  if (req.aborted || !req.emit('response', res))
    res._dump();

  if (method === 'HEAD')
    return 1;  // Skip body but don't treat as Upgrade.

  return 0;  // No special treatment.
}

// client
function responseKeepAlive(req) {
  const socket = req.socket;

  // debug('AGENT socket keep-alive');
  if (req.timeoutCb) {
    socket.setTimeout(0, req.timeoutCb);
    req.timeoutCb = null;
  }
  socket.removeListener('close', socketCloseListener);
  socket.removeListener('error', socketErrorListener);
  socket.removeListener('data', socketOnData);
  socket.removeListener('end', socketOnEnd);

  // TODO(ronag): Between here and emitFreeNT the socket
  // has no 'error' handler.

  // There are cases where _handle === null. Avoid those. Passing undefined to
  // nextTick() will call getDefaultTriggerAsyncId() to retrieve the id.
  const asyncId = socket._handle ? socket._handle.getAsyncId() : undefined;
  // Mark this socket as available, AFTER user-added end
  // handlers have a chance to run.
  // defaultTriggerAsyncIdScope(asyncId, process.nextTick, emitFreeNT, req);

  req.destroyed = true;
  if (req.res) {
    req.res.destroyed = true;
    // Detach socket from IncomingMessage to avoid destroying the freed
    // socket in IncomingMessage.destroy().
    req.res.socket = null;
  }
}

function responseOnEnd() {
  const req = this.req;

  if (req.socket && req.timeoutCb) {
    req.socket.removeListener('timeout', emitRequestTimeout);
  }

  req._ended = true;

  if (!req.shouldKeepAlive) {
    const socket = req.socket;
    if (socket.writable) {
      // debug('AGENT socket.destroySoon()');
      if (typeof socket.destroySoon === 'function')
        socket.destroySoon();
      else
        socket.end();
    }
    assert(!socket.writable);
  } else if (req.finished && !this.aborted) {
    // We can assume `req.finished` means all data has been written since:
    // - `'responseOnEnd'` means we have been assigned a socket.
    // - when we have a socket we write directly to it without buffering.
    // - `req.finished` means `end()` has been called and no further data.
    //   can be written
    responseKeepAlive(req);
  }
}

function requestOnPrefinish() {
  const req = this;

  if (req.shouldKeepAlive && req._ended)
    responseKeepAlive(req);
}

function emitFreeNT(req) {
  req._closed = true;
  req.emit('close');
  if (req.res) {
    req.res.emit('close');
  }

  if (req.socket) {
    req.socket.emit('free');
  }
}

function tickOnSocket(req, socket) {
  const parser = parsers.alloc();
  req.socket = socket;
  parser.initialize(HTTPParser.RESPONSE); 
  parser.socket = socket;
  parser.outgoing = req;
  req.parser = parser;

  socket.parser = parser;
  socket._httpMessage = req;

  // Propagate headers limit from request object to parser
  if (typeof req.maxHeadersCount === 'number') {
    parser.maxHeaderPairs = req.maxHeadersCount << 1;
  }

  parser.onIncoming = parserOnIncomingClient;
  socket.on('error', socketErrorListener);
  socket.on('data', socketOnData);
  socket.on('end', socketOnEnd);
  socket.on('close', socketCloseListener);
  socket.on('drain', ondrain);

  if (
    req.timeout !== undefined ||
    (req.agent && req.agent.options && req.agent.options.timeout)
  ) {
    listenSocketTimeout(req);
  }
  req.emit('socket', socket);
}

function emitRequestTimeout() {
  const req = this._httpMessage;
  if (req) {
    req.emit('timeout');
  }
}

function listenSocketTimeout(req) {
  if (req.timeoutCb) {
    return;
  }
  // Set timeoutCb so it will get cleaned up on request end.
  req.timeoutCb = emitRequestTimeout;
  // Delegate socket timeout event.
  if (req.socket) {
    req.socket.once('timeout', emitRequestTimeout);
  } else {
    req.on('socket', (socket) => {
      socket.once('timeout', emitRequestTimeout);
    });
  }
}

ClientRequest.prototype.onSocket = function onSocket(socket, err) {
  // TODO(ronag): Between here and onSocketNT the socket
  // has no 'error' handler.
  process.nextTick(onSocketNT, this, socket, err);
};

function onSocketNT(req, socket, err) {
  if (req.destroyed) {
    _destroy(req, socket, req[kError]);
  } else if (err) {
    req.destroyed = true;
    _destroy(req, null, err);
  } else {
    tickOnSocket(req, socket);
  }
}

ClientRequest.prototype._deferToConnect = _deferToConnect;
function _deferToConnect(method, arguments_, cb) {
  // This function is for calls that need to happen once the socket is
  // assigned to this request and writable. It's an important promisy
  // thing for all the socket calls that happen either now
  // (when a socket is assigned) or in the future (when a socket gets
  // assigned out of the pool and is eventually writable).

  const callSocketMethod = () => {
    if (method)
      this.socket[method].apply(this.socket, arguments_);

    if (typeof cb === 'function')
      cb();
  };

  const onSocket = () => {
    if (this.socket.writable) {
      callSocketMethod();
    } else {
      this.socket.once('connect', callSocketMethod);
    }
  };

  if (!this.socket) {
    this.once('socket', onSocket);
  } else {
    onSocket();
  }
}

ClientRequest.prototype.setTimeout = function setTimeout(msecs, callback) {
  if (this._ended) {
    return this;
  }

  listenSocketTimeout(this);
  // msecs = getTimerDuration(msecs, 'msecs');
  if (callback) this.once('timeout', callback);

  if (this.socket) {
    setSocketTimeout(this.socket, msecs);
  } else {
    this.once('socket', (sock) => setSocketTimeout(sock, msecs));
  }

  return this;
};

function setSocketTimeout(sock, msecs) {
  if (sock.connecting) {
    sock.once('connect', function() {
      sock.setTimeout(msecs);
    });
  } else {
    sock.setTimeout(msecs);
  }
}

ClientRequest.prototype.setNoDelay = function setNoDelay(noDelay) {
  this._deferToConnect('setNoDelay', [noDelay]);
};

ClientRequest.prototype.setSocketKeepAlive =
    function setSocketKeepAlive(enable, initialDelay) {
      this._deferToConnect('setKeepAlive', [enable, initialDelay]);
    };

ClientRequest.prototype.clearTimeout = function clearTimeout(cb) {
  this.setTimeout(0, cb);
};

module.exports = {
  ClientRequest
};
