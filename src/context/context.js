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
const MicroModal = require('micromodal');
const consola = require('consola');
const find = require('lodash.find');
const filter = require('lodash.filter');
const isEqual = require('lodash.isequal');
const minby = require('lodash.minby');
const forEach = require('lodash.foreach');
const isUndefined = require('lodash.isundefined');
const merge = require('lodash.merge');
const result = require('lodash.result');
const has = require('lodash.has');
const toNumber = require('lodash.tonumber');
const Mutex = require('async-mutex');

const utils = require('../utils/utils');
const ls = require('../utils/localstorage');
const edge_protocol = require('../channel/protocol');
// const ZitiEdge = require('../edge/edge');
const defaultOptions = require('./options');
const identityModalCSS = require('../ui/identity_modal/css');
const identityModalHTML = require('../ui/identity_modal/html');
const identityModalSelect = require('../ui/identity_modal/select');
const identityModalDragDrop = require('../ui/identity_modal/dragdrop');
const zitiConstants = require('../constants');
const ZitiReporter = require('../utils/ziti-reporter');
const ZitiControllerClient = require('./controller-client');
const ZitiChannel     = require('../channel/channel');


/**
 * Expose `ZitiContext`.
 */

module.exports = ZitiContext;

/**
 * Initialize a new `ZitiContext`.
 *
 * @api public
 */

function ZitiContext(obj) {
  var ctx = mixin(obj);
  return ctx;
}

/**
 * Mixin the prototype properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */
function mixin(obj) {
  for (const key in ZitiContext.prototype) {
    if (Object.prototype.hasOwnProperty.call(ZitiContext.prototype, key))
      obj[key] = ZitiContext.prototype[key];
  }

  return obj;
}


/**
 * Injects and opens the Modal dialog that prompts for the identity file.
 *
 */
ZitiContext.prototype.loadIdentity = async function() {

  this._ztAPI = ls.getWithExpiry(zitiConstants.get().ZITI_CONTROLLER);

  if (this._ztAPI) {
    return;
  }

  identityModalCSS.inject();
  identityModalHTML.inject();
  identityModalSelect.injectChangeHandler();
  identityModalDragDrop.injectDragDropHandler();


  MicroModal.init({
    onShow: modal => console.info(`${modal.id} is shown`), // [1]
    onClose: modal => console.info(`${modal.id} is hidden`), // [2]
    openTrigger: 'ziti-data-micromodal-trigger', // [3]
    closeTrigger: 'data-custom-close', // [4]
    openClass: 'is-open', // [5]
    disableScroll: true, // [6]
    disableFocus: false, // [7]
    awaitOpenAnimation: false, // [8]
    awaitCloseAnimation: true, // [9]
    debugMode: false // [10]
  });

  MicroModal.show('modal-1');

  this._modalIsOpen = true;

}


/**
 * Return a Promise that will resolve as soon as we have the location of the Ziti Controller.
 *
 * @returns {Promise}   
 */
ZitiContext.prototype._awaitIdentityLoadComplete = async function() {

  let self = this;

  this.loadIdentity();

  return new Promise((resolve, reject) => {
    let startTime = new Date();
    (function waitForIdentityLoadComplete() {
      self._ztAPI = ls.getWithExpiry(zitiConstants.get().ZITI_CONTROLLER);
      if (self._ztAPI) {
        if (self._modalIsOpen) {
          MicroModal.close('modal-1');
          self._modalIsOpen = false;
        }
        return resolve(self._ztAPI);
      }
      self.logger.debug('awaitIdentityLoadComplete() identity still not loaded');
      let now = new Date();
      let elapsed = now.getTime() - startTime.getTime();
      if (elapsed > 1000*60) {
        return reject('Identity not specified');
      } else {
        setTimeout(waitForIdentityLoadComplete, 500);
      }
    })();
  });
}


/**
 * Initialize the Ziti Context.
 * 
 * Tasks:
 * - validate options
 * - create logger
 * - load the Ziti Identity
 * - create Controller client
 * - get Controller version
 * - establish an API session with Controller
 * - fetch list of active services from Controller
 *
 * @param {Object} [options]
 * @returns {nothing}   
 */
