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


const isUndefined     = require('lodash.isundefined');
const isEqual         = require('lodash.isequal');
const isNull          = require('lodash.isnull');
const formatMessage   = require('format-message');
const { PassThrough } = require('readable-stream')
const Mutex           = require('async-mutex');
const withTimeout     = require('async-mutex').withTimeout;
const Cookies         = require('js-cookie');
const CookieInterceptor = require('cookie-interceptor');


const ZitiContext         = require('./context/context');
const ZitiConnection      = require('./channel/connection');
const HttpRequest         = require('./http/request');
const HttpResponse        = require('./http/response');
const ZitiFormData        = require('./http/form-data');
const BrowserStdout       = require('./http/browser-stdout')
const http                = require('./http/http');
const ZitiXMLHttpRequest  = require('./http/ziti-xhr');
const ZitiWebSocketWrapper = require('./http/ziti-websocket-wrapper');
const LogLevel            = require('./logLevels');
const pjson               = require('../package.json');
const {throwIf}           = require('./utils/throwif');
const ZitiPKI             = require('./pki/pki');
const ZitiUPDB            = require('./updb/updb');
const ls                  = require('./utils/localstorage');
const zitiConstants       = require('./constants');
const error               = require('./updb/error');

formatMessage.setup({
  // locale: 'en', // what locale strings should be displayed
  // missingReplacement: '!!NOT TRANSLATED!!', // use this when a translation is missing instead of the default message
  missingTranslation: 'ignore', // don't console.warn or throw an error when a translation is missing
})

if (!zitiConfig.serviceWorker.active) {
  window.realFetch          = window.fetch;
  window.realXMLHttpRequest = window.XMLHttpRequest;
  window.realWebSocket      = window.WebSocket;
}

/**
 * @typicalname client
 */
class ZitiClient {

  constructor() {

    if (!zitiConfig.serviceWorker.active) {

      CookieInterceptor.init(); // Hijack the `document.cookie` object

      CookieInterceptor.write.use( function ( cookie ) {

        (async function() { // we use an IIFE because we need to run some await calls, and we cannot make
                            // our write.use() an async func because it will then return a Promise,
                            // which would cause Cookie storage in the browser to get corrupted.
          
          console.log('=====> CookieInterceptor sees write of Cookie: ', cookie);

          const release = await ziti._cookiemutex.acquire();
  
          let zitiCookies = await ls.getWithExpiry(zitiConstants.get().ZITI_COOKIES);
          if (isNull(zitiCookies)) {
            zitiCookies = {}
          }
          // console.log('=====> CookieInterceptor ZITI_COOKIES (before): ', zitiCookies);
  
          let name = cookie.substring(0, cookie.indexOf("="));
          let value = cookie.substring(cookie.indexOf("=") + 1);
          let cookie_value = value.substring(0, value.indexOf(";"));
          if (cookie_value !== ''){
            let parts = value.split(";");
            let cookiePath;
            let expires;
            for (let j = 0; j < parts.length; j++) {
              let part = parts[j].trim();
              part = part.toLowerCase();
              if ( part.startsWith("path") ) {
                cookiePath = part.substring(part.indexOf("=") + 1);
              }
              else if ( part.startsWith("expires") ) {
                expires = new Date( part.substring(part.indexOf("=") + 1) );
              }
              else if ( part.startsWith("httponly") ) {
                httpOnly = true;
              }
            }
    
            zitiCookies[name] = cookie_value;
    
            // console.log('=====> CookieInterceptor ZITI_COOKIES (after): ', zitiCookies);
    
            await ls.setWithExpiry(zitiConstants.get().ZITI_COOKIES, zitiCookies, new Date(8640000000000000));
          }
  
          release();
            
        })()        

        return cookie;
      });

    }

  }


  /**
   * Initialize.
   *
   * @param {Options} [options]
   * @return {ZitiContext}
   * @api public
   */
  async init(options) {

    return new Promise( async (resolve, reject) => {

      if (isUndefined(window.realFetch)) {
        window.realFetch          = window.fetch;
        window.realXMLHttpRequest = window.XMLHttpRequest;
        window.fetch = fetch;
        window.XMLHttpRequest = ZitiXMLHttpRequest;  
      }

      let ctx = new ZitiContext(ZitiContext.prototype);

      await ctx.init(options);

      ctx.logger.success('JS SDK version %s init completed', pjson.version);

      ziti._ctx = ctx;

      resolve( ctx );

    });

  };


