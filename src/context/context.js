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
const consola               = require('consola');
const find                  = require('lodash.find');
const filter                = require('lodash.filter');
const isEqual               = require('lodash.isequal');
const isNull                = require('lodash.isnull');
const minby                 = require('lodash.minby');
const forEach               = require('lodash.foreach');
const isUndefined           = require('lodash.isundefined');
const result                = require('lodash.result');
const has                   = require('lodash.has');
const Mutex                 = require('async-mutex');
const formatMessage         = require('format-message');

let MicroModal
if (!zitiConfig.serviceWorker.active) {
  MicroModal                = require('micromodal');
}

const utils                 = require('../utils/utils');
const ls                    = require('../utils/localstorage');
const edge_protocol         = require('../channel/protocol');
const defaultOptions        = require('./options');
const zitiConstants         = require('../constants');
const ZitiReporter          = require('../utils/ziti-reporter');
const ZitiControllerClient  = require('../context/controller-client');
const ZitiControllerWSClient  = require('./controller-ws-client');
const ZitiChannel           = require('../channel/channel');
const {throwIf}             = require('../utils/throwif');

let ZitiEnroller
if (!zitiConfig.serviceWorker.active) {
  ZitiEnroller              = require('../enroll/enroller');
}


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
 * Load the Identity.
 *
 */
ZitiContext.prototype.loadAPISessionToken = async function(self) {

  return new Promise( async (resolve, reject) => {

    self.logger.debug('loadAPISessionToken() starting');

    let apisess = await ls.getWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN);

    self.logger.debug('loadAPISessionToken() ZITI_API_SESSION_TOKEN is: [%o]', apisess);

    if (!isNull(apisess)) {
      self._apiSession = apisess;

      // Set the token header on behalf of all subsequent Controller API calls
      self._controllerClient.setApiKey(self._apiSession.token, 'zt-session', false);
    }

    resolve();
  });
}


ZitiContext.prototype.haveRequiredVariables = function(self) {
  if (
    // isNull( self._ztAPI ) ||
    // isNull( self._ztWSAPI ) || isUndefined( self._ztWSAPI ) ||
    isNull( self._IDENTITY_CERT ) || isUndefined( self._IDENTITY_CERT ) ||
    isNull( self._IDENTITY_KEY )  || isUndefined( self._IDENTITY_KEY )
    // ||
    // isNull( self._IDENTITY_CA ) 
  ) {
    return false;
  } else {
    return true;
  }
}

/**
 * Load the Identity.
 *
 */
ZitiContext.prototype.loadIdentity = async function(self) {

  return new Promise( async (resolve, reject) => {

    self.logger.debug('loadIdentity() starting');

    // Load Identity variables from storage
    // self._ztWSAPI       = await ls.getWithExpiry(zitiConstants.get().ZITI_CONTROLLER_WS);
    self._IDENTITY_CERT = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);
    self._IDENTITY_KEY  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);
    // self._IDENTITY_CA   = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CA);

    await self.loadAPISessionToken(self);

    // let apisess = await ls.getWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN);
    // if (!isNull(apisess)) {
    //   self._apiSession = apisess;

    //   // Set the token header on behalf of all subsequent Controller API calls
    //   self._controllerClient.setApiKey(self._apiSession.token, 'zt-session', false);
    // }

    // If Identity absent/expired...
    if (! self.haveRequiredVariables(self) ) {
      // ...then we need to enroll
      let enroller = new ZitiEnroller(ZitiEnroller.prototype);
      enroller.init({ctx: self, logger: self.logger});
      await enroller.enroll().catch((e) => {
        self.logger.error('Enrollment failed: [%o]', e);
        localStorage.removeItem(zitiConstants.get().ZITI_JWT);
        return reject('Enrollment failed');
      });

      // Now that enrollment completed successfully, reload Identity
      // self._ztWSAPI       = await ls.getWithExpiry(zitiConstants.get().ZITI_CONTROLLER_WS);
      self._IDENTITY_CERT = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);
      self._IDENTITY_KEY  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);
      // self._IDENTITY_CA   = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CA);
    }

    resolve();

  });
}