ZitiContext.prototype.init = async function(options) {

  let _options = flatOptions(options, defaultOptions);

  this.logger = consola.create({
    level: _options.logLevel,
    reporters: [
      new ZitiReporter()
    ],
    defaults: {
      additionalColor: 'white'
    }
  })


  this._ztAPI = await this._awaitIdentityLoadComplete().catch((err) => {
    this.logger.error(err);
    throw err;
  });
  this.logger.debug('Controller URL from loaded Identity: [%o]', this._ztAPI);

  this._timeout = zitiConstants.get().ZITI_DEFAULT_TIMEOUT;

  this._network_sessions = new Map();
  this._services = new Map();
  this._channels = new Map();
  // this._connections = new Map();
  // this._edges = new Map();
  this._channelSeq = 0;
  this._connSeq = 0;

  this._mutex = new Mutex.Mutex();

  this._controllerClient = new ZitiControllerClient({
    domain: this._ztAPI,
    logger: this.logger
  });

  try {

    // Get Controller version info
    let res = await this._controllerClient.listVersion();
    this._controllerVersion = res.data;
    this.logger.debug('Controller Version: [%o]', this._controllerVersion);

    // Get an API session with Controller
    res = await this._controllerClient.authenticate({
      method: 'cert',
      body: { 
        configTypes: [
          'ziti-tunneler-client.v1'
        ]
       }
    });
    this._apiSession = res.data;
    this.logger.debug('Controller API Session established: [%o]', this._apiSession);

    // Set the token header on behalf of all subsequent Controller API calls
    this._controllerClient.setApiKey(this._apiSession.token, 'zt-session', false);

    this._sequence = 0;

  } catch (err) {
    this.logger.error(err);
  }

}


ZitiContext.prototype.fetchServices = async function() {
  // Get list of active Services from Controller
  res = await this._controllerClient.listServices({ limit: '100' });
  this._services = res.data;
  this.logger.debug('List of available Services acquired: [%o]', this._services);  
}


ZitiContext.prototype.getServiceNameByHostNameAndPort = async function(hostname, port) {

  const release = await this._mutex.acquire();
  if (isEqual( this.getServices().size, 0 )) {
    await this.fetchServices();
  }
  release();

  let serviceName = result(find(this._services, function(obj) {
    let config = obj.config['ziti-tunneler-client.v1'];
    if (isUndefined(config)) {
      return false;
    }
    if (config.hostname !== hostname) {
      return false;
    }
    if (config.port !== port) {
      return false;
    }
    return true;
  }), 'name');
  return serviceName;
}


/**
 * Connect specified ZitiConnection to the nearest Edge Router.
 * 
 * @param {ZitiConnection} conn
 * @param {ZitiConnection} networkSession
 * @returns {bool}
 */
ZitiContext.prototype.connect = async function(conn, networkSession) {

  conn.token = networkSession.token;

  // Get list of all Edge Router URLs where the Edge Router has a WSS binding
  let edgeRouters = filter(networkSession.edgeRouters, function(o) { return has(o, 'urls.wss'); });

  let pendingChannelConnects = new Array();

  let self = this;

  // Get a channel connection to each of the Edge Routers that have a WSS binding, initiating a connection if channel is not yet connected
  forEach(edgeRouters, function(edgeRouter) {
    let ch = self.getChannelByEdgeRouter(conn, edgeRouter.hostname);
    self.logger.debug('initiating Hello to [%s] for session[%s]', edgeRouter.urls.wss, conn.token);  
    pendingChannelConnects.push( 
      ch.hello() 
    );
  });
  let channelConnects = await Promise.all( pendingChannelConnects );

  // Select channel with nearest Edge Router. Heuristic: select one with earliest Hello-handshake completion timestamp
  let channelConnectWithNearestEdgeRouter = minby(channelConnects, function(channelConnect) { 
    return channelConnect.channel.helloCompletedTimestamp;
  });
  let channelWithNearestEdgeRouter = channelConnectWithNearestEdgeRouter.channel;
  this.logger.debug('Channel [%d] has nearest Edge Router', channelWithNearestEdgeRouter.getId());
  channelWithNearestEdgeRouter._connections._saveConnection(conn);
  conn.setChannel(channelWithNearestEdgeRouter);

  // Initiate connection with Edge Router (creates Fabric session)
  await channelWithNearestEdgeRouter.connect(conn);

  // Do not proceed until crypto handshake has completed
  await channelWithNearestEdgeRouter.awaitConnectionCryptoEstablishComplete(conn);

}


