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

'use strict';

module.exports = {
  BINARY_TYPES: ['nodebuffer', 'arraybuffer', 'fragments'],

  /**
   *    This GUID is defined by the Websocket protocol (https://tools.ietf.org/html/rfc6455)
   */
  GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',

  kStatusCode: Symbol('status-code'),

  kWebSocket: Symbol('websocket'),

  EMPTY_BUFFER: Buffer.alloc(0),

  NOOP: () => {}
};