/**
 * Return a Promise that will resolve as soon as we have the location of the Ziti Controller.
 *
 * @returns {Promise}   
 */
ZitiContext.prototype._awaitIdentityLoadComplete = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    self.logger.debug('awaitIdentityLoadComplete() starting');

    await this.loadIdentity(self).catch((e) => {
      return reject(e);
    });
  
    let startTime = new Date();
    (function waitForIdentityLoadComplete() {
      if (self.haveRequiredVariables(self)) {
        // self._ztAPI = await ls.getWithExpiry(zitiConstants.get().ZITI_CONTROLLER);
        // if (self._ztAPI) {
          if (self._modalIsOpen) {
            MicroModal.close('ziti-updb-modal');
            self._modalIsOpen = false;
          }
          return resolve(self._ztAPI);
        // }
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

ZitiContext.prototype._awaitIdentityLoadCompleteFromServiceWorker = async function() {

  let self = this;

  console.log('_awaitIdentityLoadCompleteFromServiceWorker() entered');

  self.logger.debug('_awaitIdentityLoadCompleteFromServiceWorker() entered');

  return new Promise((resolve, reject) => {
    let startTime = new Date();
    (function waitForIdentityLoadComplete() {
      if (self.haveRequiredVariables(self)) {
        console.log('_awaitIdentityLoadCompleteFromServiceWorker() resolving with: ', self._ztAPI);
        self.logger.debug('_awaitIdentityLoadCompleteFromServiceWorker() resolving with: [%s]', self._ztAPI);
        resolve(self._ztAPI);
        return
      }
      self.logger.debug('_awaitIdentityLoadCompleteFromServiceWorker() identity still not loaded');
      let now = new Date();
      let elapsed = now.getTime() - startTime.getTime();
      if (elapsed > 1000*60) {
        self.logger.error('_awaitIdentityLoadCompleteFromServiceWorker() identity never acquired');
        return reject();
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

  let self = this;

  return new Promise( async (resolve, reject) => {

    let _options = flatOptions(options, defaultOptions);

    self.logger = consola.create({
      level: _options.logLevel,
      reporters: [
        new ZitiReporter()
      ],
      defaults: {
        additionalColor: 'white'
      }
    });
    self.logger.wrapConsole();

    let domain
    if (typeof window === 'undefined') {
      domain = zitiConfig.controller.api;         // We're on service worker side
    } else {
      domain = window.zitiConfig.controller.api;  // We're on (normal) browser side
    }
    self._controllerClient = new ZitiControllerClient({
      domain: domain,
      logger: self.logger
    });

    // // Get Controller version info
    // let res = await self._controllerClient.listVersion();
    // self._controllerVersion = res.data;
    // self.logger.info('Controller Version: [%o]', self._controllerVersion);

    //
    if (typeof window === 'undefined') {
      // We're on service worker side
      await self._awaitIdentityLoadCompleteFromServiceWorker().catch((err) => {
        return;
      });  
    } else {
      // We're on (normal) browser side
      await self._awaitIdentityLoadComplete().catch((err) => {
        return;
      });  
    }

    self._timeout = zitiConstants.get().ZITI_DEFAULT_TIMEOUT;

    self._network_sessions = new Map();
    self._services = new Map();
    self._channels = new Map();
    self._channelSeq = 0;
    self._connSeq = 0;

    self._mutex = new Mutex.Mutex();
    self._connectMutex = new Mutex.Mutex();

    let services = await ls.getWithExpiry(zitiConstants.get().ZITI_SERVICES);
    if (!isNull(services)) {
      self._services = services;
    }

    /*
    *  Start WS client stuff...
    */

    // this._controllerWSClient = new ZitiControllerWSClient({
    //   ctx: this,
    //   domain: this._ztWSAPI,
    //   logger: this.logger
    // });

    // await this._controllerWSClient.connect();
    
    // // Get an API session with Controller
    // res = await this._controllerClient.authenticate({
    //   method: 'cert',
    //   body: { 
    //     configTypes: [
    //       'ziti-tunneler-client.v1'
    //     ]
    //   }
    // });
    // res = JSON.parse(Buffer.from(res).toString());
    // if (!isUndefined(res.error)) {
    //   this.logger.error(res.error.message);
    //   if (res.error.code == 'INVALID_AUTH') { // if the Identity we have has expired or been revoked
    //     localStorage.removeItem( zitiConstants.get().ZITI_IDENTITY_CERT ); // then purge it
    //   }
    //   reject(res.error.message);
    //   return;
    // }
    // this._apiSession = res.data;
    // this.logger.debug('Controller API Session established: [%o]', this._apiSession);

    // // Set the token header on behalf of all subsequent Controller API calls
    // this._controllerClient.setApiKey(this._apiSession.token, 'zt-session', false);

    resolve();
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
ZitiContext.prototype.initFromServiceWorker = async function(options) {

  let self = this;

  return new Promise( async (resolve, reject) => {

    let _options = flatOptions(options, defaultOptions);

    self.logger = consola.create({
      level: _options.logLevel,
      reporters: [
        new ZitiReporter()
      ],
      defaults: {
        additionalColor: 'white'
      }
    })

    let domain = zitiConfig.controller.api;
    
    self._controllerClient = new ZitiControllerClient({
      domain: domain,
      logger: self.logger
    });

    // // Get Controller version info
    // let res = await self._controllerClient.listVersion();
    // self._controllerVersion = res.data;
    // self.logger.info('Controller Version: [%o]', self._controllerVersion);

    self._timeout = zitiConstants.get().ZITI_DEFAULT_TIMEOUT;

    self._network_sessions = new Map();
    self._services = new Map();
    self._channels = new Map();
    self._channelSeq = 0;
    self._connSeq = 0;

    self._mutex = new Mutex.Mutex();
    self._connectMutex = new Mutex.Mutex();

    await self.loadAPISessionToken(self);

    let services = await ls.getWithExpiry(zitiConstants.get().ZITI_SERVICES);
    if (!isNull(services)) {
      self._services = services;
    }

    resolve();
  });
}


ZitiContext.prototype.fetchServices = async function() {
  
  let self = this;

  return new Promise( async (resolve, reject) => {

    // 
    let apiSessionToken = await ls.getWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN);
    if (!isNull(apiSessionToken)) {
      self._controllerClient.setApiKey(apiSessionToken.token, 'zt-session', false);
    }

    // Get list of active Services from Controller
    res = await self._controllerClient.listServices({ 
      limit: '100' 
    });
    if (!isUndefined(res.error)) {
      self.logger.error(res.error);
      return reject(res.error);
    }
    self._services = res.data;
    self.logger.debug('List of available Services acquired: [%o]', self._services);

    await ls.setWithExpiry(zitiConstants.get().ZITI_SERVICES, self._services, await ls.getWithExpiry(zitiConstants.get().ZITI_EXPIRY_TIME) );

    resolve();

  });
}


ZitiContext.prototype.getServiceNameByHostNameAndPort = async function(hostname, port) {

  let self = this;

  return new Promise( async (resolve, reject) => {

    if (typeof port === 'string') {
      port = parseInt(port, 10);
    }

    const release = await self._mutex.acquire();
    if (isEqual( self.getServices().size, 0 )) {
      await self.fetchServices().catch((error) => {
        release();
        return reject(error);
      });
    }
    release();

    let serviceName = result(find(self._services, function(obj) {
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

    resolve( serviceName );
  
  });

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

  this.logger.debug('ZitiContext.connect() entered for [%o]', conn);  

  // If we were not given a networkSession, it most likely means something (an API token, Cert, etc) expired,
  // so we need to purge them and re-acquire
  if (isUndefined( networkSession )) {

    localStorage.removeItem(zitiConstants.get().ZITI_API_SESSION_TOKEN);
    localStorage.removeItem(zitiConstants.get().ZITI_IDENTITY_CERT);

    await this._awaitIdentityLoadComplete().catch((err) => {
      return;
    });
  
  }

  conn.token = networkSession.token;

  // Get list of all Edge Router URLs where the Edge Router has a WS binding
  let edgeRouters = filter(networkSession.edgeRouters, function(o) { return has(o, 'urls.ws'); });

  // Something is wrong if we have no ws-enabled edge routers
  throwIf(isEqual(edgeRouters.length, 0), formatMessage('No Edge Routers with ws: binding were found.', { }) );

  //
  this.logger.debug('trying to acquire _connectMutex');  
  const release = await this._connectMutex.acquire();
  this.logger.debug('now own _connectMutex');  

  let pendingChannelConnects = await this._getPendingChannelConnects(conn, edgeRouters);
  this.logger.trace('pendingChannelConnects [%o]', pendingChannelConnects);  

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

  this.logger.debug('releasing _connectMutex');  
  release();

}


/**
 * Close specified ZitiConnection with Edge Router.
 * 
 * @param {ZitiConnection} conn
 * @returns {bool}
 */
ZitiContext.prototype.close = async function(conn) {
  return new Promise( async (resolve, reject) => {
    let ch = conn.getChannel();
    await ch.close(conn);
    ch._connections._deleteConnection(conn);
    resolve();
  });
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
  let parsedURL = new URL(url);

  let hostname = parsedURL.hostname;
  let port = parsedURL.port;

  if (port === '') {
    if ((parsedURL.protocol === 'https:') || (parsedURL.protocol === 'wss:')) {
      port = 443;
    } else {
      port = 80;
    }
  }

  let self = this;

  return new Promise( async (resolve, reject) => {

    let serviceName = await this.getServiceNameByHostNameAndPort(hostname, port).catch(( error ) => {
      return reject( error );
    });

    return resolve( serviceName );

  });

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
 * Return current value of the ztWSAPI
 *
 * @returns {undefined | string}
 */
ZitiContext.prototype.getZtWSAPI = function() {
  return this._ztWSAPI;
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

  let self = this;

  return new Promise( async (resolve, reject) => {

    let network_session;

    const release = await self._mutex.acquire();

    // let network_sessions = await ls.getWithExpiry(zitiConstants.get().ZITI_NETWORK_SESSIONS);
    // debugger

    // if (!isNull(network_sessions) {
    // }

    // if we do NOT have a NetworkSession for this serviceId, create it
    if (!self._network_sessions.has(serviceID)) {
      
      let network_session = await self.createNetworkSession(serviceID).catch((e) => { /* ignore */ });

      // await ls.setWithExpiry(zitiConstants.get().ZITI_NETWORK_SESSIONS, network_session, await ls.getWithExpiry(zitiConstants.get().ZITI_EXPIRY_TIME) );

      if (!isUndefined( network_session )) {

        // await ls.setWithExpiry(zitiConstants.get().ZITI_NETWORK_SESSIONS, network_session, await ls.getWithExpiry(zitiConstants.get().ZITI_EXPIRY_TIME) );

        self.logger.debug('Created network_session [%o] ', network_session);
        self._network_sessions.set(serviceID, network_session);

      }
    
    }
    
    release();

    resolve ( self._network_sessions.get(serviceID) );

  });

}


ZitiContext.prototype.createNetworkSession = async function(id) {

  let self = this;

  return new Promise( async (resolve, reject) => {

    res = await this._controllerClient.createSession({
      body: { 
        serviceId: id
      },
      headers: { 
        // 'zt-session': this._apiSession.token,
        'Content-Type': 'application/json'
      }
    });
    if (!isUndefined(res.error)) {
      self.logger.error(res.error.message);
      return reject(res.error.message);
    }

    let network_session = res.data;

    resolve( network_session );

  });

}