  /**
   * Initialize from Service Worker.
   *
   * @param {Options} [options]
   * @return {ZitiContext}
   * @api public
   */
  async initFromServiceWorker(options) {

    return new Promise( async (resolve, reject) => {

      let ctx = new ZitiContext(ZitiContext.prototype);

      await ctx.init(options);

      ctx.logger.success('JS SDK version %s initFromServiceWorker completed', pjson.version);

      ziti._ctx = ctx;

      resolve( ctx );

    });
  };


  /**
   * Allocate a new Connection.
   *
   * @param {ZitiContext} ctx
   * @param {*} data
   * @return {ZitiConection}
   * @api public
   */
  newConnection(ctx, data) {

    throwIf(isUndefined(ctx), formatMessage('Specified context is undefined.', { }) );
    throwIf(isEqual(ctx, null), formatMessage('Specified context is null.', { }) );

    let conn = new ZitiConnection({ 
      ctx: ctx,
      data: data
    });

    ctx.logger.info('newConnection: conn[%d]', conn.getId());

    return conn;
  };


  /**
   * Dial the `service`.
   *
   * @param {ZitiConnection} conn
   * @param {String} service
   * @param {Object} [options]
   * @return {Conn}
   * @api public
   */
  async dial( conn, service, options = {} ) {

    let ctx = conn.getCtx();
    throwIf(isUndefined(ctx), formatMessage('Connection has no context.', { }) );

    ctx.logger.debug('dial: conn[%d] service[%s]', conn.getId(), service);

    if (isEqual( ctx.getServices().size, 0 )) {
      await ctx.fetchServices();
    }

    let service_id = ctx.getServiceIdByName(service);
    
    conn.setEncrypted(ctx.getServiceEncryptionRequiredByName(service));

    let network_session = await ctx.getNetworkSessionByServiceId(service_id);

    await ctx.connect(conn, network_session);

    ctx.logger.debug('dial: conn[%d] service[%s] encryptionRequired[%o] is now complete', conn.getId(), service, conn.getEncrypted());

  };


  /**
   * Close the `connection`.
   *
   * @param {ZitiConnection} conn
   * @api public
   */
  async close( conn ) {

    let self = this;

    return new Promise( async (resolve, reject) => {
  
      let ctx = conn.getCtx();
  
      throwIf(isUndefined(ctx), formatMessage('Connection has no context.', { }) );

      ctx.logger.debug('close: conn[%d]' , conn.getId());

      await ctx.close(conn);

      ctx.logger.debug('close: conn[%d] is now complete', conn.getId());

      resolve()

    });
  };


  /**
   * Do a 'fetch' request over the specified Ziti connection.
   *
   * @param {ZitiConnection} conn
   * @param {String} url
   * @param {Object} opts
   * @return {Promise}
   * @api public
   */
  async fetch( conn, url, opts ) {

    let ctx = conn.getCtx();

    ctx.logger.logger.debug('ziti.fetch() entered');

    return new Promise( async (resolve, reject) => {

      // build HTTP request object
      let request = new HttpRequest(conn, url, opts);
      const options = await request.getRequestOptions();

      let req;

      if (options.method === 'GET') {

        req = http.get(options);

      } else {

        req = http.request(options);

        req.end();
      }

      req.on('error', err => {
        ctx.logger.logger.error('error EVENT: err: %o', err);
        reject(new Error(`request to ${request.url} failed, reason: ${err.message}`));
        finalize();
      });

      req.on('response', async res => {
        let body = res.pipe(new PassThrough());
        const response_options = {
          url: request.url,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          size: request.size,
          timeout: request.timeout,
          counter: request.counter
        };
        let response = new HttpResponse(body, response_options);
        resolve(response);
      });

    });

  }


