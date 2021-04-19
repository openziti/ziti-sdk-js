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

const Blob = require('./blob');

const Stream = require('readable-stream');

const BUFFER = Blob.BUFFER;
// const BUFFER = Symbol('buffer');

const FormData = require('./form-data');

let convert;

const INTERNALS = Symbol('Body internals');


/**
 * Expose `HttpBody`.
 */

module.exports = HttpBody;

/**
 * Initialize a new `HttpBody`.
 *
 * @api public
 */

function HttpBody(body, init = {
	size = 0,
	timeout = 0
} = {}) {

	if (body == null) {
		// body is undefined or null
		body = null;
	} else if (isURLSearchParams(body)) {
		// body is a URLSearchParams
		body = Buffer.from(body.toString());
	} else if (isBlob(body)) {
		// body is blob
	} else if (Buffer.isBuffer(body)) {
		// body is Buffer
	} else if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') {
		// body is ArrayBuffer
		body = Buffer.from(body);
	} else if (ArrayBuffer.isView(body)) {
		// body is ArrayBufferView
		body = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	} else if (body instanceof Stream) {
		// body is stream
	// } else if (typeof body.getBoundary === 'function') {
	// 	// detect form data input from form-data module
	// 	// return `multipart/form-data;boundary=${body.getBoundary()}`;
	} else if (typeof body === 'object' && typeof body.getAll === 'function') {
	// 	// detect FormData object
		ziti._ctx.logger.info('extractContentType() FormData DETECTED for: %o', body);
		var form = new FormData();
		for (var key of body.keys()) {
			ziti._ctx.logger.info('key is: ', key);
			ziti._ctx.logger.info('val is: ', body.get(key));
			form.append(key, body.get(key));
		 }
		 ziti._ctx.logger.info('form is: %o', form);
		 ziti._ctx.logger.info('getHeaders() says: %o', form.getHeaders());

	// 	// return `multipart/form-data;boundary=${form.getBoundary()}`;
	// } else if (body instanceof ReadableStream) {
	// 	// body is readable stream
	} else {
		// log.info('Body is a string: [%o]', body);

		// none of the above
		// coerce to string then buffer
		body = Buffer.from(String(body));

		// log.info('Body as a Buffer: [%o]', body);
		// log.info('Body as a Buffer.toString: [%o]', body.toString());
	}
	this[INTERNALS] = {
		body,
		disturbed: false,
		error: null
	};
	this.size = init.size;
	this.timeout = init.timeout;

	if (body instanceof Stream) {
		body.on('error', err => {
			const error = err.name === 'AbortError'
				? err
				: new Error(`Invalid response body while trying to fetch ${this.url}: ${err.message}`);
			this[INTERNALS].error = error;
		});
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
  for (const key in HttpBody.prototype) {
    if (Object.prototype.hasOwnProperty.call(HttpBody.prototype, key))
      obj[key] = HttpBody.prototype[key];
  }

  return obj;
}


/**
 * Decode response as json
 *
 * @return  Promise
 */
HttpBody.prototype.json = function() {
	return consumeBody.call(this).then((buffer) => {
		try {
			return JSON.parse(buffer.toString());
		} catch (err) {
			return HttpBody.Promise.reject(new Error(`invalid json response body at ${this.url} reason: ${err.message}`));
		}
	})
}


/**
 * Return raw response as Blob
 *
 * @return Promise
 */
HttpBody.prototype.blob = async function() {
	// let hdrs = await this.headers();
	let hdrs = this.headers;
	let ct = hdrs && hdrs.get('content-type') || '';
	return consumeBody.call(this).then(buf => Object.assign(
		// Prevent copying
		new Blob([buf], {
			type: ct.toLowerCase()
		}),
		{
		}
	));
}


/**
 * Return response as text
 *
 * @return Promise
 */
HttpBody.prototype.text = function() {
	return consumeBody.call(this).then(buffer => buffer.toString());
}


/**
 * Return response as ArrayBuffer
 *
 * @return Promise
 */
