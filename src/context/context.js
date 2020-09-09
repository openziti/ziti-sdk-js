/**
 * Module dependencies.
 */

const flatOptions = require('flat-options');
const MicroModal = require('micromodal');
const consola = require('consola');
const find = require('lodash.find');
const isUndefined = require('lodash.isundefined');
const merge = require('lodash.merge');
const result = require('lodash.result');
const has = require('lodash.has');
const toNumber = require('lodash.tonumber');

const utils = require('../utils/utils');
const ls = require('../utils/localstorage');
const edge_protocol = require('../edge/protocol');
const ZitiEdge = require('../edge/edge');
const defaultOptions = require('./options');
const identityModalCSS = require('../ui/identity_modal/css');
const identityModalHTML = require('../ui/identity_modal/html');
const identityModalSelect = require('../ui/identity_modal/select');
const identityModalDragDrop = require('../ui/identity_modal/dragdrop');
const zitiConstants = require('../constants');
const ZitiReporter = require('../utils/ziti-reporter');


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

  this._network_sessions = new Map();
  this._connections = new Map();
  this._edges = new Map();
  this._connSeq = 0;

  try {

    let res = await fetch(`${this._ztAPI}/version`);
    let json = await res.json();
    this._controllerVersion = json.data.version;

    res = await fetch(`${this._ztAPI}/authenticate?method=cert`, { 
      method: 'post', 
      headers: { 
        'Content-Type': 'application/json'
      }, 
      body: JSON.stringify({  })
    });

    json = await res.json();
    this._apiSession = json.data;

    res = await fetch(`${this._ztAPI}/services?limit=100`, { headers: { 'zt-session': this._apiSession.token }} );
    json = await res.json();
    this._services = json.data;

    this._sequence = 0;

  } catch (err) {
    this.logger.error(err);
  }

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
  return service_id;
}

ZitiContext.prototype.getServiceIdByDNSHostName = function(name) {
  let service_id = result(find(this._services, function(obj) {
    return obj.dns.hostname === name;
  }), 'id');
  return service_id;
}

ZitiContext.prototype.getNetworkSessionByServiceId = async function(serviceID) {

  // if we do NOT have a NetworkSession for this serviceId, create it
  if (typeof this._network_sessions != 'Map') {
    this._network_sessions = new Map();
  }
  if (!this._network_sessions.has(serviceID)) { 
    let network_session = await this.createNetworkSession(serviceID);
    console.log('Created network_session: ', network_session.id);
    this._network_sessions.set(serviceID, network_session);
  }
  return this._network_sessions.get(serviceID);
}

ZitiContext.prototype.getEdgeByNetworkSession = async function(serviceID, network_session) {

  // if we do NOT have an Edge for this network_session, create it
  if (typeof this._edges != 'Map') {
    this._edges = new Map();
  }
  if (!this._edges.has(network_session.id)) { 
    let edge = this.getZitiEdge(network_session);
    console.log('Created Edge: ', edge);
    this._edges.set(network_session.id, edge);

    // Open websocket to Edge Router
    await edge.open();
  
    // Perform Hello handshake with Edge Router
    await edge.hello();         

    // Perform connect with Edge Router (creates Fabric session)
    let conn = await edge.connect();       
    console.log('Created Edge Connection: ', conn);
  }
  return this._edges.get(network_session.id);
}

ZitiContext.prototype.createNetworkSession = async function(id) {
  let res = await fetch(`${this._ztAPI}/sessions`, { 
    method: 'post',
    headers: { 
      'zt-session': this._apiSession.token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ serviceId: id })
  });
  let json = await res.json();
  let network_session = json.data;

  return network_session;
}

ZitiContext.prototype.getGatewayHost = function(network_session) {
  let item = find(network_session.edgeRouters, function(o) { return has(o, 'urls.wss'); });
  if (isUndefined(item)) {
    throw new Error(
      'Specified network_session does not contain a wss-enabled gateway'
    );
  }
  let hostparts = item.hostname.split(':');
  let hostname = hostparts[0];
  let hostport = toNumber(hostparts[1]);
  return hostname+':'+hostport;
}

/**
 * send the HELLO msg to the gateway.
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
 * When the 'onopen' event comes in for a websocket, it means that we have successfully connected with the Gateway.
 * The next step is to send the HELLO msg to the gateway.
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


ZitiContext.prototype.getZitiEdge = function( network_session, options = {} ) {

  let _options = flatOptions(options, defaultOptions);

  this._edge = new ZitiEdge(this.getGatewayHost(network_session), merge(_options, { session_token: this._apiSession.token, network_session_token: network_session.token } ) );

  return this._edge;
}

