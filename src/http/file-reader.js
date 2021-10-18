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
 * Expose `ZitiFileReader`.
 */

 module.exports = ZitiFileReader;


function ZitiFileReader( file ) {
  this._file = file;
  this._fileSize = this._file.size;
  this._offset = 0;
  this._chunkSize = 65536;
  this._dataBuffer = new Buffer.alloc( 0 );
}


/**
 * 
 * @returns Promise
 */
 ZitiFileReader.prototype.getBuffer = function () {

  let self = this;

  return new Promise(function(resolve, reject) {

    var chunkReaderBlock = null;

    var readEventHandler = function( evt ) {

        if (evt.target.error === null) {

            self._offset += evt.target.result.byteLength;
            let buf = new Buffer.from( evt.target.result );
            self._dataBuffer = Buffer.concat( [self._dataBuffer, buf]);     

        } else {

            console.error("Read error: " + evt.target.error);
            return reject();

        }

        if (self._offset >= self._fileSize) {
            return resolve( self._dataBuffer );
        }

        // off to the next chunk
        chunkReaderBlock(self._offset, self._chunkSize, self._file);
    }

    chunkReaderBlock = function(_offset, length, _file) {
        var r = new FileReader();
        var blob = _file.slice(_offset, length + _offset);
        r.onload = readEventHandler;
        r.readAsArrayBuffer(blob);
    }

    // now let's start the read with the first block
    chunkReaderBlock(self._offset, self._chunkSize, self._file);

  });

}
