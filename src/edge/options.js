/**
 * Default options.
 */

const LogLevel    = require('../logLevels');

/**
 * @typedef {Object} Options
 * @property {String} session_token=xyz - api session token.
 *
 * @property {String} network_session_token=xyz - network session token.
 *
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
     * See {@link Options.session_token}
     *
     * @param {*} data
     * @returns {String|undefined}
     */
    session_token: null,

    /**
     * See {@link Options.network_session_token}
     *
     * @param {*} data
     * @returns {String|undefined}
     */
    network_session_token: null,

    /**
     * See {@link Options.createWebSocket}
     *
     * @param {String} url
     * @returns {WebSocket}
     */
    createWebSocket: url => new WebSocket(url),
  
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
     * See {@link Options.attachSequenceId}
     *
     * @param {*} data
     * @param {String|Number} sequenceId
     * @returns {*}
     */
    attachSequenceId: null,
  
    /**
     * See {@link Options.extractSequenceId}
     *
     * @param {*} data
     * @returns {String|Number|undefined}
     */
    extractSequenceId: null,
  
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
     * See {@link Options.helloTimeout}
     */
    helloTimeout: 0,

    /**
     * See {@link Options.headerType}
     */
    headerType: null,

    /**
     * See {@link Options.headerData}
     */
    headerData: null,

    /**
     * See {@link Options.serviceType}
     */
    serviceType: null,

    /**
     * See {@link Options.data}
     */
    data: null,

    /**
     * See {@link Options.logLevel}
     *
     */
    logLevel: LogLevel.Info,

  };