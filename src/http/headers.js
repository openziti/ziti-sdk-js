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

const invalidTokenRegex = /[^\^_`a-zA-Z\-0-9!#$%&'*+.|~]/;
const invalidHeaderCharRegex = /[^\t\x20-\x7e\x80-\xff]/;

function validateName(name) {
	name = `${name}`;
	if (invalidTokenRegex.test(name) || name === '') {
		throw new TypeError(`${name} is not a legal HTTP header name`);
	}
}

function validateValue(value) {
	value = `${value}`;
	if (invalidHeaderCharRegex.test(value)) {
		throw new TypeError(`${value} is not a legal HTTP header value`);
	}
}

/**
 * Find the key in the map object given a header name.
 *
 * Returns undefined if not found.
 *
 * @param   String  name  Header name
 * @return  String|Undefined
 */
function find(map, name) {
	name = name.toLowerCase();
	for (const key in map) {
		if (key.toLowerCase() === name) {
			return key;
		}
	}
	return undefined;
}


const MAP = Symbol('map');


function getHeaders(headers, kind = 'key+value') {
	const keys = Object.keys(headers[MAP]).sort();
	return keys.map(
		kind === 'key' ?
			k => k.toLowerCase() :
			kind === 'value' ?
				k => headers[MAP][k].join(', ') :
				k => [k.toLowerCase(), headers[MAP][k].join(', ')]
	);
}

const INTERNAL = Symbol('internal');

function createHeadersIterator(target, kind) {
	const iterator = Object.create(HeadersIteratorPrototype);
	iterator[INTERNAL] = {
		target,
		kind,
		index: 0
	};
	return iterator;
}

const HeadersIteratorPrototype = Object.setPrototypeOf({
	next() {
		// istanbul ignore if
		if (!this ||
			Object.getPrototypeOf(this) !== HeadersIteratorPrototype) {
			throw new TypeError('Value of `this` is not a HeadersIterator');
		}

		const {
			target,
			kind,
			index
		} = this[INTERNAL];
		const values = getHeaders(target, kind);
		const len = values.length;
		if (index >= len) {
			return {
				value: undefined,
				done: true
			};
		}

		this[INTERNAL].index = index + 1;

		return {
			value: values[index],
			done: false
		};
	}
}, Object.getPrototypeOf(
	Object.getPrototypeOf([][Symbol.iterator]())
));

Object.defineProperty(HeadersIteratorPrototype, Symbol.toStringTag, {
	value: 'HeadersIterator',
	writable: false,
	enumerable: false,
	configurable: true
});



/**
 * Expose `HttpHeaders`.
 */

module.exports = HttpHeaders;

/**
 * Initialize a new `HttpHeaders`.
 *
 * @param   Object  headers  Response headers
 * @api public
 */

function HttpHeaders(init = undefined) {

	this[MAP] = Object.create(null);

	if (init instanceof HttpHeaders) {
		const rawHeaders = init.raw();
		const headerNames = Object.keys(rawHeaders);

		for (const headerName of headerNames) {
			for (const value of rawHeaders[headerName]) {
				this.append(headerName, value);
			}
		}

		return;
	}

	// We don't worry about converting prop to ByteString here as append()
	// will handle it.
	if (init == null) {
		// no op
	} else if (typeof init === 'object') {
		const method = init[Symbol.iterator];
		if (method != null) {
			if (typeof method !== 'function') {
				throw new TypeError('Header pairs must be iterable');
			}

			// sequence<sequence<ByteString>>
			// Note: per spec we have to first exhaust the lists then process them
			const pairs = [];
			for (const pair of init) {
				if (typeof pair !== 'object' || typeof pair[Symbol.iterator] !== 'function') {
					throw new TypeError('Each header pair must be iterable');
				}
				pairs.push(Array.from(pair));
			}

			for (const pair of pairs) {
				if (pair.length !== 2) {
					throw new TypeError('Each header pair must be a name/value tuple');
				}
				this.append(pair[0], pair[1]);
			}
		} else {
			// record<ByteString, ByteString>
			for (const key of Object.keys(init)) {
				const value = init[key];
				this.append(key, value);
			}
		}
	} else {
		throw new TypeError('Provided initializer must be an object');
	}

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
  for (const key in HttpHeaders.prototype) {
    if (Object.prototype.hasOwnProperty.call(HttpHeaders.prototype, key))
      obj[key] = HttpHeaders.prototype[key];
  }

  return obj;
}


/**
 * Return combined header value given name
 *
 * @param   String  name  Header name
 * @return  Mixed
 */
HttpHeaders.prototype.get = function(name) {
	name = `${name}`;
	validateName(name);
	const key = find(this[MAP], name);
	if (key === undefined) {
		return null;
	}

	return this[MAP][key].join(', ');
}


/**
 * Iterate over all headers
 *
 * @param   Function  callback  Executed for each item with parameters (value, name, thisArg)
 * @param   Boolean   thisArg   `this` context for callback function
 * @return  Void
 */
HttpHeaders.prototype.forEach = function(callback, thisArg = undefined) {
	let pairs = getHeaders(this);
	let i = 0;
	while (i < pairs.length) {
		const [name, value] = pairs[i];
		callback.call(thisArg, value, name, this);
		pairs = getHeaders(this);
		i++;
	}
}


/**
 * Overwrite header values given name
 *
 * @param   String  name   Header name
 * @param   String  value  Header value
 * @return  Void
 */
HttpHeaders.prototype.set = function(name, value) {
	name = `${name}`;
	value = `${value}`;
	validateName(name);
	validateValue(value);
	const key = find(this[MAP], name);
	this[MAP][key !== undefined ? key : name] = [value];
}


/**
 * Append a value onto existing header
 *
 * @param   String  name   Header name
 * @param   String  value  Header value
 * @return  Void
 */
HttpHeaders.prototype.append = function(name, value) {
	name = `${name}`;
	// name = name.toLowerCase();
	value = `${value}`;
	validateName(name);
	validateValue(value);
	const key = find(this[MAP], name);
	if (key !== undefined) {
		this[MAP][key].push(value);
	} else {
		this[MAP][name] = [value];
	}
}


/**
 * Check for header name existence
 *
 * @param   String   name  Header name
 * @return  Boolean
 */
HttpHeaders.prototype.has = function(name) {
	name = `${name}`;
	validateName(name);
	let value = find(this[MAP], name);
	let result = (value !== undefined);
	return result;
}


/**
 * Delete all header values given name
 *
 * @param   String  name  Header name
 * @return  Void
 */
HttpHeaders.prototype.delete = function(name) {
	name = `${name}`;
	validateName(name);
	const key = find(this[MAP], name);
	if (key !== undefined) {
		delete this[MAP][key];
	}
}


/**
 * Return raw headers (non-spec api)
 *
 * @return  Object
 */
HttpHeaders.prototype.raw = function() {
	return this[MAP];
}


/**
 * Get an iterator on keys.
 *
 * @return  Iterator
 */
HttpHeaders.prototype.keys = function() {
	return createHeadersIterator(this, 'key');
}


/**
 * Get an iterator on values.
 *
 * @return  Iterator
 */
HttpHeaders.prototype.values = function() {
	return createHeadersIterator(this, 'value');
}


/**
 * Get an iterator on entries.
 *
 * This is the default iterator of the HttpHeaders object.
 *
 * @return  Iterator
 */
HttpHeaders.prototype.entries = function() {
	return createHeadersIterator(this, 'key+value');
}



/**
 * Create a HttpHeaders object from an object of headers, ignoring those that do
 * not conform to HTTP grammar productions.
 *
 * @param   Object  obj  Object of headers
 * @return  HttpHeaders
 */
HttpHeaders.prototype.createHeadersLenient = function(obj) {
	const headers = new HttpHeaders();
	for (const name of Object.keys(obj)) {
		if (invalidTokenRegex.test(name)) {
			continue;
		}
		if (Array.isArray(obj[name])) {
			for (const val of obj[name]) {
				if (invalidHeaderCharRegex.test(val)) {
					continue;
				}
				if (headers[MAP][name] === undefined) {
					headers[MAP][name] = [val];
				} else {
					headers[MAP][name].push(val);
				}
			}
		} else if (!invalidHeaderCharRegex.test(obj[name])) {
			headers[MAP][name] = [obj[name]];
		}
	}
	return headers;
}
