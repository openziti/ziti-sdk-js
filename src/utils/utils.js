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

const isEqual = require('lodash.isequal');

/**
 * Return the mime type for the given `str`.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.type = str => str.split(/ *; */).shift();


/**
 * Combine two ArrayBuffers.
 */
exports.appendBuffer = (buffer1, buffer2) => {
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
};


/**
 * 
 */
exports.toUTF8Array = (str) => {
  var utf8 = [];
  for (var i=0; i < str.length; i++) {
      var charcode = str.charCodeAt(i);
      if (charcode < 0x80) utf8.push(charcode);
      else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6), 
                    0x80 | (charcode & 0x3f));
      }
      else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12), 
                    0x80 | ((charcode>>6) & 0x3f), 
                    0x80 | (charcode & 0x3f));
      }
      // surrogate pair
      else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
                    | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18), 
                    0x80 | ((charcode>>12) & 0x3f), 
                    0x80 | ((charcode>>6) & 0x3f), 
                    0x80 | (charcode & 0x3f));
      }
  }
  return utf8;
}


/**
 * The base implementation of `sum` and `sumBy`.
 *
 * @private
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {number} Returns the sum.
 */
exports.baseSum = (array, iteratee) => {
  let result

  for (const value of array) {
    const current = iteratee(value)
    if (current !== undefined) {
      result = result === undefined ? current : (result + current)
    }
  }
  return result
}

/**
 * This method is like `sum` except that it accepts `iteratee` which is
 * invoked for each element in `array` to generate the value to be summed.
 * The iteratee is invoked with one argument: (value).
 *
 * @since 4.0.0
 * @category Math
 * @param {Array} array The array to iterate over.
 * @param {Function} iteratee The iteratee invoked per element.
 * @returns {number} Returns the sum.
 * @example
 *
 * const objects = [{ 'n': 4 }, { 'n': 2 }, { 'n': 8 }, { 'n': 6 }]
 *
 * sumBy(objects, ({ n }) => n)
 * // => 20
 */
exports.sumBy = (array, iteratee) => {
  return (array != null && array.length)
    ? exports.baseSum(array, iteratee)
    : 0
}


/**
 * Parse a URL.
 *
 * @param   Mixed   url
 * @return  Object
 */
exports.parseURL = (url) => {
  var parser = document.createElement('a'),
      searchObject = {},
  queries, split, i;
  
  // Let the browser do the work
  parser.href = url;

  // Convert query string to object
  queries = parser.search.replace(/^\?/, '').split('&');
  for( i = 0; i < queries.length; i++ ) {
      split = queries[i].split('=');
      searchObject[split[0]] = split[1];
  }

  let port = parser.port;
  if (isEqual(port, '')) {
    port = isEqual(parser.protocol, 'http:') ? 80 : 443;
  }

  return {
      protocol: parser.protocol,
      host: parser.host,
      hostname: parser.hostname,
      port: port,
      pathname: parser.pathname,
      search: parser.search,
      searchObject: searchObject,
      hash: parser.hash
  };
}
