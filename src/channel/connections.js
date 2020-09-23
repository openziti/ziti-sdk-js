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
 * Class to manage connections.
 * @private
 */


module.exports = class ZitiConnections {
  constructor() {
    this._items = new Map();
  }

  _saveConnection(conn) {
    this._items.set(conn.getId(), conn);
  }

  _deleteConnection(conn) {
      this._items.delete(conn.getId());
  }

  _getConnection(connId) {
    if (this._items.has(connId)) {
      return this._items.get(connId);
    } else {
      return undefined;
    }
  }

};