HttpBody.prototype.arrayBuffer = function() {
	return consumeBody.call(this).then(buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}


/**
 * Return response as buffer
 *
 * @return Promise
 */
HttpBody.prototype.buffer = function() {
	return consumeBody.call(this);
}


/**
 * Decode response as text, while automatically detecting the encoding and
 * trying to decode to UTF-8 (non-spec api)
 *
 * @return  Promise
 */
HttpBody.prototype.textConverted = function() {
	return consumeBody.call(this).then(buffer => convertBody(buffer, this.headers()));
}


Object.defineProperty(HttpBody.prototype, 'body', {
    get() {
      return (
        this[INTERNALS].body
      );
    }
});


HttpBody.prototype.bodyUsed = function() {
	return this[INTERNALS].disturbed;
}


HttpBody.mixIn = function(proto) {
	for (const name of Object.getOwnPropertyNames(HttpBody.prototype)) {
		// istanbul ignore else: future proof
		if (!(name in proto)) {
			const desc = Object.getOwnPropertyDescriptor(HttpBody.prototype, name);
			Object.defineProperty(proto, name, desc);
		}
	}
}


/**
 * Performs the operation "extract a `Content-Type` value from |object|" as
 * specified in the specification:
 * https://fetch.spec.whatwg.org/#concept-bodyinit-extract
 *
 * This function assumes that instance.body is present.
 *
 * @param   Mixed  instance  Any options.body input
 */
HttpBody.prototype.extractContentType = function(body) {
	if (body === null) {
		// body is null
		return null;
	} else if (typeof body === 'string') {
		// body is string
		return 'text/plain;charset=UTF-8';
	} else if (isURLSearchParams(body)) {
		// body is a URLSearchParams
		return 'application/x-www-form-urlencoded;charset=UTF-8';
	} else if (isBlob(body)) {
		// body is blob
		return body.type || null;
	} else if (Buffer.isBuffer(body)) {
		// body is buffer
		return null;
	} else if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') {
		// body is ArrayBuffer
		return null;
	} else if (ArrayBuffer.isView(body)) {
		// body is ArrayBufferView
		return null;
	} else if (typeof body.getBoundary === 'function') {
		// detect form data input from form-data module
		return `multipart/form-data;boundary=${body.getBoundary()}`;
	} else if (typeof body === 'object' && typeof body.getAll === 'function') {
		// detect FormData object
		ziti._ctx.logger.info('extractContentType() FormData DETECTED for: %o', body);
		var form = new FormData();
		for (var key of body.keys()) {
			ziti._ctx.logger.info('key is: ', key);
			ziti._ctx.logger.info('val is: ', body.get(key));
			// form.append(key, body.get(key));
		 }
		 ziti._ctx.logger.info('form is: %o', form);
		 ziti._ctx.logger.info('getHeaders() says: %o', form.getHeaders());

		return `multipart/form-data;boundary=${form.getBoundary()}`;
	// 	// return null;
	} else if (body instanceof Stream) {
		// body is stream
		// can't really do much about this
		return null;
	} else {
		// HttpBody constructor defaults other things to string
		return 'text/plain;charset=UTF-8';
	}
}


/**
 * The Fetch Standard treats this as if "total bytes" is a property on the body.
 * For us, we have to explicitly get it with a function.
 *
 * ref: https://fetch.spec.whatwg.org/#concept-body-total-bytes
 *
 * @param   HttpBody    instance   Instance of HttpBody
 * @return  Number?            Number of bytes, or null if not possible
 */
// HttpBody.prototype.getTotalBytes = function(instance) {
	// const {body} = instance;
HttpBody.prototype.getTotalBytes = function(body) {
	
	if (!body) {
		// body is null
		return 0;
	} else if (isBlob(body)) {
		return body.size;
	} else if (Buffer.isBuffer(body)) {
		// body is buffer
		return body.length;
	} else if (body && typeof body.getLengthSync === 'function') {
		// detect form data input from form-data module
		if (body._lengthRetrievers && body._lengthRetrievers.length == 0 || // 1.x
			body.hasKnownLength && body.hasKnownLength()) { // 2.x
				// return body.getLengthSync();
		}
		// log.info('getTotalBytes() body.getLengthSync(), size unknown');
		return null;
	} else {
		// log.info('getTotalBytes() body is stream, size unknown');
		// body is stream
		return null;
	}
}


/**
 * Write a HttpBody to a WritableStream (e.g. HttpRequest) object.
 *
 * @param   HttpBody    instance   Instance of HttpBody
 * @return  Void
 */
