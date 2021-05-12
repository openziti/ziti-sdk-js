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


const RobustWebSocket = require('./robust-websocket');

/**
 * Default options.
 */

/**
 * @typedef {Object} Options
 * @property {Function} [createWebSocket=url => new WebSocket(url)] - custom function for WebSocket construction.
  *
 * @property {Function} [packMessage=noop] - packs message for sending. For example, `data => JSON.stringify(data)`.
 *
 * @property {Function} [unpackMessage=noop] - unpacks received message. For example, `data => JSON.parse(data)`.
 *
 * @property {Function} [attachRequestId=noop] - injects request id into data.
 * For example, `(data, requestId) => Object.assign({requestId}, data)`.
 *
 * @property {Function} [extractRequestId=noop] - extracts request id from received data.
 * For example, `data => data.requestId`.
 *
 * @property {Function} [extractMessageData=event => event.data] - extracts data from event object.
 *
 * @property {Number} timeout=0 - timeout for opening connection and sending messages.
 *
 * @property {Number} connectionTimeout=0 - special timeout for opening connection, by default equals to `timeout`.
 *
 */

module.exports = {
    /**
     * See {@link Options.createWebSocket}
     *
     * @param {String} url
     * @returns {WebSocket}
     */
    // createWebSocket: url => new RobustWebSocket(url, null, {
    //     timeout: 5000, // milliseconds to wait before a connection is considered to have timed out
    //     shouldReconnect: function(event, ws) {
    //         if (event.code === 1008 || event.code === 1011) return; // Do not reconnect on 1008 (HTTP 400 equivalent) and 1011 (HTTP 500 equivalent) 
    //         return Math.pow(2.0, ws.attempts) * 1000;    // reconnect with exponential back-off
    //     },
    //     automaticOpen: true,
    //     ignoreConnectivityEvents: false
    // }),

    createWebSocket: url => {
        let ws;
        if (typeof window === 'undefined') { // if running from service-worker
            ws = new WebSocket( url );
        } else {
            ws = new realWebSocket( url );
        }
        return ws;
    },
    
    /**
     * See {@link Options.packMessage}
     *
     * @param {*} data
     * @returns {String|ArrayBuffer|Blob}
     */
    packMessage: null,
  
    /**
     * See {@link Options.unpackMessage}
     *
     * @param {String|ArrayBuffer|Blob} data
     * @returns {*}
     */
    unpackMessage: null,
  
    /**
     * See {@link Options.attachRequestId}
     *
     * @param {*} data
     * @param {String|Number} requestId
     * @returns {*}
     */
    attachRequestId: null,
  
    /**
     * See {@link Options.extractRequestId}
     *
     * @param {*} data
     * @returns {String|Number|undefined}
     */
    extractRequestId: null,
  
    /**
     * See {@link Options.extractMessageData}
     *
     * @param {*} event
     * @returns {*}
     */
    extractMessageData: event => event.data,
  
    /**
     * See {@link Options.timeout}
     */
    timeout: 0,
  
    /**
     * See {@link Options.connectionTimeout}
     */
    connectionTimeout: 0,
  
    /**
     * See {@link Options.ctx}
     */
    ctx: null,
};