/**
 * Create a connection with Edge Router. This will instantiate a network session that reaches through Fabric at terminates at designated service.
 *
 * @returns {Promise}
 */
// ZitiContext.prototype._connect = async function(conn) {

//   const self = this;
//   return new Promise( async (resolve, reject) => {

//     const release = await self._mutex.acquire();

//     self.logger.debug('initiating Connect to Edge Router [%s] for conn[%d]', conn.getChannel().getEdgeRouterHost(), conn.getId());

//     await sodium.ready;

//     let sequence = conn.getAndIncrementSequence();
//     self.logger.debug('Connect sequence [%d]', sequence);

//     let keypair = sodium.crypto_kx_keypair();

//     conn.setKeypair(keypair);

//     let headers = [

//       new Header( edge_protocol.header_id.ConnId, {
//         headerType: edge_protocol.header_type.IntType,
//         headerData: conn.getId()
//       }),

//       new Header( edge_protocol.header_id.SeqHeader, { 
//         headerType: edge_protocol.header_type.IntType, 
//         headerData: sequence 
//       }),

//       new Header( edge_protocol.header_id.PublicKey, { 
//         headerType: edge_protocol.header_type.Uint8ArrayType, 
//         headerData: keypair.publicKey
//       })

//     ];

//     conn.setState(edge_protocol.conn_state.Connecting);

//     self.logger.debug('about to send Connect to Edge Router [%s] for conn[%d]', conn.getChannel().getEdgeRouterHost(), conn.getId());

//     self.sendMessage( edge_protocol.content_type.Connect, headers, self._options.network_session_token, { 
//         conn: conn,
//         sequence: sequence,
//         listener: self._recvConnectResponse,
//       } 
//     );

//     release();

//     resolve();

//   });

// }


// /**
//  * Receives response from Edge 'Connect' message.
//  * 
//  */
// ZitiContext.prototype._recvConnectResponse = async function(msg) {

//   let buffer = await msg.arrayBuffer();
//   let contentTypeView = new Int32Array(buffer, 4, 1);
//   let contentType = contentTypeView[0];
//   let sequenceView = new Int32Array(buffer, 8, 1);
//   let sequence = sequenceView[0];
//   let connId = await this._messageGetConnId(msg);
//   let ch = this._getChannelForConnId(connId);
//   let conn = ch.getConnection(connId);
//   throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );

//   this.logger.debug("ConnectResponse contentType[%d] sequence[%d] received for conn[%d]", contentType, sequence, conn.getId());

//   switch (contentType) {

//     case edge_protocol.content_type.StateClosed:

//       this.logger.warn("conn[%d] failed to connect", conn.getId());
//       conn.setState(edge_protocol.conn_state.Closed);
//       break;

//     case edge_protocol.content_type.StateConnected:

//       if (conn.getState() == edge_protocol.conn_state.Connecting) {
//         this.logger.debug("conn[%d] connected", conn.getId());

//         await this._establish_crypto(conn, msg);
//         this.logger.debug("establish_crypto completed for conn[%d]", conn.getId());

//         await this._send_crypto_header(conn);
//         this.logger.debug("send_crypto_header completed for conn[%d]", conn.getId());

//         conn.setState(edge_protocol.conn_state.Connected);
//       }

//       else if (conn.getState() == edge_protocol.conn_state.Closed || conn.getState() == edge_protocol.conn_state.Timedout) {
//         this.logger.warn("received connect reply for closed/timedout conne[%d]", conn.getId());
//         // ziti_disconnect(conn);
//       }
//       break;