  /**
   * Do a 'fetch' request over the specified Ziti connection, on behalf of Service Worker
   *
   * @param {String} url
   * @param {Object} opts
   * @return {Promise}
   * @api public
   */
  async fetchFromServiceWorker( url, opts ) {

    let self = this;

    return new Promise( async (resolve, reject) => {

      console.log('js-sdk fetchFromServiceWorker() entered');

      await ziti._serviceWorkerMutexWithTimeout.runExclusive(async () => {

        console.log('js-sdk fetchFromServiceWorker() acquired ziti._mutex');

        if (isUndefined(ziti._ctx)) {  // If we have no context, create it now
          let ctx = new ZitiContext(ZitiContext.prototype);
          await ctx.initFromServiceWorker({ logLevel: LogLevel[zitiConfig.httpAgent.zitiSDKjs.logLevel] } );
          ctx.logger.success('JS SDK version %s init (fetchFromServiceWorker) completed', pjson.version);
          ziti._ctx = ctx;      
        }
  
      })
      .catch(( err ) => {
        ziti._ctx.logger.error(err);
        return reject( err );
      });
    
      let serviceName = await ziti._ctx.shouldRouteOverZiti(url).catch( async ( error ) => {
        ziti._ctx.logger.debug('fetchFromServiceWorker: purging cert and API token due to err: ', error);
        await ls.removeItem( zitiConstants.get().ZITI_IDENTITY_CERT );
        await ls.removeItem( zitiConstants.get().ZITI_API_SESSION_TOKEN );
        return reject( error );
      });
  
      if (isUndefined(serviceName)) { // If we have no serviceConfig associated with the hostname:port, do not intercept
        return reject( new Error('no serviceConfig associated with the url: ' + url) );
      }
  
      /**
       * ------------ Now Routing over Ziti -----------------
       */
      ziti._ctx.logger.debug('fetchFromServiceWorker(): serviceConfig match; intercepting [%s]', url);
    
      // build HTTP request object
      let request = new HttpRequest(serviceName, url, opts);
      const options = await request.getRequestOptions();
  
      let req;
  
      if (options.method === 'GET') {
  
        req = http.get(options);
  
      } else {
  
        req = http.request(options);

        if (options.body) {

          let bodyStream = options.body.stream();
          let bodyStreamReader = bodyStream.getReader();

          async function push() {
            return new Promise( async (resolve, reject) => {
              var chunk = await bodyStreamReader.read();
              if (chunk) {
                if (!chunk.done && chunk.value) {
                  req.write( chunk.value );
                  await push();
                } 
              }
              resolve();
            });
          }

          await push();
        }
  
        req.end();
      }

      ziti._ctx.logger.debug('fetchFromServiceWorker(): req launched for [%s]', url);
  
      req.on('error', err => {
        ziti._ctx.logger.error('error EVENT: err: %o', err);
        reject(new Error(`request to ${request.url} failed, reason: ${err.message}`));
      });
  
      req.on('response', async res => {

        ziti._ctx.logger.debug('fetchFromServiceWorker(): on.response entered for [%s]', url);
  
        let body = res.pipe(new PassThrough());

        if (req.path === '/oauth/google/login') {
          let location = res.headers.location;
          if (!isUndefined(location)) {
            location = location.replace(`redirect_uri=${zitiConfig.httpAgent.target.scheme}%`, `redirect_uri=https%`);            
            let targetHost = `${zitiConfig.httpAgent.target.host}`;
            targetHost = targetHost.toLowerCase();
            location = location.replace(`${targetHost}`, `${zitiConfig.httpAgent.self.host}`);
            res.headers.location = location;
          }
        }

        const response_options = {
          url: request.url,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          size: request.size,
          timeout: request.timeout,
          counter: request.counter
        };
        let response = new HttpResponse(body, response_options);

        for (const hdr in response_options.headers) {
          if (response_options.headers.hasOwnProperty(hdr)) {
            if (hdr === 'set-cookie') {
              let cookieArray = response_options.headers[hdr];
              let cookiePath;
              let expires;
              let httpOnly = false;
  
              let zitiCookies = await ls.getWithExpiry(zitiConstants.get().ZITI_COOKIES);
              if (isNull(zitiCookies)) {
                zitiCookies = {}
              }
  
              for (let i = 0; i < cookieArray.length; i++) {
  
                let cookie = cookieArray[i];
                let name = cookie.substring(0, cookie.indexOf("="));
                let value = cookie.substring(cookie.indexOf("=") + 1);
                let cookie_value = value.substring(0, value.indexOf(";"));
                if (cookie_value !== ''){
                  let parts = value.split(";");
                  for (let j = 0; j < parts.length; j++) {
                    let part = parts[j].trim();
                    if ( part.startsWith("Path") ) {
                      cookiePath = part.substring(part.indexOf("=") + 1);
                    }
                    else if ( part.startsWith("Expires") ) {
                      expires = new Date( part.substring(part.indexOf("=") + 1) );
                    }
                    else if ( part.startsWith("HttpOnly") ) {
                      httpOnly = true;
                    }
                  }
    
                  zitiCookies[name] = cookie_value;
    
                  await ls.setWithExpiry(zitiConstants.get().ZITI_COOKIES, zitiCookies, new Date(8640000000000000));

                  Cookies.set(name, cookie_value, { expires: expires, path:  cookiePath});
                }
              }
            }
          }
        }
  
        resolve(response);
      });
    });
  
  }

}

