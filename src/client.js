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
const formatMessage   = require('format-message');
const { PassThrough } = require('readable-stream')

const ZitiContext         = require('./context/context');
const ZitiConnection      = require('./channel/connection');
const HttpRequest         = require('./http/request');
const HttpResponse        = require('./http/response');
const http                = require('./http/http');
const ZitiXMLHttpRequest  = require('./http/ziti-xhr');
const LogLevel            = require('./logLevels');
const pjson               = require('../package.json');
const {throwIf}           = require('./utils/throwif');


formatMessage.setup({
  locale: 'es-ES', // what locale strings should be displayed
  missingReplacement: '!!NOT TRANSLATED!!', // use this when a translation is missing instead of the default message
  missingTranslation: 'ignore', // don't console.warn or throw an error when a translation is missing
})


window.realFetch          = window.fetch;
window.realXMLHttpRequest = window.XMLHttpRequest;

/**
 * 
 */

let root;
if (typeof window !== 'undefined') {
  // Browser window
  root = window;
} else if (typeof self === 'undefined') {
  // Other environments
  console.warn(
    'Using browser-only version of ziti in non-browser environment'
  );
  root = this;
} else {
  // Web Worker
  root = self;
}


/**
 * Expose `ziti`.
 */

module.exports = function() {
  return new exports.Ziti();
};

exports = module.exports;

const ziti = exports;

exports.Ziti = Ziti;
exports.LogLevel = LogLevel;

function Ziti() {}



/**
 * Initialize.
 *
 * @param {Options} [options]
 * @return {ZitiContext}
 * @api public
 */

ziti.init = async (options) => {

  let ctx = new ZitiContext(ZitiContext.prototype);

  await ctx.init(options);

  ctx.logger.success('JS SDK version %s init completed', pjson.version);

  ziti._ctx = ctx;

  return ctx;
};


/**
 * Allocate a new Connection.
 *
 * @param {ZitiContext} ctx
 * @param {*} data
 * @return {ZitiConection}
 * @api public
 */

ziti.newConnection = (ctx, data) => {
  return new ZitiConnection({ 
    ctx: ctx,
    data: data
  });
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
ziti.dial = async ( conn, service, options = {} ) => {

  let ctx = conn.getCtx();
  throwIf(isUndefined(ctx), formatMessage('Connection has no context.', { }) );

  ctx.logger.debug('dial: conn[%d] service[%s]', conn.getId(), service);

  if (isEqual( ctx.getServices().size, 0 )) {
    await ctx.fetchServices();
  }

  let service_id = ctx.getServiceIdByName(service);

  let network_session = await ctx.getNetworkSessionByServiceId(service_id);

  await ctx.connect(conn, network_session);

  ctx.logger.debug('dial: conn[%d] service[%s] is now complete', conn.getId(), service);

};


/**
 * Write `data` and callback `fn(res)`.
 *
 * @param {ZitiConnection} conn
 * @param {String} data
 * @return {Response}
 * @api public
 */
// async function write(conn, data) {
//   return ziti._edge.write(conn, data);       // Write data over Fabric session
// }

// ziti.write  = write;
// ziti.send   = write;



/**
 * Do a 'fetch' request over the specified Ziti connection.
 *
 * @param {ZitiConnection} conn
 * @param {String} url
 * @param {Object} opts
 * @return {Promise}
 * @api public
 */
ziti.fetch = async ( conn, url, opts ) => {

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
			log.error('error EVENT: err: %o', err);
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
 * Intercept all 'fetch' requests and route them over Ziti if the target host:port matches an active Ziti Service Config
 *
 * @param {String} url
 * @param {Object} opts
 * @return {Promise}
 * @api public
 */
fetch = async ( url, opts ) => {

  if (isUndefined(ziti._ctx)) {  // If we have no context, do not intercept
    console.warn('fetch(): no Ziti Context established yet; bypassing intercept of [' + url + ']');
    return window.realFetch(url, opts);
  }

  if (url.indexOf(ziti._ctx.getZtAPI()) !== -1) {  // If target is controller, do not intercept
    ziti._ctx.logger.trace('fetch(): target is Ziti controller; bypassing intercept of [%s]', url);
    return window.realFetch(url, opts);
  }

  let serviceName = await ziti._ctx.shouldRouteOverZiti(url);

  if (isUndefined(serviceName)) { // If we have no serviceConfig associated with the hostname:port, do not intercept
    ziti._ctx.logger.debug('fetch(): no associated serviceConfig, bypassing intercept of [%s]', url);
    return window.realFetch(url, opts);
  }

  /**
   * ------------ Now Routing over Ziti -----------------
   */
  ziti._ctx.logger.debug('fetch(): serviceConfig match; intercepting [%s]', url);

	return new Promise( async (resolve, reject) => {

    // build HTTP request object
    let request = new HttpRequest(serviceName, url, opts);
    const options = await request.getRequestOptions();

    let req;

    if (options.method === 'GET') {

      req = http.get(options);

    } else {

      req = http.request(options);

      req.end();
    }

    
    req.on('error', err => {
			log.error('error EVENT: err: %o', err);
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


window.fetch = fetch;
window.XMLHttpRequest = ZitiXMLHttpRequest;