//     default:
//       ziti.context.logger.error("unexpected content_type[%d] conn[%d]", contentType, conn.getId());
//       // ziti_disconnect(conn);
//   }

// }


/**
 * 
 */
// ZitiContext.prototype._establish_crypto = function(iconn, msg) {

//   this.logger.debug("_establish_crypto(): entered for conn[%d]", conn.getId());

//   let result = await this._messageGetBytesHeader(msg, edge_protocol.header_id.PublicKey);
//   let peerKey = result.data;
//   this.logger.debug("_establish_crypto(): peerKey is: ", peerKey);

//   if (peerKey == undefined) {
//     this.logger.debug("_establish_crypto(): did not receive peer key. connection[%d] will not be encrypted: ", conn.getConnId());
//     conn.setEncrypted(false);
//     return;
//   }

//   if (conn.getState() == edge_protocol.conn_state.Connecting) {

//     let keypair = conn.getKeypair();

//     let results = sodium.crypto_kx_client_session_keys(keypair.publicKey, keypair.privateKey, peerKey);

//     conn.setSharedRx(results.sharedRx);
//     conn.setSharedTx(results.sharedTx);

//   } else {
//     this.logger.error("_establish_crypto(): cannot establish crypto while connection is in %d state: ", conn.getState());
//   }

// }


/**
 * Receives response from Edge 'Data' message where we sent the Crypto header.
 * 
 */
// ZitiContext.prototype._recvCryptoResponse = function(msg) {

//   let connId = await this._messageGetConnId(msg);
//   this.logger.debug("_recvCryptoResponse(): entered for conn[%d]", connId);
//   let ch = this._getChannelForConnId(connId);
//   let conn = ch.getConnection(connId);
//   throwIf(isUndefined(conn), formatMessage('Conn not found. Seeking connId { actual }', { actual: connId}) );

//   //
//   let buffer = await msg.arrayBuffer();
//   let headersLengthView = new Int32Array(buffer, 12, 1);
//   let headersLength = headersLengthView[0];
//   var bodyView = new Uint8Array(buffer, 20 + headersLength);

//   let state_in = sodium.crypto_secretstream_xchacha20poly1305_init_pull(bodyView, conn.getSharedRx());
  
//   conn.setCrypt_i(state_in);

//   // Indicate that subsequent sends on this connection should be encrypted
//   conn.setEncrypted(true);

//   // Unblock writes to the connection now that we have sent the crypto header
//   conn.setCryptoEstablishComplete(true);
// }


/**
 * 
 */
// ZitiContext.prototype._send_crypto_header = function(conn) {

//   this.logger.debug("_send_crypto_header(): entered for conn[%d]", conn.getId());

//   let results = sodium.crypto_secretstream_xchacha20poly1305_init_push( conn.getSharedTx() );

//   conn.setCrypt_o(results);

//   let sequence = conn.getAndIncrementSequence();

//   let headers = [

//     new Header( edge_protocol.header_id.ConnId, {
//       headerType: edge_protocol.header_type.IntType,
//       headerData: conn.getConnId()
//     }),

//     new Header( edge_protocol.header_id.SeqHeader, { 
//       headerType: edge_protocol.header_type.IntType, 
//       headerData: sequence 
//     })

//   ];    

//   ziti.context.logger.debug("_send_crypto_header(): sending Data [%o]", conn.getCrypt_o().header);

//   let p = this.sendMessage( edge_protocol.content_type.Data, headers, conn.getCrypt_o().header,
//     {
//       conn: conn,
//       sequence: sequence,
//       listener: this._recvCryptoResponse,
//     }
//   );

//   ziti.context.logger.debug("_send_crypto_header(): Data has been sent");

//   return p;

// }


ZitiContext.prototype._getChannelForConnId = function(id) {
  let ch = find(this._channels, function(ch) {
    return (!isUndefined( ch._connections._getConnection(id) ));
  });
  return ch;
}


// /**
//  * 
//  */
// ZitiContext.prototype._findHeader = async function(msg, headerToFind) {

//   let buffer = await msg.arrayBuffer();

//   var headersView = new Int32Array(buffer, 12, 1);