const ziti = new ZitiClient();

ziti.LogLevel = LogLevel;

ziti._clientMutexNoTimeout = new Mutex.Mutex();
ziti._clientMutexWithTimeout = withTimeout(new Mutex.Mutex(), 5000);

ziti._serviceWorkerMutexNoTimeout = new Mutex.Mutex();
ziti._serviceWorkerMutexWithTimeout = withTimeout(new Mutex.Mutex(), 5000);

ziti._cookiemutex = new Mutex.Mutex();

ziti.VERSION = pjson.version;

module.exports = ziti;


/**
 * Intercept all 'fetch' requests and route them over Ziti if the target host:port matches an active Ziti Service Config
 *
 * @param {String} url
 * @param {Object} opts
 * @return {Promise}
 * @api public
 */
zitiFetch = async ( url, opts ) => {

  let serviceName;

  await ziti._clientMutexWithTimeout.runExclusive(async () => {
    if (isUndefined(ziti._ctx)) {  // If we have no context, create it now
      let ctx = new ZitiContext(ZitiContext.prototype);
      await ctx.initFromServiceWorker({ logLevel: LogLevel[zitiConfig.httpAgent.zitiSDKjs.logLevel] } );
      ctx.logger.success('JS SDK version %s init (zitiFetch) completed', pjson.version);
      ziti._ctx = ctx;      
    }
  })
  .catch(( err ) => {
    ziti._ctx.logger.error(err);
    return new Promise( async (resolve, reject) => {
      reject( err );
    });
  });

  _internal_generateKeyPair();

  // We only want to intercept fetch requests that target the Ziti HTTP Agent
  var regex = new RegExp( zitiConfig.httpAgent.self.host, 'g' );
  var regexSlash = new RegExp( /^\//, 'g' );

  if (url.match( regex )) { // the request is targeting the Ziti HTTP Agent

    await ziti._clientMutexNoTimeout.runExclusive(async () => {

      let isExpired = await ziti._ctx.isIdentityCertExpired();

      if (isExpired) {
        let updb = new ZitiUPDB(ZitiUPDB.prototype);
        await updb.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
        await updb.awaitCredentialsAndAPISession();

        // Acquire fresh Cert
        await ziti._ctx._awaitIdentityLoadComplete().catch((err) => {
          ziti._ctx.logger.error(err);
          return new Promise( async (resolve, reject) => {
            reject( err );
          });
        });
      }

    })
    .catch(( err ) => {
      ziti._ctx.logger.error(err);
      return new Promise( async (resolve, reject) => {
        reject( err );
      });
    });

    var newUrl = new URL( url );
    newUrl.hostname = zitiConfig.httpAgent.target.host;
    newUrl.port = zitiConfig.httpAgent.target.port;
    ziti._ctx.logger.trace( 'zitiFetch: transformed URL: ', newUrl.toString());

    serviceName = await ziti._ctx.shouldRouteOverZiti( newUrl );

    if (isUndefined(serviceName)) { // If we have no serviceConfig associated with the hostname:port, do not intercept
      ziti._ctx.logger.warn('zitiFetch(): no associated serviceConfig, bypassing intercept of [%s]', url);
      return window.realFetch(url, opts);
    }  

    url = newUrl.toString();

  } else if (url.match( regexSlash )) { // the request starts with a slash

    await ziti._clientMutexNoTimeout.runExclusive(async () => {

      let isExpired = await ziti._ctx.isIdentityCertExpired();

      if (isExpired) {
        let updb = new ZitiUPDB(ZitiUPDB.prototype);
        await updb.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
        await updb.awaitCredentialsAndAPISession();
      }
    })
    .catch(( err ) => {
      ziti._ctx.logger.error(err);
      throw err;
    });

    var newUrl = new URL( 'https://' + zitiConfig.httpAgent.target.host + ':' + zitiConfig.httpAgent.target.port + url );
    ziti._ctx.logger.trace( 'zitiFetch: transformed URL: ', newUrl.toString());

    serviceName = await ziti._ctx.shouldRouteOverZiti( newUrl );

    if (isUndefined(serviceName)) { // If we have no serviceConfig associated with the hostname:port, do not intercept
      ziti._ctx.logger.warn('zitiFetch(): no associated serviceConfig, bypassing intercept of [%s]', url);
      return window.realFetch(url, opts);
    }  

    url = newUrl.toString();

  } else {  // the request is targeting the raw internet

    ziti._ctx.logger.warn('zitiFetch(): no http agent url match, bypassing intercept of [%s]', url);
    return window.realFetch(url, opts);
  }

  /**
   * ------------ Now Routing over Ziti -----------------
   */
  ziti._ctx.logger.trace('zitiFetch(): serviceConfig match; intercepting [%s]', url);

	return new Promise( async (resolve, reject) => {

    // build HTTP request object
    let request = new HttpRequest(serviceName, url, opts);
    const options = await request.getRequestOptions();

    let req;

    if (options.method === 'GET') {

      req = http.get(options);

    } else {

      req = http.request(options);

      if (options.body) {
        if (options.body instanceof Promise) {
          let chunk = await options.body;
          req.write( chunk );
        }
        else if (options.body instanceof ZitiFormData) {

          let p = new Promise((resolve, reject) => {

            let stream = options.body.getStream();

            stream.on('error', err => {
              reject(new Error(`${err.message}`));
            });

            stream.on('end', () => {
              try {
                resolve();
              } catch (err) {
                reject(new Error(`${err.message}`));
              }
            });

            stream.pipe(BrowserStdout({req: req}))
          });

          await p;

        }
        else {
          req.write( options.body );
        }
      }

      req.end();
    }

    
    req.on('error', err => {
			ziti._ctx.logger.error('error EVENT: err: %o', err);
			reject(new Error(`request to ${request.url} failed, reason: ${err.message}`));
		});

		req.on('response', async res => {
      let body = res.pipe(new PassThrough());

      const response_options = {
				url: url,
				status: res.statusCode,
				statusText: res.statusMessage,
				headers: res.headers,
				size: request.size,
				timeout: request.timeout,
				counter: request.counter
			};
      let response = new HttpResponse(body, response_options);

      for (const hdr in response_options.headers) {
        if (response_options.headers.hasOwnProperty(hdr)) {
          if (hdr === 'set-cookie') {
            let cookieArray = response_options.headers[hdr];
            let cookiePath;
            let expires;
            let httpOnly = false;

            let zitiCookies = await ls.getWithExpiry(zitiConstants.get().ZITI_COOKIES);
            if (isNull(zitiCookies)) {
              zitiCookies = {}
            }

            for (let i = 0; i < cookieArray.length; i++) {

              let cookie = cookieArray[i];
              let name = cookie.substring(0, cookie.indexOf("="));
              let value = cookie.substring(cookie.indexOf("=") + 1);
              let cookie_value = value.substring(0, value.indexOf(";"));
              if (cookie_value !== ''){
                let parts = value.split(";");
                for (let j = 0; j < parts.length; j++) {
                  let part = parts[j].trim();
                  if ( part.startsWith("Path") ) {
                    cookiePath = part.substring(part.indexOf("=") + 1);
                  }
                  else if ( part.startsWith("Expires") ) {
                    expires = new Date( part.substring(part.indexOf("=") + 1) );
                  }
                  else if ( part.startsWith("HttpOnly") ) {
                    httpOnly = true;
                  }
                }


                zitiCookies[name] = cookie_value;

                await ls.setWithExpiry(zitiConstants.get().ZITI_COOKIES, zitiCookies, new Date(8640000000000000));

                Cookies.set(name, cookie_value, { expires: expires, path:  cookiePath});
              }
            }
          }
        }
      }
      
      resolve(response);
    });

  });

}


if (!zitiConfig.serviceWorker.active) {
  window.fetch = zitiFetch;
  window.XMLHttpRequest = ZitiXMLHttpRequest;
  window.WebSocket = ZitiWebSocketWrapper;
}

if (typeof window !== 'undefined') {
  if (typeof window.fetch !== 'undefined') {
    window.fetch = zitiFetch;
    window.XMLHttpRequest = ZitiXMLHttpRequest;
    window.WebSocket = ZitiWebSocketWrapper;


    window.addEventListener('beforeunload', function (e) {

      if (!isUndefined(ziti._ctx)) {
      }

      //TEMP
      // purgeSensitiveValues();   // flush the IndexedDB
      
      // e.preventDefault(); // If you prevent default behavior in Mozilla Firefox prompt will always be shown
      // e.returnValue = '';       // Chrome requires returnValue to be set

      return undefined;

    });    
      
  }
}

/**
 * 
 */
_sendResponse = ( event, responseObject ) => {

  var data = {
    command: event.data.command,  // echo this back
    response: responseObject
  };
  event.ports[0].postMessage( data );

}


/**
 * 
 */
_onMessage_setControllerApi = async ( event ) => {
  await ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER, event.data.controller, new Date(8640000000000000));
  _sendResponse( event, 'OK' );
}