HttpBody.prototype.writeToStream = async function(dest, instance) {
	const {body} = instance;

	if (body === null) {
		// body is null
		dest.end();
	} else if (isBlob(body)) {
		// log.info('writeToStream: body is a BLOB');
		body.stream().pipe(dest);
	} else if (Buffer.isBuffer(body)) {
		// body is buffer
		// log.info('writeToStream: body is a Buffer: %o', body.toString());
		await dest.write(body);
		// dest.end()
	} else {
		// log.info('writeToStream: body is a STREAM: %o', body);
		// body is stream
		body.pipe(dest);	
	}
}


HttpBody.prototype.getBoundary = function() {
	if (!this._boundary) {
	  this._generateBoundary();
	}
  
	return this._boundary;
};

HttpBody.prototype._generateBoundary = function() {
	// This generates a 50 character boundary similar to those used by Firefox.
	// They are optimized for boyer-moore parsing.
	var boundary = '--------------------------';
	for (var i = 0; i < 24; i++) {
	  boundary += Math.floor(Math.random() * 10).toString(16);
	}
  
	this._boundary = boundary;
};
  
  


/**
 * Consume and convert an entire HttpBody to a Buffer.
 *
 * Ref: https://fetch.spec.whatwg.org/#concept-body-consume-body
 *
 * @return  Promise
 */
function consumeBody() {

	// log.info('consumeBody() entered');

	if (this[INTERNALS].disturbed) {
		// log.error('consumeBody() this[INTERNALS].disturbed, body used already for: %s', this.url);

		return HttpBody.Promise.reject(new TypeError(`body used already for: ${this.url}`));
	}

	this[INTERNALS].disturbed = true;

	if (this[INTERNALS].error) {
		// log.error('consumeBody() this[INTERNALS].error: %o', this[INTERNALS].error);

		return HttpBody.Promise.reject(this[INTERNALS].error);
	}

	let body = this.body;

	// body is null
	if (body === null) {
		return HttpBody.Promise.resolve(Buffer.alloc(0));
	}

	// body is blob
	if (isBlob(body)) {
		body = body.stream();
	}

	// body is buffer
	if (Buffer.isBuffer(body)) {
		return HttpBody.Promise.resolve(body);
	}

	// istanbul ignore if: should never happen
	if (!(body instanceof Stream)) {
		return HttpBody.Promise.resolve(Buffer.alloc(0));
	}

	// body is stream
	// get ready to actually consume the body
	let accum = [];
	let accumBytes = 0;
	let abort = false;

	return new HttpBody.Promise((resolve, reject) => {
		let resTimeout;

		// allow timeout on slow response body
		if (this.timeout) {
			resTimeout = setTimeout(() => {
				abort = true;
				reject(new Error(`Response timeout while trying to fetch ${this.url} (over ${this.timeout}ms)`));
			}, this.timeout);
		}

		// handle stream errors
		body.on('error', err => {
			// log.error('consumeBody() in on.error: %o', err);
			if (err.name === 'AbortError') {
				// if the request was aborted, reject with this Error
				abort = true;
				reject(err);
			} else {
				// other errors, such as incorrect content-encoding
				reject(new Error(`Invalid response body while trying to fetch ${this.url}: ${err.message}`));
			}
		});

		body.on('data', chunk => {

			if (abort || chunk === null) {
				return;
			}

			if (this.size && accumBytes + chunk.length > this.size) {
				abort = true;
				// log.error('consumeBody() in on.data: content size over limit: %o', this.size);
				reject(new Error(`content size at ${this.url} over limit: ${this.size}`));
				return;
			}

			accumBytes += chunk.length;
			accum.push(chunk);

		});

		body.on('end', () => {

			if (abort) {
				return;
			}

			clearTimeout(resTimeout);

			try {
				resolve(Buffer.concat(accum, accumBytes));
			} catch (err) {
				// log.error('consumeBody() Could not create Buffer from response body for %s: %s', this.url, err.message);
				// handle streams that have accumulated too much data (issue #414)
				reject(new Error(`Could not create Buffer from response body for ${this.url}: ${err.message}`));
			}
		});
	});
}