//   let headersLength = headersView[0];
//   let headersOffset = 16 + 4;
//   let ndx = 0;

//   let view = new DataView(buffer);

//   for ( ; ndx < headersLength; ) {

//     var _headerId = view.getInt32(headersOffset + ndx, true);
//     ndx += 4;

//     var _headerDataLength = view.getInt32(headersOffset + ndx, true);
//     ndx += 4;

//     var _headerData = new Uint8Array(buffer, headersOffset + ndx, _headerDataLength);
//     ndx += _headerDataLength;

//     if (_headerId == headerToFind) {

//       let result = {
//         dataLength: _headerDataLength,
//         data:       _headerData,
//       };

//       return result;
//     }
//   }

//   return undefined;
// }


// /**
//  * 
//  */
// ZitiContext.prototype._messageGetBytesHeader = async function(msg, headerToFind) {
//   return await this._findHeader(msg, headerToFind);
// }


// /**
//  * 
//  */
// ZitiContext.prototype._messageGetConnId = async function(msg) {

//   let results = await this._findHeader(msg, edge_protocol.header_id.ConnId);
//   throwIf(results == undefined, formatMessage('No ConnId header found'));

//   var length = results.data.length;
//   let buffer = Buffer.from(results.data);
//   var connId = buffer.readUIntLE(0, length);

//   return connId;
// }



/**
 * Determine if the given URL should be routed over Ziti.
 * 
 * @returns {bool}
 */
ZitiContext.prototype.shouldRouteOverZiti = async function(url) {

  let parsedURL = utils.parseURL(url);

  return await this.getServiceNameByHostNameAndPort(parsedURL.hostname, parsedURL.port);
}


/**
 * Return current value of the ztAPI
 *
 * @returns {undefined | string}
 */
ZitiContext.prototype.getZtAPI = function() {
  return this._ztAPI;
}


/**
 * Return current value of the ztAPI
 *
 * @returns {undefined | string}
 */
ZitiContext.prototype.getTimeout = function() {
  return this._timeout;
}


ZitiContext.prototype.getNextChannelId = function() {
  this._channelSeq++;
  return this._channelSeq;
}


ZitiContext.prototype.getNextConnectionId = function() {
  this._connSeq++;
  return this._connSeq;
}


ZitiContext.prototype.getApiSessionToken = function() {
  return this._apiSession.token;
}

ZitiContext.prototype.getControllerVersion = function() {
  return this._controllerVersion;
}

ZitiContext.prototype.getServices = function() {
  return this._services;
}

ZitiContext.prototype.getServiceIdByName = function(name) {
  let service_id = result(find(this._services, function(obj) {
    return obj.name === name;
  }), 'id');
  this.logger.debug('service[%s] has id[%s]', name, service_id);
  return service_id;
}

ZitiContext.prototype.getChannelByEdgeRouter = function(conn, edgeRouterHostName) {

  let ch = this._channels.get(edgeRouterHostName);

  if (!isUndefined(ch)) {

    this.logger.debug('channel [%d] state [%d] found for ingress[%s]', ch.getId(), ch.getState(), edgeRouterHostName);

    if (isEqual( ch.getState(), edge_protocol.conn_state.Connected )) {
      // nop
    }
    else if (isEqual( ch.getState(), edge_protocol.conn_state.Initial ) || isEqual( ch.getState(), edge_protocol.conn_state.Connecting )) {
      this.logger.warn('should we be here? channel [%d] has state [%d]', ch.getId(), ch.getState());
    }
    else {
      this.logger.error('should not be here: channel [%d] has state [%d]', ch.getId(), ch.getState());
    }

    return ch;
  }
 
  // Create a Channel for this Edge Router
  ch = new ZitiChannel({ 
    ctx: this,
    edgeRouterHost: edgeRouterHostName,
    session_token: this._apiSession.token,
    network_session_token: conn.token
  });

  ch.setState(edge_protocol.conn_state.Connecting);

  this.logger.debug('Created channel [%o] ', ch);
  this._channels.set(edgeRouterHostName, ch);
  
  return ch;
}