/**
 * 
 */
 _internal_generateKeyPair = async ( ) => {
  let pki = new ZitiPKI(ZitiPKI.prototype);
  await pki.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
  pki.generateKeyPair();  // initiate keypair calculation
}
_onMessage_generateKeyPair = async ( event ) => {
  _internal_generateKeyPair();
  _sendResponse( event, 'OK' );
}


/**
 * 
 */
 _onMessage_isKeyPairPresent = async ( event ) => {
  let pki = new ZitiPKI(ZitiPKI.prototype);
  let haveKeys = await pki._haveKeypair();
  if (haveKeys) {
    _sendResponse( event, '1' );
  } else {
    _sendResponse( event, '0' );
  }
}


/**
 * 
 */
 _onMessage_isIdentityPresent = async ( event ) => {

  let apisess = await ls.getWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN);
  let cert    = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);

  if (
    isNull( apisess ) || isUndefined( apisess ) || isNull( cert ) || isUndefined( cert )
  ) {
    _sendResponse( event, '0' );
  } else {
    _sendResponse( event, '1' );
  }
}


/**
 * 
 */
 _onMessage_promptForZitiCreds = async ( event ) => {

  let username = await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_USERNAME );
  let password = await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_PASSWORD );

  if (
    isNull( username ) || isUndefined( username ) ||
    isNull( password ) || isUndefined( password )
  ) {

    ziti._ctx.logger.info('_onMessage_promptForZitiCreds: ------------------ 1');

    let updb = new ZitiUPDB(ZitiUPDB.prototype);
  
    await updb.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );

    ziti._ctx.logger.info('_onMessage_promptForZitiCreds: ------------------ 2');

    await updb.awaitCredentialsAndAPISession();
  
    ziti._ctx.logger.info('_onMessage_promptForZitiCreds: ------------------ 3');

    // Do not proceed until we have a keypair (this will render a dialog to the user informing them of status)
    let pki = new ZitiPKI(ZitiPKI.prototype);
    await pki.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
    await pki.awaitKeyPairGenerationComplete(); // await completion of keypair calculation
  
    ziti._ctx.logger.info('_onMessage_promptForZitiCreds: ------------------ 4');

    // Trigger a page reload now that we have creds and keypair
    setTimeout(function(){ 
      window.location.reload();
    }, 1000);
    // setTimeout(function(){ window.location.href = window.location.href }, 1000);  
  }

  _sendResponse( event, 'OK' );
}


