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

const flatOptions           = require('flat-options');
const MicroModal            = require('micromodal');
const consola               = require('consola');
const find                  = require('lodash.find');
const filter                = require('lodash.filter');
const isEqual               = require('lodash.isequal');
const minby                 = require('lodash.minby');
const forEach               = require('lodash.foreach');
const isUndefined           = require('lodash.isundefined');
const result                = require('lodash.result');
const has                   = require('lodash.has');
const toNumber              = require('lodash.tonumber');
const Mutex                 = require('async-mutex');
const formatMessage         = require('format-message');

const utils                 = require('../utils/utils');
const ls                    = require('../utils/localstorage');
const edge_protocol         = require('../channel/protocol');
const defaultOptions        = require('./options');
const identityModalCSS      = require('../ui/identity_modal/css');
const identityModalHTML     = require('../ui/identity_modal/html');
const identityModalSelect   = require('../ui/identity_modal/select');
const identityModalDragDrop = require('../ui/identity_modal/dragdrop');
const zitiConstants         = require('../constants');
const ZitiReporter          = require('../utils/ziti-reporter');
const ZitiControllerWSClient  = require('./controller-ws-client');
const ZitiControllerClient  = require('./controller-client');
const ZitiChannel           = require('../channel/channel');
const {throwIf}             = require('../utils/throwif');


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
  this._channelSeq = 0;
  this._connSeq = 0;

  this._mutex = new Mutex.Mutex();
  this._connectMutex = new Mutex.Mutex();


  /*
   *  Start WS client stuff...
   */

  this._controllerWSClient = new ZitiControllerWSClient({
    ctx: this,
    domain: this._ztAPI,
    logger: this.logger
  });

  await this._controllerWSClient.connect();

  // Get Controller version info
  // let res = await this._controllerWSClient.listVersion();
  // let ver = Buffer.from(res).toString()
  // this._controllerVersion = res.data;
  // this.logger.debug('Controller Version: [%o]', this._controllerVersion);
  
  // Get an API session with Controller
  res = await this._controllerWSClient.authenticate({
    method: 'cert',
    body: { 
      configTypes: [
        'ziti-tunneler-client.v1'
      ]
    }
  });
  res = JSON.parse(Buffer.from(res).toString());
  this._apiSession = res.data;
  this.logger.debug('Controller API Session established: [%o]', this._apiSession);

  // Set the token header on behalf of all subsequent Controller API calls
  this._controllerWSClient.setApiKey(this._apiSession.token, 'zt-session', false);

  
  // res = await this._controllerWSClient.listServices({ 
  //   limit: '100' 
  // });
  // let resStr = Buffer.from(res).toString();
  // // res = JSON.parse(Buffer.from(res).toString());
  // res = JSON.parse(resStr);
  // this._services = res.data;
  // this.logger.debug('List of available Services acquired: [%o]', this._services);




  // this._controllerClient = new ZitiControllerClient({
  //   domain: this._ztAPI,
  //   logger: this.logger
  // });

  // try {

  //   // Get Controller version info
  //   let res = await this._controllerClient.listVersion();
  //   this._controllerVersion = res.data;
  //   this.logger.debug('Controller Version: [%o]', this._controllerVersion);

  //   // Get an API session with Controller
  //   res = await this._controllerClient.authenticate({
  //     method: 'cert',
  //     body: { 
  //       configTypes: [
  //         'ziti-tunneler-client.v1'
  //       ]
  //      }
  //   });
  //   this._apiSession = res.data;
  //   this.logger.debug('Controller API Session established: [%o]', this._apiSession);

  //   // Set the token header on behalf of all subsequent Controller API calls
  //   this._controllerClient.setApiKey(this._apiSession.token, 'zt-session', false);

  //   this._sequence = 0;

  // } catch (err) {
  //   this.logger.error(err);
  // }

}


