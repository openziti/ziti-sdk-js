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


const {
	Readable,
	Writable,
	Transform,
	Duplex,
	pipeline,
	finished 
  } = require('readable-stream');
  
const BUFFER = Symbol('buffer');
const TYPE = Symbol('type');


/**
 * Expose `Blob`.
 */

module.exports = Blob;

/**
 * Initialize a new `Blob`.
 *
 * @api public
 */

function Blob() {

	this[TYPE] = '';

	const blobParts = arguments[0];
	const options = arguments[1];

	const buffers = [];
	let size = 0;

	if (blobParts) {
		const a = blobParts;
		const length = Number(a.length);
		for (let i = 0; i < length; i++) {
			const element = a[i];
			let buffer;
			if (element instanceof Buffer) {
				buffer = element;
			} else if (ArrayBuffer.isView(element)) {
				buffer = Buffer.from(element.buffer, element.byteOffset, element.byteLength);
			} else if (element instanceof ArrayBuffer) {
				buffer = Buffer.from(element);
			} else if (element instanceof Blob) {
				buffer = element[BUFFER];
			} else {
				buffer = Buffer.from(typeof element === 'string' ? element : String(element));
			}
			size += buffer.length;
			buffers.push(buffer);
		}
	}

	this[BUFFER] = Buffer.concat(buffers);

	let type = options && options.type !== undefined && String(options.type).toLowerCase();
	if (type && !/[^\u0020-\u007E]/.test(type)) {
		this[TYPE] = type;
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
	// for (const key in HttpRequest.prototype) {
	//   if (Object.prototype.hasOwnProperty.call(HttpRequest.prototype, key))
	// 	obj[key] = HttpRequest.prototype[key];
	// }
  
	return obj;
}


Blob.prototype.BUFFER = BUFFER;

Blob.prototype.size = function() {
	return this[BUFFER].length;
}

Blob.prototype.type = function() {
	return this[TYPE];
}

Blob.prototype.text = async function() {
	return Promise.resolve(this[BUFFER].toString());
}

Blob.prototype.arrayBuffer = async function() {
	const buf = this[BUFFER];
	const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	return Promise.resolve(ab);
}

Blob.prototype.stream = function() {
	// const readable = new ReadableStream();
	const readable = new Duplex();
	readable._read = () => {};
	readable.push(this[BUFFER]);
	readable.push(null);
	return readable;
}

Blob.prototype.slice = function() {
	const size = this.size;

	const start = arguments[0];
	const end = arguments[1];
	let relativeStart, relativeEnd;
	if (start === undefined) {
		relativeStart = 0;
	} else if (start < 0) {
		relativeStart = Math.max(size + start, 0);
	} else {
		relativeStart = Math.min(start, size);
	}
	if (end === undefined) {
		relativeEnd = size;
	} else if (end < 0) {
		relativeEnd = Math.max(size + end, 0);
	} else {
		relativeEnd = Math.min(end, size);
	}
	const span = Math.max(relativeEnd - relativeStart, 0);

	const buffer = this[BUFFER];
	const slicedBuffer = buffer.slice(
		relativeStart,
		relativeStart + span
	);
	const blob = new Blob([], { type: arguments[2] });
	blob[BUFFER] = slicedBuffer;
	return blob;
}