/**
 * 
 */
 _onMessage_promptForZitiCredsNoWait = async ( event ) => {

  _sendResponse( event, 'OK' ); // release the sw immediately

  await ziti._serviceWorkerMutexNoTimeout.runExclusive(async () => {

    if (isUndefined(ziti._ctx)) {
      let ctx = new ZitiContext(ZitiContext.prototype);
      await ctx.initFromServiceWorker({ logLevel: LogLevel[event.data.options.logLevel] } );
      ctx.logger.success('JS SDK version %s (_onMessage_promptForZitiCredsNoWait) completed', pjson.version);
      ziti._ctx = ctx;
    }

    let apisess = await ls.getWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN);
    let cert    = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT);

    ziti._ctx.logger.trace('_onMessage_promptForZitiCredsNoWait: cert is: %o', cert);

    if ( isNull( apisess ) || isUndefined( apisess ) || isNull( cert ) || isUndefined( cert ) ) {

      let updb = new ZitiUPDB(ZitiUPDB.prototype);

      await updb.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );

      let haveCreds = await updb._haveCreds();

      if (!haveCreds) {

        await updb.awaitCredentialsAndAPISession();

      } else {

        // Remain in this loop until the creds entered on login form are acceptable to the Ziti Controller
        let validCreds;
        do {
          validCreds = await ziti._ctx.getFreshAPISession();
        } while ( !validCreds );

      }

      // Do not proceed until we have a keypair (this will render a dialog to the user informing them of status)
      let pki = new ZitiPKI(ZitiPKI.prototype);
      await pki.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
      await pki.awaitKeyPairGenerationComplete(); // await completion of keypair calculation

      // Acquire the Cert
      await ziti._ctx._awaitIdentityLoadComplete().catch((err) => {
        ziti._ctx.logger.error(err);
      });

      // Trigger a page reload now that we have creds and keypair
      setTimeout(function() {
    
        ziti._ctx.logger.info('_onMessage_promptForZitiCredsNoWait: triggering page reload now');
        window.location.reload();
      
      }, 100);
    }
  });
}


