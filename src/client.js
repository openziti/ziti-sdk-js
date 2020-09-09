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


const ZitiContext     = require('./context/context');
const HttpRequest     = require('./http/request');
const HttpResponse    = require('./http/response');
const http            = require('./http/http');
const { PassThrough } = require('readable-stream')
const LogLevel        = require('./logLevels');
const pjson           = require('../package.json');

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

  ziti.context = new ZitiContext(ZitiContext.prototype);

  await ziti.context.init(options);

  ziti.context.logger.success('JS SDK version %s starting', pjson.version);

  let controllerVersion = ziti.context.getControllerVersion();
  ziti.context.logger.debug('controllerVersion is: ', controllerVersion);

  return ziti.context;
};


/**
 * Dial the `service`.
 *
 * @param {String} service
 * @param {Object} [options]
 * @return {Conn}
 * @api public
 */
ziti.dial = async ( service, options = {} ) => {

  ziti.context.logger.debug('ziti.dial() entered');

  let service_id = await ziti.context.getServiceIdByName(service);
  ziti.context.logger.debug('ID of service is: ', service_id);

  let network_session = await ziti.context.createNetworkSession(service_id);
  ziti.context.logger.debug('network_session is: ', network_session);

  let edgeRouterHost = ziti.context.getEdgeRouterHost(network_session);
  ziti.context.logger.debug('edgeRouterHost for our networkSession is: ', edgeRouterHost);

  ziti._edge = ziti.context.getZitiEdge(network_session, options);

  ziti.context.logger.debug('ziti._edge is: ', ziti._edge);

  // Open websocket to Edge Router
  await ziti._edge.open();

  ziti.context.logger.debug('websocket to Edge Router is now open');

  // Perform Hello handshake with Edge Router
  await ziti._edge.hello();         

  ziti.context.logger.debug('Hello handshake with Edge Router is now complete');

  // Perform connect with Edge Router (creates Fabric session)
  let conn = await ziti._edge.connect();

  await ziti._edge.awaitConnectionCryptoEstablishComplete(conn).catch((e) => {
    ziti.context.logger.error('awaitConnectionCryptoEstablishComplete(), Error: ', e.message)
  });

  ziti.context.logger.debug('Crypto-enabled Connection with Edge Router is now complete');

  return conn;
};


/**
 * Write `data` and callback `fn(res)`.
 *
 * @param {ZitiConnection} conn
 * @param {String} data
 * @return {Response}
 * @api public
 */
async function write(conn, data) {
  return ziti._edge.write(conn, data);       // Write data over Fabric session
}

ziti.write = write;
ziti.send = write;



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

  ziti.context.logger.debug('ziti.fetch() entered');

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

