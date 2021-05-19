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
 * request.js
 *
 * HttpRequest class
 *
 * All spec algorithm step numbers are based on https://fetch.spec.whatwg.org/commit-snapshots/ae716822cb3a61843226cd090eefc6589446c1d2/.
 */

const Cookies = require('js-cookie');
const HttpHeaders = require('./headers.js');
const HttpBody = require('./body');
const ZitiFormData = require('./form-data');
const ls = require('../utils/localstorage');
const zitiConstants = require('../constants');
const isNull = require('lodash.isnull');
const clone = HttpBody.clone;
var pjson = require('../../package.json');
const isUndefined = require('lodash.isundefined');


const INTERNALS = Symbol('HttpRequest internals');


/**
 * Check if a value is an instance of HttpRequest.
 *
 * @param   Mixed   input
 * @return  Boolean
 */
function isRequest(input) {
	return (
		typeof input === 'object' &&
		typeof input[INTERNALS] === 'object'
	);
}


/**
 * Parse a URL.
 *
 * @param   Mixed   url
 * @return  Object
 */
function parseURL(url) {
	let parsedUrl = new URL( url );
	return parsedUrl;
}


/**
 * Expose `HttpRequest`.
 */

module.exports = HttpRequest;

/**
 * Initialize a new `HttpRequest`.
 *
 * @api public
 */
function HttpRequest(serviceNameOrConn, input, init = {}) {

	let serviceName;
	let conn;

	if (typeof serviceNameOrConn == 'object') {
		conn = serviceNameOrConn;
	} else if (typeof serviceNameOrConn == 'string') {
		serviceName = serviceNameOrConn;
	} else {
		throw new Error('first paramater is unsupported type');
	}

	if (!isRequest(input)) {
		if (input && input.href) {
			// in order to support Node.js' Url objects; though WHATWG's URL objects
			// will fall into this branch also (since their `toString()` will return
			// `href` property anyway)
			parsedURL = parseURL(input.href);
		} else {
			// coerce input to a string before attempting to parse
			parsedURL = parseURL(`${input}`);
		}
		input = {};
	} else {
		parsedURL = parseURL(input.url);
	}

	let method = init.method || input.method || 'GET';

	method = method.toUpperCase();

	if ((init.body != null || isRequest(input) && input.body !== null) && (method === 'GET' || method === 'HEAD')) {
		throw new Error('HttpRequest with GET/HEAD method cannot have body');
	}

	let inputBody = init.body != null ?
		init.body :
		isRequest(input) && input.body !== null ?
			clone(input) :
			null;

	HttpBody.call(this, inputBody, {
		timeout: init.timeout || input.timeout || 0,
		size: init.size || input.size || 0
	});

	const headers = new HttpHeaders(init.headers || input.headers || {});

	if (this.body instanceof ZitiFormData) {
		inputBody = this.body;
	}

	if (inputBody != null && !headers.has('Content-Type')) {
		const contentType = this.extractContentType(inputBody);
		if (contentType) {
			headers.append('Content-Type', contentType);
		}
	}

	this[INTERNALS] = {
		serviceName,
		conn,
		method,
		redirect: init.redirect || input.redirect || 'follow',
		headers,
		parsedURL,
	};

  	var ctx = mixin(this);
	  
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
  for (const key in HttpRequest.prototype) {
    if (Object.prototype.hasOwnProperty.call(HttpRequest.prototype, key))
      obj[key] = HttpRequest.prototype[key];
  }

  return obj;
}


HttpRequest.prototype.getServiceName = function() {
	return this[INTERNALS].serviceName;
}

HttpRequest.prototype.getConn = function() {
	return this[INTERNALS].conn;
}

HttpRequest.prototype.getMethod = function() {
	return this[INTERNALS].method;
}

HttpRequest.prototype.getHeaders = function() {
	return this[INTERNALS].headers;
}

HttpRequest.prototype.getRedirect = function() {
	return this[INTERNALS].redirect;
}

HttpRequest.prototype.getParsedURL = function() {
	return this[INTERNALS].parsedURL;
}

