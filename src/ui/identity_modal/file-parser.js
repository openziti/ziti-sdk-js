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

const jwt_decode = require('jwt-decode');
const ls = require('../../utils/localstorage');
const zitiConstants = require('../../constants');

let jwt = '';

let chunkSize = 1000;


/**
 *	Parse the selected identity.json file and save data we need to local storage
 *
 * @param {File} file
 */  
exports.parse = (file) => {
  var fileSize   = file.size;
  var offset     = 0;
  var self       = this; // we need a reference to the current object
  var chunkReaderBlock = null;

  var readEventHandler = function(evt) {
      if (evt.target.error == null) {
          offset += evt.target.result.length;
          receiveFileChunk(evt.target.result); // callback for handling read chunk
      } else {
          console.error("Read error: " + evt.target.error);
          return;
      }
      if (offset >= fileSize) {
          receiveEOF(); // callback for handling EOF
          return;
      }

      // off to the next chunk
      chunkReaderBlock(offset, chunkSize, file);
  }

  chunkReaderBlock = function(_offset, length, _file) {
      var r = new FileReader();
      var blob = _file.slice(_offset, length + _offset);
      r.onload = readEventHandler;
      r.readAsText(blob);
  }

  // now let's start the read with the first block
  chunkReaderBlock(offset, chunkSize, file);
}

/**
 *	Dispatch the chunk
 *
 * @param {string} chunk
 */  
function receiveFileChunk(chunk) {
  jwt += chunk;
}


/**
 *	Process results of parsing
 *
 * @param {string} chunk
 */  
function receiveEOF() {
  let decoded_jwt = jwt_decode(jwt);
  ls.setWithExpiry(zitiConstants.get().ZITI_JWT, jwt, decoded_jwt.exp * 1000);
}
