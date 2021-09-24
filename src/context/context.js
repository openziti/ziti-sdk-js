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
const withTimeout           = require('async-mutex').withTimeout;
const formatMessage         = require('format-message');

let MicroModal
if (!zitiConfig.serviceWorker.active) {
  MicroModal                = require('micromodal');
}

const utils                 = require('../utils/utils');
const ls                    = require('../utils/localstorage');
const edge_protocol         = require('../channel/protocol');
const defaultOptions        = require('./options');
const contextTypes          = require('./contexttypes');
const zitiConstants         = require('../constants');
const ZitiReporter          = require('../utils/ziti-reporter');
const ZitiControllerClient  = require('../context/controller-client');
const ZitiUPDB              = require('../updb/updb');
const ZitiChannel           = require('../channel/channel');
const {throwIf}             = require('../utils/throwif');

let ZitiEnroller
if (!zitiConfig.serviceWorker.active) {
  ZitiEnroller              = require('../enroll/enroller');
}
const pjson                 = require('../../package.json');
const { selectordinal }     = require('format-message');


// const EXPIRE_WINDOW = 28.0 // TEMP, for debugging
const EXPIRE_WINDOW = 2.0

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

    setTimeout(self.apiSessionHeartbeat, (1000 * 60 * 5), self );

    resolve();
  });
}


ZitiContext.prototype.haveRequiredVariables = function(self) {
  if (
    isNull( self._IDENTITY_CERT ) || isUndefined( self._IDENTITY_CERT ) ||
    isNull( self._IDENTITY_KEY )  || isUndefined( self._IDENTITY_KEY )
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
    self._IDENTITY_CERT = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);
    self._IDENTITY_KEY  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);

    // If Identity absent/expired...
    if (! self.haveRequiredVariables(self) ) {
      // ...then we need to enroll

      if (self.contextType == contextTypes.ServiceWorkerType) {
        return reject( 'service worker cannot perform identity load; must be done from client' );
      }

      let enroller = new ZitiEnroller(ZitiEnroller.prototype);
      enroller.init({ctx: self, logger: self.logger});

      await enroller.enroll().catch((e) => {

        self.logger.error('Enrollment failed: [%o]', e);
        ls.removeItem(zitiConstants.get().ZITI_JWT);
        return reject('Enrollment failed');

      });

      self.logger.debug('enroll() completed successfully');

      // Now that enrollment completed successfully, reload Identity
      self._IDENTITY_CERT = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);
      self._IDENTITY_KEY  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);
    }

    return resolve();

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
  
    self.logger.debug('loadIdentity() returned');

    let startTime = new Date();
    (function waitForIdentityLoadComplete() {
      if (self.haveRequiredVariables(self)) {
        if (self._modalIsOpen) {
          MicroModal.close('ziti-updb-modal');
          self._modalIsOpen = false;
        }
        return resolve();
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
 * 
 *
 */
 ZitiContext.prototype.getFreshAPISession = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    self.logger.debug('ctx.getFreshAPISession() entered');

    // Get an API session with Controller
    let res = await self._controllerClient.authenticate({

      method: 'password',

      body: { 

        username: self._loginFormValues.username,
        password: self._loginFormValues.password,

        configTypes: [
          'ziti-tunneler-client.v1'
        ],

        // envInfo: {
          // arch: window.navigator.platform,    // e.g. 'MacIntel'
          // os: window.navigator.appVersion,    // e.g. '5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
        // },
        sdkInfo: {
          // branch: "string",
          // revision: "string",
          type: 'ziti-sdk-js',
          version: pjson.version
        },
      }
    });

    if (!isUndefined(res.error)) {
      self.logger.error(res.error.message);
      return resolve( false );
    }

    self._apiSession = res.data;
    self.logger.debug('ctx.getFreshAPISession(): _apiSession[%o]', self._apiSession);

    // Set the token header on behalf of all subsequent Controller API calls
    self._controllerClient.setApiKey(self._apiSession.token, 'zt-session', false);

    await ls.setWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN, self._apiSession, new Date( Date.parse( self._apiSession.expiresAt )));

    return resolve( true );
  });
}


ZitiContext.prototype.apiSessionHeartbeat = async function( self ) {

  let res = await self._controllerClient.getCurrentAPISession({ });

  if (!isUndefined( res.data )) {

    self._apiSession = res.data;
    self.logger.debug('ctx.apiSessionHeartbeat(): _apiSession[%o]', self._apiSession);

    if (!isUndefined( self._controllerClient )) {
      self._controllerClient.setApiKey(self._apiSession.token, 'zt-session', false);
    }

    await ls.setWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN, self._apiSession, new Date( Date.parse( self._apiSession.expiresAt )));
  }

  setTimeout(self.apiSessionHeartbeat, (1000 * 60 * 5), self );
}