HttpRequest.prototype.getRequestOptions = async function() {
	const parsedURL = this[INTERNALS].parsedURL;
	const headers = this[INTERNALS].headers;

	// fetch step 1.3
	if (!headers.has('Accept')) {
		headers.set('Accept', '*/*');
	}
	
	// Basic fetch
	if (!parsedURL.hostname) {
		// log.info('non-absolute URL encountered, path: %o', parsedURL.path);

		// if (ZitiFetchLocation.location !== undefined) {
			// parsedURL.hostname = ZitiFetchLocation.location.host;
		// } else {
			throw new TypeError('Only absolute URLs are supported');
		// }
	}
	if (!parsedURL.protocol) {
		parsedURL.protocol = 'https:';
	}

	if (!/^https?:$/.test(parsedURL.protocol)) {
		throw new Error('Only HTTP(S) protocols are supported');
	}

	if (parsedURL.port !== '') {
		headers.set('Host', parsedURL.hostname + ":" + parsedURL.port);
	} else {
		headers.set('Host', parsedURL.hostname);
	}

	if (!headers.has('Cookie')) {

		let cookies = Cookies.get();

		let cookieValue = '';
		for (const cookie in cookies) {
			if (cookies.hasOwnProperty(cookie)) {
				if (cookies[cookie] !== '') {
					cookieValue += cookie + '=' + cookies[cookie] + ';';
				}
			}
		}
		if (!isUndefined(cookies)) {
			if (cookieValue !== '') {
				headers.set('Cookie', cookieValue);
			}
		} 
		if (cookieValue === '') {

			let zitiCookies = await ls.getWithExpiry(zitiConstants.get().ZITI_COOKIES);

			if (!isNull(zitiCookies)) {

				for (const cookie in zitiCookies) {
					if (zitiCookies.hasOwnProperty(cookie)) {
						cookieValue += cookie + '=' + zitiCookies[cookie] + ';';

						if (cookie === 'MMCSRF') {
							headers.set('X-CSRF-Token', zitiCookies[cookie]);
						}		
					}
				}

				headers.set('Cookie', cookieValue);	
			}
		}
	}


	// HTTP-network-or-cache fetch steps 2.4-2.7
	let contentLengthValue = null;
	if (this.body == null && /^(POST|PUT)$/i.test(this.getMethod())) {
		contentLengthValue = '0';
	}
	if (this.body != null) {
		this.body.get
		const totalBytes = this.getTotalBytes(this.body);
		if (typeof totalBytes === 'number') {
			contentLengthValue = String(totalBytes);
		}
	}
	if (/^(POST|PUT)$/i.test(this.getMethod())) {
		if (typeof contentLengthValue == 'string') {
			headers.set('Content-Length', contentLengthValue);
			// headers.set('Transfer-Encoding', 'chunked');
		} else {	// it must be a stream, so we go with chunked encoding instead of content length
			headers.set('Transfer-Encoding', 'chunked');
		}
	}

	// HTTP-network-or-cache fetch step 2.11
	if (!headers.has('User-Agent')) {
		headers.set('User-Agent', 'ziti-sdk-js/' + pjson.version);
	}

	// --- Disable gzip for now ---
	//
	// // HTTP-network-or-cache fetch step 2.15
	if (this.compress && !headers.has('Accept-Encoding')) {
		headers.set('Accept-Encoding', 'gzip,deflate');
	}

	// if (!headers.has('Connection')) {
	// 	headers.set('Connection', 'keep-alive');
	// }

	let obj = Object.assign({}, {
		serviceName: this.getServiceName(),
		conn: this.getConn(),
		method: this.getMethod(),
		headers: headers,
		body: this.body,
	});

	for( var key in parsedURL) {
		obj[key] = parsedURL[key];
	}
	obj.path = obj.pathname;

	return obj;


	// return Object.assign({}, parsedURL, {
	// 	serviceName: this.getServiceName(),
	// 	conn: this.getConn(),
	// 	method: this.getMethod(),
	// 	headers: headers,
	// 	body: this.body,
	// });
}

HttpBody.mixIn(HttpRequest.prototype);

Object.defineProperties(HttpRequest.prototype, {
	method: { enumerable: true },
	url: { enumerable: true },
	headers: { enumerable: true },
	redirect: { enumerable: true },
	clone: { enumerable: true },
});