ZitiContext.prototype.fetchServices = async function() {
  // Get list of active Services from Controller
  // res = await this._controllerClient.listServices({ limit: '100' });
  // this._services = res.data;
  // this.logger.debug('List of available Services acquired: [%o]', this._services);

  res = await this._controllerWSClient.listServices({ 
    limit: '100' 
  });
  res = JSON.parse(Buffer.from(res).toString());
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
 * @param {Array} edgeRouters
 * @returns {Promise}
 */
ZitiContext.prototype._getPendingChannelConnects = async function(conn, edgeRouters) {

  return new Promise( async (resolve) => {

    let pendingChannelConnects = new Array();

    let self = this;

    // Get a channel connection to each of the Edge Routers that have a WS binding, initiating a connection if channel is not yet connected
    edgeRouters.forEach(async function(edgeRouter, idx, array) {
      let ch = await self.getChannelByEdgeRouter(conn, edgeRouter);
      self.logger.debug('initiating Hello to [%s] for session[%s]', edgeRouter.urls.ws, conn.token);  
      pendingChannelConnects.push( 
        ch.hello() 
      );

      if (idx === array.length - 1) {
        resolve(pendingChannelConnects);  // Return to caller only after we have processed all edge routers
      }
    });
  });
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

  // Get list of all Edge Router URLs where the Edge Router has a WS binding
  let edgeRouters = filter(networkSession.edgeRouters, function(o) { return has(o, 'urls.ws'); });

  // Something is wrong if we have no ws-enabled edge routers
  throwIf(isEqual(edgeRouters.length, 0), formatMessage('No Edge Routers with ws: binding were found.', { }) );

  //
  const release = await this._connectMutex.acquire();

  let pendingChannelConnects = await this._getPendingChannelConnects(conn, edgeRouters);
  this.logger.debug('pendingChannelConnects [%o]', pendingChannelConnects);  

  let channelConnects = await Promise.all( pendingChannelConnects );
  this.logger.debug('channelConnects [%o]', channelConnects);  

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

  if (conn.getEncrypted()) {  // if connected to a service that has 'encryptionRequired'
    // Do not proceed until crypto handshake has completed
    await channelWithNearestEdgeRouter.awaitConnectionCryptoEstablishComplete(conn);
  }

  release();

}


/**
 * Connect specified ZitiConnection to the nearest Edge Router.
 * 
 * @param {ZitiConnection} conn
 * @returns {bool}
 */
ZitiContext.prototype.close = async function(conn) {

  let ch = conn.getChannel();

  await ch.close(conn);

  ch._connections._deleteConnection(conn);

}



ZitiContext.prototype._getChannelForConnId = function(id) {
  let ch = find(this._channels, function(ch) {
    return (!isUndefined( ch._connections._getConnection(id) ));
  });
  return ch;
}


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

ZitiContext.prototype.getServiceEncryptionRequiredByName = function(name) {
  let encryptionRequired = result(find(this._services, function(obj) {
    return obj.name === name;
  }), 'encryptionRequired');
  this.logger.debug('service[%s] has encryptionRequired[%o]', name, encryptionRequired);
  return encryptionRequired;
}


/**
 * Remain in lazy-sleepy loop until specified channel is connected.
 * 
 * @param {*} conn 
 */
ZitiContext.prototype.awaitControllerChannelConnectComplete = function(ch) {
  return new Promise((resolve) => {
    (function waitForControllerChannelConnectComplete() {
      if (isEqual( ch.getState(), edge_protocol.conn_state.Initial ) || isEqual( ch.getState(), edge_protocol.conn_state.Connecting )) {
        ch._ctx.logger.trace('waitForControllerChannelConnectComplete() ch[%d] still not yet connected', ch.getId());
        setTimeout(waitForControllerChannelConnectComplete, 100);  
      } else {
        ch._ctx.logger.trace('controller ch[%d] is connected', ch.getId());
        return resolve();
      }
    })();
  });
}

ZitiContext.prototype.getControllerChannel = function() {

  return new Promise( async (resolve) => {

    let ch = this._channels.get(edgeRouter.hostname);

    if (!isUndefined(ch)) {

      this.logger.debug('ch[%d] state[%d] found for ingress[%s]', ch.getId(), ch.getState(), edgeRouter.hostname);

      await this.awaitChannelConnectComplete(ch);

      if (!isEqual( ch.getState(), edge_protocol.conn_state.Connected )) {
        this.logger.error('should not be here: ch[%d] has state[%d]', ch.getId(), ch.getState());
      }

      resolve(ch);
      return;
    }
  
    // Create a Channel for this Edge Router
    ch = new ZitiChannel({ 
      ctx: this,
      edgeRouter: edgeRouter,
      session_token: this._apiSession.token,
      network_session_token: conn.token
    });

    ch.setState(edge_protocol.conn_state.Connecting);

    this.logger.debug('Created ch[%o] ', ch);
    this._channels.set(edgeRouter.hostname, ch);
    
    resolve(ch);
  });
}


/**
 * Remain in lazy-sleepy loop until specified channel is connected.
 * 
 * @param {*} conn 
 */
ZitiContext.prototype.awaitChannelConnectComplete = function(ch) {
  return new Promise((resolve) => {
    (function waitForChannelConnectComplete() {
      if (isEqual( ch.getState(), edge_protocol.conn_state.Initial ) || isEqual( ch.getState(), edge_protocol.conn_state.Connecting )) {
        ch._ctx.logger.trace('awaitChannelConnectComplete() ch[%d] still not yet connected', ch.getId());
        setTimeout(waitForChannelConnectComplete, 100);  
      } else {
        ch._ctx.logger.trace('ch[%d] is connected', ch.getId());
        return resolve();
      }
    })();
  });
}

ZitiContext.prototype.getChannelByEdgeRouter = function(conn, edgeRouter) {

  return new Promise( async (resolve) => {

    let ch = this._channels.get(edgeRouter.hostname);

    if (!isUndefined(ch)) {

      this.logger.debug('ch[%d] state[%d] found for ingress[%s]', ch.getId(), ch.getState(), edgeRouter.hostname);

      await this.awaitChannelConnectComplete(ch);

      if (!isEqual( ch.getState(), edge_protocol.conn_state.Connected )) {
        this.logger.error('should not be here: ch[%d] has state[%d]', ch.getId(), ch.getState());
      }

      resolve(ch);
      return;
    }
  
    // Create a Channel for this Edge Router
    ch = new ZitiChannel({ 
      ctx: this,
      edgeRouter: edgeRouter,
      session_token: this._apiSession.token,
      network_session_token: conn.token
    });

    ch.setState(edge_protocol.conn_state.Connecting);

    this.logger.debug('Created ch[%o] ', ch);
    this._channels.set(edgeRouter.hostname, ch);
    
    resolve(ch);
  });
}


ZitiContext.prototype.closeChannelByEdgeRouter = function( edgeRouter ) {
  this._channels.delete( edgeRouter );  
}


ZitiContext.prototype.getServiceIdByDNSHostName = function(name) {
  let service_id = result(find(this._services, function(obj) {
    return obj.dns.hostname === name;
  }), 'id');
  return service_id;
}


ZitiContext.prototype.getNetworkSessionByServiceId = async function(serviceID) {
  // if we do NOT have a NetworkSession for this serviceId, create it
  const release = await this._mutex.acquire();
  if (!this._network_sessions.has(serviceID)) { 
    let network_session = await this.createNetworkSession(serviceID);
    this.logger.debug('Created network_session [%o] ', network_session);
    this._network_sessions.set(serviceID, network_session);
  }
  release();
  return this._network_sessions.get(serviceID);
}


ZitiContext.prototype.createNetworkSession = async function(id) {

  res = await this._controllerWSClient.createSession({
    body: { 
      serviceId: id
     },
     headers: { 
      'zt-session': this._apiSession.token,
      'Content-Type': 'application/json'
    }
  });
  res = JSON.parse(Buffer.from(res).toString());
  let network_session = res.data;

  return network_session;
}
