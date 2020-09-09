
'use strict';

const { ClientRequest } = require('./_http_client');
const HTTPParser = require('./http-parser');
const methods = HTTPParser.methods;

const { IncomingMessage } = require('./_http_incoming');
const {
  validateHeaderName,
  validateHeaderValue,
  OutgoingMessage
} = require('./_http_outgoing');

function request(url, options, cb) {
  return new ClientRequest(url, options, cb);
}

function get(url, options, cb) {
  const req = request(url, options, cb);
  req.end();
  return req;
}

module.exports = {
  METHODS: methods.slice().sort(),
  ClientRequest,
  IncomingMessage,
  OutgoingMessage,
  validateHeaderName,
  validateHeaderValue,
  get,
  request
};