/**
 * 
 */
_onMessage_initClient = async ( event ) => {

  await ziti._serviceWorkerMutexWithTimeout.runExclusive(async () => {
    if (isUndefined(ziti._ctx)) {
      let ctx = new ZitiContext(ZitiContext.prototype);
      await ctx.initFromServiceWorker({ logLevel: LogLevel[event.data.options.logLevel] } );
      ctx.logger.success('JS SDK version %s initFromServiceWorker completed', pjson.version);
      ziti._ctx = ctx;
    }
  })
  .catch(( err ) => {
    throw err;
  });

  _sendResponse( event, 'OK' );
}


/**
 * 
 */
_onMessage_purgeCert = async ( event ) => {
  await ls.removeItem( zitiConstants.get().ZITI_IDENTITY_CERT );
  await ls.removeItem( zitiConstants.get().ZITI_API_SESSION_TOKEN );
  _sendResponse( event, 'nop OK' );
}


/**
 * 
 */
_onMessage_nop = async ( event ) => {
  _sendResponse( event, 'nop OK' );
}


if (!zitiConfig.serviceWorker.active) {
  if ('serviceWorker' in navigator) {

    /**
     *  Service Worker registration
     */
    navigator.serviceWorker.register('ziti-sw.js', {scope: './'} ).then( function() {

        if (navigator.serviceWorker.controller) {
            // If .controller is set, then this page is being actively controlled by our service worker.
            console.log('The Ziti service worker is now registered.');
        } else {
            // If .controller isn't set, then prompt the user to reload the page so that the service worker can take
            // control. Until that happens, the service worker's fetch handler won't be used.
            // console.log('Please reload this page to allow the Ziti service worker to handle network operations.');
        }
    }).catch(function(error) {
        // Something went wrong during registration.
        console.error(error);
    });


    /**
     *  Service Worker 'message' handler'
     */
    navigator.serviceWorker.addEventListener('message', event => {
        console.log('----- Client received msg from serviceWorker: ', event.data.command);

             if (event.data.command === 'initClient')           { _onMessage_initClient( event ); }
        else if (event.data.command === 'generateKeyPair')      { _onMessage_generateKeyPair( event ); }
        else if (event.data.command === 'setControllerApi')     { _onMessage_setControllerApi( event ); }
        else if (event.data.command === 'isKeyPairPresent')     { _onMessage_isKeyPairPresent( event ); }
        else if (event.data.command === 'isIdentityPresent')    { _onMessage_isIdentityPresent( event ); }
        else if (event.data.command === 'promptForZitiCreds')   { _onMessage_promptForZitiCreds( event ); }
        else if (event.data.command === 'promptForZitiCredsNoWait')   { _onMessage_promptForZitiCredsNoWait( event ); }
        else if (event.data.command === 'purgeCert')            { _onMessage_purgeCert( event ); }
        
        else if (event.data.command === 'nop')                  { _onMessage_nop( event ); }

        else { throw new Error('unknown message.command received [' + event.data.command + ']'); }
    });


    /**
     * 
     */
    navigator.serviceWorker.startMessages();

      
  } else {
    console.error("The current browser doesn't support service workers");
  }
}


