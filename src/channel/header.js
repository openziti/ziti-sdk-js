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
 * Module dependencies.
 */

const formatMessage   = require('format-message');
const flatOptions     = require('flat-options');
const isNull          = require('lodash.isnull');
const isEqual         = require('lodash.isequal');

const utils           = require('../utils/utils');
const defaultOptions  = require('./header-options');
const {throwIf}       = require('../utils/throwif');
const edge_protocol   = require('./protocol');


formatMessage.setup({
//   locale: 'es-ES', // what locale strings should be displayed
//   missingReplacement: '!!NOT TRANSLATED!!', // use this when a translation is missing instead of the default message
  missingTranslation: 'ignore', // don't console.warn or throw an error when a translation is missing
})



/**
 * @typicalname header
 */
module.exports = class Header {
  /**
   *
   * @param {int} headerId ZitiEnums.header_id
   * @param {Options} [options]
   */
  constructor(headerId, options) {
    this._headerId = headerId;
    this._options = flatOptions(options, defaultOptions);

    throwIf(isNull(this._options.headerType), formatMessage('headerType not specified'));
    this._headerType = this._options.headerType;

    throwIf(isNull(this._options.headerData), formatMessage('headerData not specified'));
    this._headerData = this._options.headerData;

    this._bytesForWire = this._createBytesForWire();

    this._length = this._bytesForWire.length;
  }

  getId() {
    return this._headerId;
  }

  getData() {
    return this._headerData;
  }

  getLength() {
    return this._length;
  }

  getBytesForWire() {
    return this._bytesForWire;
  }

  _createBytesForWire() {

    if (isEqual(this._headerType, edge_protocol.header_type.StringType)) {

      let headerDataLength = Buffer.byteLength(this._headerData, 'utf8');

      let bytes_header_id_and_length = new Buffer( 4 + 4 );
      bytes_header_id_and_length.writeUInt32LE(this._headerId, 0);
      bytes_header_id_and_length.writeUInt32LE(headerDataLength, 4);


      let bytes_header_data = utils.toUTF8Array(this._headerData);
      let buffer_header_data = Buffer.from(bytes_header_data);

      let bytes_complete_header = Buffer.concat([bytes_header_id_and_length, buffer_header_data], 4 + 4 + headerDataLength );

      return bytes_complete_header;

    } else if (isEqual(this._headerType, edge_protocol.header_type.IntType)) {

      let headerDataLength = 4;

      let bytes_complete_header = new Buffer( 4 + 4 + 4 );
      bytes_complete_header.writeUInt32LE(this._headerId, 0);
      bytes_complete_header.writeUInt32LE(headerDataLength, 4);
      bytes_complete_header.writeInt32LE(this._headerData, 8);

      return bytes_complete_header;

    } else if (isEqual(this._headerType, edge_protocol.header_type.Uint8ArrayType)) {

      let headerDataLength = Buffer.byteLength(this._headerData, 'utf8');

      let bytes_header_id_and_length = new Buffer( 4 + 4 );
      bytes_header_id_and_length.writeUInt32LE(this._headerId, 0);
      bytes_header_id_and_length.writeUInt32LE(headerDataLength, 4);

      let buffer_header_data = Buffer.from(this._headerData);

      let bytes_complete_header = Buffer.concat([bytes_header_id_and_length, buffer_header_data], 4 + 4 + headerDataLength );

      return bytes_complete_header;

    } else {

      throw new Error('unknown headerType');

    }
  }

  _createFromBytesFromWire(bytes) {
  }

}