/**
 * 
 *
 */
 ZitiContext.prototype.ensureAPISession = async function() {

  let self = this;

  self.logger.debug('ctx.ensureAPISession: entered: self._apiSession[%o]', self._apiSession);

  return new Promise( async (resolve, reject) => {

    if (isUndefined( self._apiSession )) {

      self.logger.debug('ctx.ensureAPISession: calling getFreshAPISession()');

      let validCreds = await self.getFreshAPISession();
      if (!validCreds) {

        self.logger.debug('ctx.ensureAPISession: getFreshAPISession() failed');

        let updb = new ZitiUPDB(ZitiUPDB.prototype);  
        await updb.init( { ctx: self, logger: self.logger } );
        updb.awaitCredentialsAndAPISession();

      }
            
    }
    else {

      let now = Date.now();
      let expiresAt = Date.parse( self._apiSession.expiresAt );
      const diffTime = (expiresAt - now);
      const diffMins = (diffTime / (1000 * 60));

      self.logger.debug('ctx.ensureAPISession: mins before apiSession expiration [%o]', diffMins);

      if (diffMins < 5.0) { // if expired, or about to expire

        self.logger.debug('ctx.ensureAPISession: calling getFreshAPISession()');

        let validCreds = await self.getFreshAPISession();
        if (!validCreds) {

          self.logger.debug('ctx.ensureAPISession: getFreshAPISession() failed');

          let updb = new ZitiUPDB(ZitiUPDB.prototype);  
          await updb.init( { ctx: self, logger: self.logger } );
          updb.awaitCredentialsAndAPISession();

        }
      }
    }

    return resolve( true );
  });
}


/**
 * 
 *
 */
 ZitiContext.prototype.flushExpiredAPISessionData = async function() {

  await ls.removeItem(zitiConstants.get().ZITI_API_SESSION_TOKEN);
  await ls.removeItem(zitiConstants.get().ZITI_IDENTITY_CERT);
  this._apiSession = undefined;

 }

 
/**
 * 
 *
 */
 ZitiContext.prototype.isAPISessionExpired = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    if (isUndefined( self._apiSession )) {

      self.flushExpiredAPISessionData();

      return resolve( true );            
    }
    else {

      let now = Date.now();
      let expiresAt = Date.parse( self._apiSession.expiresAt );
      const diffTime = (expiresAt - now);
      const diffMins = (diffTime / (1000 * 60));

      self.logger.debug('ctx.isAPISessionExpired: mins before apiSession expiration [%o]', diffMins);

      if (diffMins < EXPIRE_WINDOW) { // if expired, or about to expire

        self.flushExpiredAPISessionData();    
        return resolve( true );
      
      } else {
        return resolve( false );  // session is not expired and is still viable
      }
    }
  });
}