/**
 * 
 */
async function sendMessageToServiceworker( message ) {

  return new Promise(function(resolve, reject) {

      var messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = function( event ) {
          if (event.data.error) {
              reject(event.data.error);
          } else {
              resolve(event.data);
          }
      };

      navigator.serviceWorker.controller.postMessage(message, [ messageChannel.port2 ]);
  });
}


/**
 * 
 */
async function purgeSensitiveValues() {

  await ls.removeItem( zitiConstants.get().ZITI_CONTROLLER );               // The location of the Controller REST endpoint
  await ls.removeItem( zitiConstants.get().ZITI_SERVICES );                 // 
  await ls.removeItem( zitiConstants.get().ZITI_API_SESSION_TOKEN );        // 
  await ls.removeItem( zitiConstants.get().ZITI_NETWORK_SESSIONS );         // 
  // await ls.removeItem( zitiConstants.get().ZITI_COOKIES );                  // 
  await ls.removeItem( zitiConstants.get().ZITI_CLIENT_CERT_PEM );          // 
  await ls.removeItem( zitiConstants.get().ZITI_CLIENT_PRIVATE_KEY_PEM );   // 
  await ls.removeItem( zitiConstants.get().ZITI_IDENTITY_CERT );            // 
   
}


/**
 * Propagate the cookies from the browser's cookie cache into the Ziti-owned storage.
 */
async function propagateBrowserCookieValues() {

  let zitiCookies = await ls.getWithExpiry(zitiConstants.get().ZITI_COOKIES);
  if (isNull(zitiCookies)) {
    zitiCookies = {}
  }

  // Obtain all Cookie KV pairs from the browser Cookie cache
	let browserCookies = Cookies.get();
	for (const cookie in browserCookies) {
		if (browserCookies.hasOwnProperty( cookie )) {
			zitiCookies[cookie] = browserCookies[cookie];
		}
	}

  await ls.setWithExpiry(zitiConstants.get().ZITI_COOKIES, zitiCookies, new Date(8640000000000000));
}


async function purgeExpiredValues() {

  propagateBrowserCookieValues();
 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_CONTROLLER );               // The location of the Controller REST endpoint
  // await ls.getWithExpiry( zitiConstants.get().ZITI_SERVICES );                 // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_API_SESSION_TOKEN );        // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_NETWORK_SESSIONS );         // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_COOKIES );                  // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_CLIENT_CERT_PEM );          // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_CLIENT_PRIVATE_KEY_PEM );   // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_CERT );            // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_USERNAME );        // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_IDENTITY_PASSWORD );        // 
  // await ls.getWithExpiry( zitiConstants.get().ZITI_COOKIES );                  // 

  setTimeout(purgeExpiredValues, (1000 * 5) );  // pulse this function every few seconds
}

setTimeout(purgeExpiredValues, 1 );
