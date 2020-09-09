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
 * response.js
 *
 * Response class provides content decoding
 */

// import http from 'http';

const Headers = require('./headers.js');
const Body = require('./body');
const extractContentType = Body.extractContentType;

const INTERNALS = Symbol('Response internals');

// fix an issue where "STATUS_CODES" aren't a named export for node <10
// const STATUS_CODES = http.STATUS_CODES;


/**
 * Expose `HttpResponse`.
 */

module.exports = HttpResponse;

/**
 * Initialize a new `HttpResponse`.
 *
 * @api public
 */

function HttpResponse(body = null, opts = {}) {

	Body.call(this, body, opts);

	const status = opts.status || 200;
	const headers = new Headers(opts.headers)

	if (body != null && !headers.has('Content-Type')) {
		const contentType = extractContentType(body);
		if (contentType) {
			headers.append('Content-Type', contentType);
		}
	}

	this[INTERNALS] = {
		url: opts.url,
		status,
		// statusText: opts.statusText || STATUS_CODES[status],
		headers,
		counter: opts.counter
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
  for (const key in HttpResponse.prototype) {
    if (Object.prototype.hasOwnProperty.call(HttpResponse.prototype, key))
      obj[key] = HttpResponse.prototype[key];
  }

  return obj;
}


HttpResponse.prototype.url = async function() {
	return this[INTERNALS].url || '';
}

HttpResponse.prototype.status = async function() {
	return this[INTERNALS].status;
}

HttpResponse.prototype.ok = async function() {
	return this[INTERNALS].status >= 200 && this[INTERNALS].status < 300;
}

HttpResponse.prototype.headers = async function() {
	return this[INTERNALS].headers;
}

Body.mixIn(HttpResponse.prototype);