/**
 * 
 *
 */
 ZitiContext.prototype.isIdentityCertExpired = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    let certExpiry = await ls.getExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);

    if (isNull( certExpiry )) {

      self.flushExpiredAPISessionData();

      return resolve( true );            
    }
    else {

      let now = Date.now();
      const diffTime = (certExpiry - now);
      const diffMins = (diffTime / (1000 * 60));

      self.logger.debug('ctx.isIdentityCertExpired: mins before cert expiration [%o]', diffMins);

      if (diffMins < EXPIRE_WINDOW) { // if expired, or about to expire

        self.flushExpiredAPISessionData();    
        return resolve( true );
      
      } else {
        return resolve( false );  // cert is not expired and is still viable
      }
    }
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

    self.contextType = _options.contextType;

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

    let domain = window.zitiConfig.controller.api;
    
    self._controllerClient = new ZitiControllerClient({
      domain: domain,
      logger: self.logger
    });

    // Get Controller version info
    let res = await self._controllerClient.listVersion();
    self._controllerVersion = res.data;
    self.logger.info('init Controller Version: [%o]', self._controllerVersion);

    self._timeout = zitiConstants.get().ZITI_DEFAULT_TIMEOUT;

    self._network_sessions = new Map();
    let network_sessions = await ls.getWithExpiry(zitiConstants.get().ZITI_NETWORK_SESSIONS);
    if (!isNull(network_sessions)) {
      self._network_sessions = network_sessions;
    }
    self._services = new Map();
    self._channels = new Map();
    self._channelSeq = 0;
    self._connSeq = 0;

    self._loginFormValues = {};
    self._loginFormValues.username = await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_USERNAME );
    self.logger.info('ZITI_IDENTITY_USERNAME: [%o]', self._loginFormValues.username);
    self._loginFormValues.password = await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_PASSWORD );
    self.logger.info('ZITI_IDENTITY_PASSWORD: [%o]', self._loginFormValues.password);

    self._mutex = new Mutex.Mutex();
    self._connectMutexWithTimeout = withTimeout(new Mutex.Mutex(), 5000);

    await self.loadAPISessionToken(self);

    let services = await ls.getWithExpiry(zitiConstants.get().ZITI_SERVICES);
    if (!isNull(services)) {
      self._services = services;
    }

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

    self.contextType = _options.contextType;

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

    // Get Controller version info
    let res = await self._controllerClient.listVersion();
    self._controllerVersion = res.data;
    self.logger.info('initFromServiceWorker Controller Version: [%o]', self._controllerVersion);

    self._timeout = zitiConstants.get().ZITI_DEFAULT_TIMEOUT;

    self._network_sessions = new Map();
    let network_sessions = await ls.getWithExpiry(zitiConstants.get().ZITI_NETWORK_SESSIONS);
    if (!isNull(network_sessions)) {
      self._network_sessions = network_sessions;
    }
    self._services = new Map();
    self._channels = new Map();
    self._channelSeq = 0;
    self._connSeq = 0;

    self._loginFormValues = {};
    self._loginFormValues.username = await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_USERNAME );
    self.logger.info('ZITI_IDENTITY_USERNAME: [%o]', self._loginFormValues.username);
    self._loginFormValues.password = await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_PASSWORD );
    self.logger.info('ZITI_IDENTITY_PASSWORD: [%o]', self._loginFormValues.password);

    self._mutex = new Mutex.Mutex();
    self._connectMutexWithTimeout = withTimeout(new Mutex.Mutex(), 5000);

    await self.loadAPISessionToken(self);

    let services = await ls.getWithExpiry(zitiConstants.get().ZITI_SERVICES);
    if (!isNull(services)) {
      self._services = services;
    }

    resolve();
  });
}


ZitiContext.prototype.setLoginFormValues = async function( loginFormValues ) {
  this._loginFormValues = loginFormValues;
}

ZitiContext.prototype.getLoginFormValues = async function() {
  return this._loginFormValues;
}


ZitiContext.prototype.ensure = async function() {
  return this._loginFormValues;
}