ZitiContext.prototype.getServiceIdByDNSHostName = function(name) {
  let service_id = result(find(this._services, function(obj) {
    return obj.dns.hostname === name;
  }), 'id');
  return service_id;
}

ZitiContext.prototype.getNetworkSessionByServiceId = async function(serviceID) {
  // if we do NOT have a NetworkSession for this serviceId, create it
  if (!this._network_sessions.has(serviceID)) { 
    let network_session = await this.createNetworkSession(serviceID);
    this.logger.debug('Created network_session [%o] ', network_session);
    this._network_sessions.set(serviceID, network_session);
  }
  return this._network_sessions.get(serviceID);
}

// ZitiContext.prototype.getEdgeByNetworkSession = async function(serviceID, network_session) {

//   // if we do NOT have an Edge for this network_session, create it
//   if (typeof this._edges != 'Map') {
//     this._edges = new Map();
//   }
//   if (!this._edges.has(network_session.id)) { 
//     let edge = this.getZitiEdge(network_session);
//     console.log('Created Edge: ', edge);
//     this._edges.set(network_session.id, edge);

//     // Open websocket to Edge Router
//     await edge.open();
  
//     // Perform Hello handshake with Edge Router
//     await edge.hello();         

//     // Perform connect with Edge Router (creates Fabric session)
//     let conn = await edge.connect();       
//     console.log('Created Edge Connection: ', conn);
//   }
//   return this._edges.get(network_session.id);
// }

ZitiContext.prototype.createNetworkSession = async function(id) {

  res = await this._controllerClient.createSession({
    body: { 
      serviceId: id
     },
     headers: { 
      'zt-session': this._apiSession.token,
      'Content-Type': 'application/json'
    }
  });
  // let res = await fetch(`${this._ztAPI}/sessions`, { 
  //   method: 'post',
  //   headers: { 
  //     'zt-session': this._apiSession.token,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({ serviceId: id })
  // });
  // let json = await res.json();
  let network_session = res.data;

  return network_session;
}

ZitiContext.prototype.getEdgeRouter = function(networkSession) {
  let item = find(networkSession.edgeRouters, function(o) { return has(o, 'urls.wss'); });
  if (isUndefined(item)) {
    throw new Error(
      'Specified networkSession does not contain a wss-enabled Edge Router'
    );
  }
  let hostparts = item.hostname.split(':');
  let hostname = hostparts[0];
  let hostport = toNumber(hostparts[1]);
  return hostname+':'+hostport;
}

/**
 * send the HELLO msg to the Edge Router.
 */
ZitiContext.prototype.sendHello = function() {

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
  bytes.writeUInt32LE(zitiContext._sequence, 0);
  view_message_section.set(
    bytes, 
    8 // Offset 8
  );

  // Build the header
  let sessionTokenLength = Buffer.byteLength(this._apiSession.token, 'utf8');
  bytes = new Buffer(
     4
    +4
  );
  bytes.writeUInt32LE(edge_protocol.header_id.SessionToken, 0);
  bytes.writeUInt32LE(sessionTokenLength, 4);
  let session_token_bytes = utils.toUTF8Array(this._apiSession.token);
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
  this._websocket.send(view_combined.buffer);  


}

/**
 * When the 'onopen' event comes in for a websocket, it means that we have successfully connected with the Edge Router.
 * The next step is to send the HELLO msg to the Edge Router.
 */
ZitiContext.prototype.websocket_OnOpen = async function() {
  zitiContext.sendHello();
}

ZitiContext.prototype.setWebsocket = function(websocket) {
  this._websocket = websocket;

  this._websocket.onopen = this.websocket_OnOpen;

}

ZitiContext.prototype.getWebsocket = function() {
  return this._websocket;
}


// ZitiContext.prototype.getZitiEdge = function( network_session, options = {} ) {

//   if (isUndefined(this._edge)) {

//     let _options = flatOptions(options, defaultOptions);

//     this._edge = new ZitiEdge(this.getEdgeRouter(network_session), merge(_options, { session_token: this._apiSession.token, network_session_token: network_session.token } ) );
  
//   }

//   return this._edge;
// }