/**
 * Detect buffer encoding and convert to target encoding
 * ref: http://www.w3.org/TR/2011/WD-html5-20110113/parsing.html#determining-the-character-encoding
 *
 * @param   Buffer  buffer    Incoming buffer
 * @param   String  encoding  Target encoding
 * @return  String
 */
function convertBody(buffer, headers) {
	if (typeof convert !== 'function') {
		throw new Error('The package `encoding` must be installed to use the textConverted() function');
	}

	const ct = headers.get('content-type');
	let charset = 'utf-8';
	let res, str;

	// header
	if (ct) {
		res = /charset=([^;]*)/i.exec(ct);
	}

	// no charset in content type, peek at response body for at most 1024 bytes
	str = buffer.slice(0, 1024).toString();

	// html5
	if (!res && str) {
		res = /<meta.+?charset=(['"])(.+?)\1/i.exec(str);
	}

	// html4
	if (!res && str) {
		res = /<meta[\s]+?http-equiv=(['"])content-type\1[\s]+?content=(['"])(.+?)\2/i.exec(str);
		if (!res) {
			res = /<meta[\s]+?content=(['"])(.+?)\1[\s]+?http-equiv=(['"])content-type\3/i.exec(str);
			if (res) {
				res.pop(); // drop last quote
			}
		}

		if (res) {
			res = /charset=(.*)/i.exec(res.pop());
		}
	}

	// xml
	if (!res && str) {
		res = /<\?xml.+?encoding=(['"])(.+?)\1/i.exec(str);
	}

	// found charset
	if (res) {
		charset = res.pop();

		// prevent decode issues when sites use incorrect encoding
		// ref: https://hsivonen.fi/encoding-menu/
		if (charset === 'gb2312' || charset === 'gbk') {
			charset = 'gb18030';
		}
	}

	// turn raw buffers into a single utf-8 buffer
	return convert(
		buffer,
		'UTF-8',
		charset
	).toString();
}

/**
 * Detect a URLSearchParams object
 * ref: https://github.com/bitinn/node-fetch/issues/296#issuecomment-307598143
 *
 * @param   Object  obj     Object to detect by type or brand
 * @return  String
 */
function isURLSearchParams(obj) {
	// Duck-typing as a necessary condition.
	if (typeof obj !== 'object' ||
		typeof obj.append !== 'function' ||
		typeof obj.delete !== 'function' ||
		typeof obj.get !== 'function' ||
		typeof obj.getAll !== 'function' ||
		typeof obj.has !== 'function' ||
		typeof obj.set !== 'function') {
		return false;
	}

	// Brand-checking and more duck-typing as optional condition.
	return obj.constructor.name === 'URLSearchParams' ||
		Object.prototype.toString.call(obj) === '[object URLSearchParams]' ||
		typeof obj.sort === 'function';
}

/**
 * Check if `obj` is a W3C `Blob` object (which `File` inherits from)
 * @param  {*} obj
 * @return {boolean}
 */
function isBlob(obj) {
		return typeof obj === 'object' &&
				typeof obj.arrayBuffer === 'function' &&
				typeof obj.type === 'string' &&
				typeof obj.stream === 'function' &&
				typeof obj.constructor === 'function' &&
				typeof obj.constructor.name === 'string' &&
				/^(Blob|File)$/.test(obj.constructor.name) &&
				/^(Blob|File)$/.test(obj[Symbol.toStringTag])
}

// /**
//  * Clone body given Res/Req instance
//  *
//  * @param   Mixed  instance  Response or Request instance
//  * @return  Mixed
//  */
// export function clone(instance) {
// 	let p1, p2;
// 	let body = instance.body;

// 	// don't allow cloning a used body
// 	if (instance.bodyUsed) {
// 		throw new Error('cannot clone body after it is used');
// 	}

// 	// check that body is a stream and not form-data object
// 	// note: we can't clone the form-data object without having it as a dependency
// 	if ((body instanceof Stream) && (typeof body.getBoundary !== 'function')) {
// 		// tee instance body
// 		p1 = new PassThrough();
// 		p2 = new PassThrough();
// 		body.pipe(p1);
// 		body.pipe(p2);
// 		// set instance body to teed body and return the other teed body
// 		instance[INTERNALS].body = p1;
// 		body = p2;
// 	}

// 	return body;
// }




HttpBody.Promise = Promise;