ZitiContext.prototype.fetchServices = async function() {
  
  let self = this;

  return new Promise( async (resolve, reject) => {

    await self.ensureAPISession();

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
// TEMP
// if (edgeRouter.urls.ws === 'ws://curtlaptop-ws:3333') {
      let ch = await self.getChannelByEdgeRouter(conn, edgeRouter);
      self.logger.debug('initiating Hello to [%s] for session[%s]', edgeRouter.urls.ws, conn.token);  
      pendingChannelConnects.push( 
        ch.hello() 
      );
// }      

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

  let self = this;

  return new Promise( async (resolve, reject) => {

    self.logger.debug('contextType[%d] connect() entered for conn[%o]', self.contextType, conn.getId());  

    // If we were not given a networkSession, it most likely means something (an API token, Cert, etc) expired,
    // so we need to purge them and re-acquire
    if (isNull(networkSession) || isUndefined( networkSession )) {

      self.logger.debug('ctx.connect invoked with undefined networkSession');  

      ls.removeItem(zitiConstants.get().ZITI_API_SESSION_TOKEN);
      ls.removeItem(zitiConstants.get().ZITI_IDENTITY_CERT);

      if (self.contextType == contextTypes.ServiceWorkerType) {
        return reject( 'service worker cannot perform identity load; must be done from client' );
      }

      await self._awaitIdentityLoadComplete().catch((err) => {
        self.logger.error( err );  
        return reject( err );
      });
    
    }

    conn.token = networkSession.token;

    // Get list of all Edge Router URLs where the Edge Router has a WS binding
    let edgeRouters = filter(networkSession.edgeRouters, function(o) { return has(o, 'urls.ws'); });

    // Something is wrong if we have no ws-enabled edge routers
    if (isEqual(edgeRouters.length, 0)) {
      return reject(new Error('No Edge Routers with ws: binding were found'));
    }

    //
    self.logger.debug('contextType[%d] trying to acquire _connectMutex for conn[%o]', self.contextType, conn.getId());

    await self._connectMutexWithTimeout.runExclusive(async () => {

      self.logger.debug('contextType[%d] now own _connectMutex for conn[%o]', self.contextType, conn.getId());

      let pendingChannelConnects = await self._getPendingChannelConnects(conn, edgeRouters);
      self.logger.trace('pendingChannelConnects [%o]', pendingChannelConnects);  

      let channelConnects = await Promise.all( pendingChannelConnects );
      self.logger.trace('channelConnects [%o]', channelConnects);  

      // Select channel with nearest Edge Router. Heuristic: select one with earliest Hello-handshake completion timestamp
      let channelConnectWithNearestEdgeRouter = minby(channelConnects, function(channelConnect) { 
        return channelConnect.channel.helloCompletedTimestamp;
      });
      let channelWithNearestEdgeRouter = channelConnectWithNearestEdgeRouter.channel;
      self.logger.debug('Channel [%d] has nearest Edge Router for conn[%o]', channelWithNearestEdgeRouter.getId(), conn.getId());
      channelWithNearestEdgeRouter._connections._saveConnection(conn);
      conn.setChannel(channelWithNearestEdgeRouter);

      // Initiate connection with Edge Router (creates Fabric session)
      await channelWithNearestEdgeRouter.connect(conn);

      if (conn.getState() == edge_protocol.conn_state.Connected) {
        if (conn.getEncrypted()) {  // if connected to a service that has 'encryptionRequired'
          // Do not proceed until crypto handshake has completed
          await channelWithNearestEdgeRouter.awaitConnectionCryptoEstablishComplete(conn);
        }
      }
      self.logger.debug('contextType[%d] releasing _connectMutex for conn[%o]', self.contextType, conn.getId());
    })
    .catch(( err ) => {
      ziti._ctx.logger.error('contextType[%d] failed to acquire _connectMutex for conn[%o]: %o', self.contextType, conn.getId(), err);
      reject( err );
    });

    return resolve();
  });

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
 * Determine if the given URL should be handled via CORS Proxy.
 * 
 * @returns {bool}
 */
 ZitiContext.prototype.shouldRouteOverCORSProxy = async function(url) {
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

  let corsHostsArray = zitiConfig.httpAgent.corsProxy.hosts.split(',');

  return new Promise( async (resolve, reject) => {
    let routeOverCORSProxy = false;
    forEach(corsHostsArray, function( corsHost ) {
      let corsHostSplit = corsHost.split(':');
      if ((hostname === corsHostSplit[0]) && (port === parseInt(corsHostSplit[1], 10))) {
        routeOverCORSProxy = true;
      }
    });
    return resolve( routeOverCORSProxy );
  });
}


/**
 * Determine if the given URL should be handled via DOM Proxy.
 * 
 * @returns {bool}
 */
 ZitiContext.prototype.shouldRouteOverDOMProxy = async function(url) {
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

  let corsHostsArray = zitiConfig.httpAgent.domProxy.hosts.split(',');

  return new Promise( async (resolve, reject) => {
    let routeOverCORSProxy = false;
    forEach(corsHostsArray, function( corsHost ) {
      let corsHostSplit = corsHost.split(':');
      if ((hostname === corsHostSplit[0]) && (port === parseInt(corsHostSplit[1], 10))) {
        routeOverCORSProxy = true;
      }
    });
    return resolve( routeOverCORSProxy );
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
 * @param {*} channel 
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

    let key = edgeRouter.hostname + '-' + conn.token;

    let ch = this._channels.get( key );

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
    this._channels.set(key, ch);
    
    resolve(ch);
  });
}


ZitiContext.prototype.closeChannelByEdgeRouter = function( edgeRouter ) {
  this._channels.delete( edgeRouter );  
}

ZitiContext.prototype.closeAllChannels = function() {
  this._channels = new Map();
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

    const release = await self._mutex.acquire();

    // if we do NOT have a NetworkSession for this serviceId, create it
    if (!self._network_sessions.has(serviceID)) {

      network_session = await self.createNetworkSession(serviceID).catch((e) => { /* ignore */ });

      if (!isUndefined( network_session )) {
    
        self.logger.debug('Created new network_session [%o] ', network_session);
  
      }
  
      self._network_sessions.set(serviceID, network_session);

      await ls.setWithExpiry(zitiConstants.get().ZITI_NETWORK_SESSIONS, self._network_sessions, await ls.getWithExpiry(zitiConstants.get().ZITI_EXPIRY_TIME) );
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
