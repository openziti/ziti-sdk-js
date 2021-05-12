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

var WritableStream = require('stream').Writable
var inherits = require('util').inherits

module.exports = BrowserStdout

inherits(BrowserStdout, WritableStream)

function BrowserStdout(opts) {
  if (!(this instanceof BrowserStdout)) return new BrowserStdout(opts)
  opts = opts || {}
  WritableStream.call(this, opts)
  this.req = opts.req;
}

BrowserStdout.prototype._write = function(chunk, encoding, cb) {
  this.req.write( chunk );
  process.nextTick(cb);
}
