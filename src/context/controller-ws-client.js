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


const ZitiControllerChannel = require('../channel/controller-channel');
const utils                 = require('../utils/utils');

/**
 * Module dependencies.
 */
const Q = require('q');

/**
 * 
 * @class ZitiControllerWSClient
 * @param {(string|object)} [domainOrOptions] - The project domain or options object. If object, see the object's optional properties.
 * @param {string} [domainOrOptions.domain] - The project domain
 * @param {object} [domainOrOptions.token] - auth token - object with value property and optional headerOrQueryName and isQuery properties
 */
let ZitiControllerWSClient = (function() {
    'use strict';

    function ZitiControllerWSClient(options) {
        this._ctx = options.ctx;

        let domain = (typeof options === 'object') ? options.domain : options;
        this.domain = domain ? domain : 'ws://demo.ziti.dev/ws';
        if (this.domain.length === 0) {
            throw new Error('Domain parameter must be specified as a string.');
        }

        let parsedURL = utils.parseURL(this.domain);
        this._controllerHost = parsedURL.hostname;
        this._controllerPort = parsedURL.port;

        // Create a Channel to the Controller
        this._ch = new ZitiControllerChannel({ 
            ctx: this._ctx,
            controllerHost: this._controllerHost,
            controllerPort: this._controllerPort,
        });
      
        this.apiKey = (typeof options === 'object') ? (options.apiKey ? options.apiKey : {}) : {};
        this.logger = (typeof options === 'object') ? (options.logger ? options.logger : function() { /* NOP */ }) : function() { /* NOP */ };
    }

    function serializeQueryParams(parameters) {
        let str = [];
        for (let p in parameters) {
            if (parameters.hasOwnProperty(p)) {
                str.push(encodeURIComponent(p) + '=' + encodeURIComponent(parameters[p]));
            }
        }
        return str.join('&');
    }

    function mergeQueryParams(parameters, queryParameters) {
        if (parameters.$queryParameters) {
            Object.keys(parameters.$queryParameters)
                .forEach(function(parameterName) {
                    let parameter = parameters.$queryParameters[parameterName];
                    queryParameters[parameterName] = parameter;
                });
        }
        return queryParameters;
    }

    ZitiControllerWSClient.prototype.connect = async function() {
        await this._ch.connect();
    };

    ZitiControllerWSClient.prototype.echo = async function(data) {
        return await this._ch.echo(data);
    };

    /**
     * HTTP Request
     * @method
     * @name ZitiControllerWSClient#request
     * @param {string} method - http method
     * @param {string} url - url to do request
     * @param {object} parameters
     * @param {object} body - body parameters / object
     * @param {object} headers - header parameters
     * @param {object} queryParameters - querystring parameters
     * @param {object} form - form data object
     * @param {object} deferred - promise object
     */
    ZitiControllerWSClient.prototype.request = function(method, url, parameters, body, headers, queryParameters, form, deferred) {
        const queryParams = queryParameters && Object.keys(queryParameters).length ? serializeQueryParams(queryParameters) : null;
        const urlWithParams = url + (queryParams ? '?' + queryParams : '');
        let parsedURL = utils.parseURL(url);
        let path = parsedURL.pathname;

        if (body && !Object.keys(body).length) {
            body = undefined;
        }

        this.logger.debug('ZitiControllerWSClient: doing request to [%o]', urlWithParams);

        return deferred.resolve(this._ch.request(
            JSON.stringify(
                {
                    method,
                    path,
                    queryParams,
                    headers,
                    body
                }
            )
        ));
    };

    /**
     * Set Api Key
     * @method
     * @name ZitiControllerWSClient#setApiKey
     * @param {string} value - apiKey's value
     * @param {string} headerOrQueryName - the header or query name to send the apiKey at
     * @param {boolean} isQuery - true if send the apiKey as query param, otherwise, send as header param
     */
    ZitiControllerWSClient.prototype.setApiKey = function(value, headerOrQueryName, isQuery) {
        this.apiKey.value = value;
        this.apiKey.headerOrQueryName = headerOrQueryName;
        this.apiKey.isQuery = isQuery;
    };
    /**
     * Set Auth headers
     * @method
     * @name ZitiControllerWSClient#setAuthHeaders
     * @param {object} headerParams - headers object
     */
    ZitiControllerWSClient.prototype.setAuthHeaders = function(headerParams) {
        let headers = headerParams ? headerParams : {};
        if (!this.apiKey.isQuery && this.apiKey.headerOrQueryName) {
            headers[this.apiKey.headerOrQueryName] = this.apiKey.value;
        }
        return headers;
    };

    /**
     * This endpoint is used during enrollments to bootstrap trust between enrolling clients and the Ziti Edge API.
    This endpoint returns a base64 encoded PKCS7 store. The content can be base64 decoded and parsed by any library
    that supports parsing PKCS7 stores.

     * @method
     * @name ZitiControllerWSClient#listWellKnownCas
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.listWellKnownCas = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/.well-known/est/cacerts';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/pkcs7-mime'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Returns version information
     * @method
     * @name ZitiControllerWSClient#listRoot
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.listRoot = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Returns version information
     * @method
     * @name ZitiControllerWSClient#listVersion
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.listVersion = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/version';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * This endpoint is usefull for UIs that wish to display UI elements with counts.
     * @method
     * @name ZitiControllerWSClient#listSummary
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.listSummary = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/summary';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Returns a list of spec files embedded within the controller for consumption/documentation/code geneartion
     * @method
     * @name ZitiControllerWSClient#listSpecs
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.listSpecs = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/specs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Returns single spec resource embedded within the controller for consumption/documentation/code geneartion
     * @method
     * @name ZitiControllerWSClient#detailSpec
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailSpec = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/specs/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Return the body of the specification (i.e. Swagger, OpenAPI 2.0, 3.0, etc).
     * @method
     * @name ZitiControllerWSClient#detailSpecBody
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailSpecBody = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/specs/{id}/spec';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['text/yaml, application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Returns a list of active API sessions. The resources can be sorted, filtered, and paginated. This endpoint
    requries admin access.

     * @method
     * @name ZitiControllerWSClient#listAPISessions
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listAPISessions = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/api-sessions';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json; charset=utf-8'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single API Session by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailAPISessions
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailAPISessions = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/api-sessions/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Deletes and API sesion by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteAPISessions
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteAPISessions = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/api-sessions/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Allows authentication  Methods include "password" and "cert"

     * @method
     * @name ZitiControllerWSClient#authenticate
     * @param {object} parameters - method options and parameters
         * @param {} parameters.body - 
         * @param {string} parameters.method - 
     */
    ZitiControllerWSClient.prototype.authenticate = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/authenticate';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['method'] !== undefined) {
            queryParameters['method'] = parameters['method'];
        }

        if (parameters['method'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: method'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Returns a list of authenticators associated to identities. The resources can be sorted, filtered, and paginated.
    This endpoint requries admin access.

     * @method
     * @name ZitiControllerWSClient#listAuthenticators
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.listAuthenticators = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/authenticators';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Creates an authenticator for a specific identity. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#createAuthenticator
     * @param {object} parameters - method options and parameters
         * @param {} parameters.body - A Authenticators create object
     */
    ZitiControllerWSClient.prototype.createAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/authenticators';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single authenticator by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailAuthenticator
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/authenticators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on an authenticator by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateAuthenticator
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An authenticator put object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/authenticators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on an authenticator by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchAuthenticator
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An authenticator patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/authenticators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete an authenticator by id. Deleting all authenticators for an identity will make it impossible to log in.
    Requires admin access.

     * @method
     * @name ZitiControllerWSClient#deleteAuthenticator
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/authenticators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of CA resources; supports filtering, sorting, and pagination. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#listCas
     * @param {object} parameters - method options and parameters
     * @param {integer} parameters.limit - 
     * @param {integer} parameters.offset - 
     * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listCas = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Creates a CA in an unverified state. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createCa
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A CA to create
     */
    ZitiControllerWSClient.prototype.createCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single CA by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailCa
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a CA by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateCa
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A CA update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update only the supplied fields on a CA by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchCa
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A CA patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a CA by id. Deleting a CA will delete its associated certificate authenticators. This can make it
    impossible for identities to authenticate if they no longer have any valid authenticators. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#deleteCa
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * For CA auto enrollment, the enrollment JWT is static and provided on each CA resource. This endpoint provides
    the jwt as a text response.

     * @method
     * @name ZitiControllerWSClient#getCaJwt
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.getCaJwt = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas/{id}/jwt';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/jwt'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Allows a CA to become verified by submitting a certificate in PEM format that has been signed by the target CA.
    The common name on the certificate must match the verificationToken property of the CA. Unverfieid CAs can not
    be used for enrollment/authentication. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#verifyCa
     * @param {object} parameters - method options and parameters
         * @param {} parameters.certificate - A PEM formatted certificate signed by the target CA with the common name matching the CA's validationToken
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.verifyCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/cas/{id}/verify';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['text/plain'];

        if (parameters['certificate'] !== undefined) {
            body = parameters['certificate'];
        }

        if (parameters['certificate'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: certificate'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of config-type resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listConfigTypes
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listConfigTypes = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/config-types';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a config-type. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createConfigType
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A config-type to create
     */
    ZitiControllerWSClient.prototype.createConfigType = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/config-types';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single config-type by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailConfigType
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailConfigType = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/config-types/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a config-type by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateConfigType
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A config-type update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateConfigType = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/config-types/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on a config-type. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchConfigType
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A config-type patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchConfigType = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/config-types/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a config-type by id. Removing a configuration type that are in use will result in a 409 conflict HTTP status code and error. All configurations of a type must be removed first.
     * @method
     * @name ZitiControllerWSClient#deleteConfigType
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteConfigType = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/config-types/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Lists the configs associated to a config-type. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#listConfigsForConfigType
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listConfigsForConfigType = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/config-types/{id}/configs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of config resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listConfigs
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listConfigs = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/configs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a config resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createConfig
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A config to create
     */
    ZitiControllerWSClient.prototype.createConfig = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/configs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single config by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailConfig
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailConfig = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/configs/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a config by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateConfig
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A config update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateConfig = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/configs/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on a config. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchConfig
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A config patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchConfig = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/configs/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a config by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteConfig
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteConfig = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/configs/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves the API session that was used to issue the current request
     * @method
     * @name ZitiControllerWSClient#getCurrentAPISession
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.getCurrentAPISession = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/current-api-session';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Terminates the current API session
     * @method
     * @name ZitiControllerWSClient#deleteCurrentApiSession
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.deleteCurrentApiSession = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/current-api-session';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Returns the identity associated with the API sessions used to issue the current request
     * @method
     * @name ZitiControllerWSClient#getCurrentIdentity
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.getCurrentIdentity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/current-identity';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of authenticators assigned to the current API session's identity; supports filtering, sorting, and pagination.
     * @method
     * @name ZitiControllerWSClient#listCurrentIdentityAuthenticators
     * @param {object} parameters - method options and parameters
     * @param {integer} parameters.limit - 
     * @param {integer} parameters.offset - 
     * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listCurrentIdentityAuthenticators = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/current-identity/authenticators';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single authenticator by id. Will only show authenticators assigned to the API session's identity.
     * @method
     * @name ZitiControllerWSClient#detailCurrentIdentityAuthenticator
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailCurrentIdentityAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/current-identity/authenticators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on an authenticator by id.  Will only update authenticators assigned to the API session's
    identity.

     * @method
     * @name ZitiControllerWSClient#updateCurrentIdentityAuthenticator
     * @param {object} parameters - method options and parameters
         * @param {} parameters.body - An authenticator put object
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateCurrentIdentityAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/current-identity/authenticators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on an authenticator by id. Will only update authenticators assigned to the API
    session's identity.

     * @method
     * @name ZitiControllerWSClient#patchCurrentIdentityAuthenticator
     * @param {object} parameters - method options and parameters
         * @param {} parameters.body - An authenticator patch object
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchCurrentIdentityAuthenticator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/current-identity/authenticators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of edge router policy resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEdgeRouterPolicies
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listEdgeRouterPolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create an edge router policy resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An edge router policy to create
     */
    ZitiControllerWSClient.prototype.createEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single edge router policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on an edge router policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An edge router policy update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on an edge router policy. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An edge router policy patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete an edge router policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of edge routers an edge router policy resources affects; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEdgeRouterPolicyEdgeRouters
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listEdgeRouterPolicyEdgeRouters = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies/{id}/edge-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of identities an edge router policy resources affects; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEdgeRouterPolicyIdentities
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listEdgeRouterPolicyIdentities = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-policies/{id}/identities';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of edge router resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEdgeRouters
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {array} parameters.roleFilter - 
         * @param {string} parameters.roleSemantic - 
     */
    ZitiControllerWSClient.prototype.listEdgeRouters = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        if (parameters['roleFilter'] !== undefined) {
            queryParameters['roleFilter'] = parameters['roleFilter'];
        }

        if (parameters['roleSemantic'] !== undefined) {
            queryParameters['roleSemantic'] = parameters['roleSemantic'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a edge router resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createEdgeRouter
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A config-type to create
     */
    ZitiControllerWSClient.prototype.createEdgeRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single edge router by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailEdgeRouter
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailEdgeRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on an edge router by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateEdgeRouter
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An edge router update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateEdgeRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on an edge router. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchEdgeRouter
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An edge router patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchEdgeRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete an edge router by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteEdgeRouter
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteEdgeRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of edge router policies that apply to the specified edge router.
     * @method
     * @name ZitiControllerWSClient#listEdgeRouterEdgeRouterPolicies
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listEdgeRouterEdgeRouterPolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}/edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of identities that may access services via the given edge router. Supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEdgeRouterIdentities
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listEdgeRouterIdentities = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}/identities';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service policies policies that apply to the specified edge router.
     * @method
     * @name ZitiControllerWSClient#listEdgeRouterServiceEdgeRouterPolicies
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listEdgeRouterServiceEdgeRouterPolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}/service-edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of services that may be accessed via the given edge router. Supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEdgeRouterServices
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listEdgeRouterServices = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-routers/{id}/services';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * endpoint defers to the logic in the more specific `enroll/*` endpoints
     * @method
     * @name ZitiControllerWSClient#enroll
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.token - 
     */
    ZitiControllerWSClient.prototype.enroll = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enroll';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers['Accept'] = ['application/x-pem-file, application/json'];
        headers['Content-Type'] = ['application/pkcs10,application/json,application/x-pem-file,text/plain'];

        if (parameters['token'] !== undefined) {
            queryParameters['token'] = parameters['token'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * For CA auto enrollment, an identity is not created beforehand.
    Instead one will be created during enrollment. The client will present a client certificate that is signed by a
    Certificate Authority that has been added and verified (See POST /cas and POST /cas/{id}/verify).

    During this process no CSRs are requires as the client should already be in possession of a valid certificate.

     * @method
     * @name ZitiControllerWSClient#enrollCa
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.enrollCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enroll/ca';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Enroll an identity via a one-time-token which is supplied via a query string parameter. This enrollment method
    expects a PEM encoded CSRs to be provided for fulfillment. It is up to the enrolling identity to manage the
    private key backing the CSR request.

     * @method
     * @name ZitiControllerWSClient#enrollOtt
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.token - 
     */
    ZitiControllerWSClient.prototype.enrollOtt = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enroll/ott';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers['Accept'] = ['application/x-x509-user-cert'];
        headers['Content-Type'] = ['application/pkcs10'];

        if (parameters['token'] !== undefined) {
            queryParameters['token'] = parameters['token'];
        }

        if (parameters['token'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: token'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Enroll an identity via a one-time-token that also requires a pre-exchanged client certificate to match a
    Certificate Authority that has been added and verified (See POST /cas and POST /cas{id}/verify). The client
    must present a client certificate signed by CA associated with the enrollment. This enrollment is similar to
    CA auto enrollment except that is required the identity to be pre-created.

    As the client certificat has been pre-exchanged there is no CSR input to this enrollment method.

     * @method
     * @name ZitiControllerWSClient#enrollOttCa
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.token - 
     */
    ZitiControllerWSClient.prototype.enrollOttCa = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enroll/ottca';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['token'] !== undefined) {
            queryParameters['token'] = parameters['token'];
        }

        if (parameters['token'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: token'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Enrolls an identity via a one-time-token to establish an initial username and password combination

     * @method
     * @name ZitiControllerWSClient#ernollUpdb
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.token - 
     */
    ZitiControllerWSClient.prototype.ernollUpdb = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enroll/updb';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['token'] !== undefined) {
            queryParameters['token'] = parameters['token'];
        }

        if (parameters['token'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: token'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Enrolls an edge-router via a one-time-token to establish a certificate based identity.

     * @method
     * @name ZitiControllerWSClient#enrollErOtt
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.token - 
     */
    ZitiControllerWSClient.prototype.enrollErOtt = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enroll/erott';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['token'] !== undefined) {
            queryParameters['token'] = parameters['token'];
        }

        if (parameters['token'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: token'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of outstanding enrollments; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEnrollments
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listEnrollments = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enrollments';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single outstanding enrollment by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailEnrollment
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailEnrollment = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enrollments/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete an outstanding enrollment by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteEnrollment
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteEnrollment = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/enrollments/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of geo-regions; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listGeoRegions
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listGeoRegions = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/geo-regions';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single geo-region by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailGeoRegion
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailGeoRegion = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/geo-regions/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of identity resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listIdentities
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {array} parameters.roleFilter - 
         * @param {string} parameters.roleSemantic - 
     */
    ZitiControllerWSClient.prototype.listIdentities = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        if (parameters['roleFilter'] !== undefined) {
            queryParameters['roleFilter'] = parameters['roleFilter'];
        }

        if (parameters['roleSemantic'] !== undefined) {
            queryParameters['roleSemantic'] = parameters['roleSemantic'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create an identity resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createIdentity
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An identity to create
     */
    ZitiControllerWSClient.prototype.createIdentity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single identity by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailIdentity
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailIdentity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on an identity by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateIdentity
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An identity update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateIdentity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on an identity. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchIdentity
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An identity patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchIdentity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete an identity by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteIdentity
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteIdentity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of edge router policies that apply to the specified identity.
     * @method
     * @name ZitiControllerWSClient#listIdentitysEdgeRouterPolicies
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listIdentitysEdgeRouterPolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service configs associated to a specific identity
     * @method
     * @name ZitiControllerWSClient#listIdentitysServiceConfigs
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listIdentitysServiceConfigs = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/service-configs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Associate service configs to a specific identity
     * @method
     * @name ZitiControllerWSClient#associateIdentitysServiceConfigs
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An identity patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.associateIdentitysServiceConfigs = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/service-configs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Remove service configs from a specific identity
     * @method
     * @name ZitiControllerWSClient#disassociateIdentitysServiceConfigs
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - An array of service and config id pairs to remove
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.disassociateIdentitysServiceConfigs = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/service-configs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service policies that apply to the specified identity.
     * @method
     * @name ZitiControllerWSClient#listIdentityServicePolicies
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listIdentityServicePolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/service-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of edge-routers that the given identity may use to access services. Supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listIdentityEdgeRouters
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listIdentityEdgeRouters = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/edge-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of services that the given identity has access to. Supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listIdentityServices
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listIdentityServices = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/services';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Analyzes policies to see if the given identity should be able to dial or bind the given service. |
    Will check services policies to see if the identity can access the service. Will check edge router policies |
    to check if the identity and service have access to common edge routers so that a connnection can be made. |
    Will also check if at least one edge router is on-line. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#getIdentityPolicyAdvice
     * @param {object} parameters - method options and parameters
         * @param {string} parameters.id - The id of the requested resource
         * @param {string} parameters.serviceId - The id of a service
     */
    ZitiControllerWSClient.prototype.getIdentityPolicyAdvice = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identities/{id}/policy-advice/{serviceId}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        path = path.replace('{serviceId}', parameters['serviceId']);

        if (parameters['serviceId'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: serviceId'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of identity types; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listIdentityTypes
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listIdentityTypes = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identity-types';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single identity type by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailIdentityType
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailIdentityType = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identity-types/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service edge router policy resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceEdgeRouterPolicies
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listServiceEdgeRouterPolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a service edge router policy resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createServiceEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service edge router policy to create
     */
    ZitiControllerWSClient.prototype.createServiceEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single service edge policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailServiceEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailServiceEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a service edge policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateServiceEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service edge router policy update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateServiceEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on a service edge policy. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchServiceEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service edge router policy patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchServiceEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a service edge policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteServiceEdgeRouterPolicy
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteServiceEdgeRouterPolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * List the edge routers that a service edge router policy applies to
     * @method
     * @name ZitiControllerWSClient#listServiceEdgeRouterPolicyEdgeRouters
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceEdgeRouterPolicyEdgeRouters = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies/{id}/edge-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * List the services that a service edge router policy applies to
     * @method
     * @name ZitiControllerWSClient#listServiceEdgeRouterPolicyServices
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceEdgeRouterPolicyServices = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-edge-router-policies/{id}/services';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service policy resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServicePolicies
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listServicePolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a service policy resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createServicePolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service policy to create
     */
    ZitiControllerWSClient.prototype.createServicePolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single service policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailServicePolicy
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailServicePolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a service policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateServicePolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service policy update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateServicePolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on a service policy. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchServicePolicy
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service policy patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchServicePolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a service policy by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteServicePolicy
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteServicePolicy = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of identity resources that are affected by a service policy; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServicePolicyIdentities
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServicePolicyIdentities = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies/{id}/identities';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service resources that are affected by a service policy; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServicePolicyServices
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServicePolicyServices = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-policies/{id}/services';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of config resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServices
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {array} parameters.roleFilter - 
         * @param {string} parameters.roleSemantic - 
     */
    ZitiControllerWSClient.prototype.listServices = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        if (parameters['roleFilter'] !== undefined) {
            queryParameters['roleFilter'] = parameters['roleFilter'];
        }

        if (parameters['roleSemantic'] !== undefined) {
            queryParameters['roleSemantic'] = parameters['roleSemantic'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a services resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createService
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service to create
     */
    ZitiControllerWSClient.prototype.createService = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single service by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailService
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailService = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a service by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateService
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateService = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on a service. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchService
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A service patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchService = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a service by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteService
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteService = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of config resources associated to a specific service; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceConfig
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceConfig = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}/configs';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service edge router policy resources that affect a specific service; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceServiceEdgeRouterPolicies
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceServiceEdgeRouterPolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}/service-edge-router-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of service policy resources that affect specific service; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceServicePolicies
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceServicePolicies = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}/service-policies';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of identities that have access to this service. Supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceIdentities
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceIdentities = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}/identities';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of edge-routers that may be used to access the given service. Supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceEdgeRouters
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceEdgeRouters = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}/edge-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of terminator resources that are assigned specific service; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceTerminators
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
         * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.listServiceTerminators = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/services/{id}/terminators';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of active sessions resources; supports filtering, sorting, and pagination. Requires admin access.

    Sessions are tied to an API session and are moved when an API session times out or logs out. Active sessions
    (i.e. Ziti SDK connected to an edge router) will keep the session and API session marked as active.

     * @method
     * @name ZitiControllerWSClient#listSessions
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listSessions = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/sessions';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a session resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createSession
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A session to create
     */
    ZitiControllerWSClient.prototype.createSession = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/sessions';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single session by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailSession
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailSession = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/sessions/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a session by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteSession
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteSession = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/sessions/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of terminator resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listTerminators
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listTerminators = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/terminators';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a terminator resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createTerminator
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A terminator to create
     */
    ZitiControllerWSClient.prototype.createTerminator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/terminators';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single terminator by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailTerminator
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailTerminator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/terminators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a terminator by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateTerminator
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A terminator update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateTerminator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/terminators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on a terminator. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchTerminator
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A terminator patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchTerminator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/terminators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a terminator by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteTerminator
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteTerminator = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/terminators/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of role attributes in use by edge routers; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listEdgeRouterRoleAttributes
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listEdgeRouterRoleAttributes = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/edge-router-role-attributes';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of role attributes in use by identities; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listIdentityRoleAttributes
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listIdentityRoleAttributes = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/identity-role-attributes';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of role attributes in use by services; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listServiceRoleAttributes
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listServiceRoleAttributes = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/service-role-attributes';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a list of transit router resources; supports filtering, sorting, and pagination. Requires admin access.

     * @method
     * @name ZitiControllerWSClient#listTransitRouters
     * @param {object} parameters - method options and parameters
         * @param {integer} parameters.limit - 
         * @param {integer} parameters.offset - 
         * @param {string} parameters.filter - 
     */
    ZitiControllerWSClient.prototype.listTransitRouters = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/transit-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['limit'] !== undefined) {
            queryParameters['limit'] = parameters['limit'];
        }

        if (parameters['offset'] !== undefined) {
            queryParameters['offset'] = parameters['offset'];
        }

        if (parameters['filter'] !== undefined) {
            queryParameters['filter'] = parameters['filter'];
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a transit router resource. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createTransitRouter
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A transit router to create
     */
    ZitiControllerWSClient.prototype.createTransitRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/transit-routers';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Retrieves a single transit router by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#detailTransitRouter
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.detailTransitRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/transit-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update all fields on a transit router by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#updateTransitRouter
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A transit router update object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.updateTransitRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/transit-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PUT', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Update the supplied fields on a transit router. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#patchTransitRouter
     * @param {object} parameters - method options and parameters
     * @param {} parameters.body - A transit router patch object
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.patchTransitRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/transit-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        if (parameters['body'] !== undefined) {
            body = parameters['body'];
        }

        if (parameters['body'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: body'));
            return deferred.promise;
        }

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('PATCH', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Delete a transit router by id. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#deleteTransitRouter
     * @param {object} parameters - method options and parameters
     * @param {string} parameters.id - The id of the requested resource
     */
    ZitiControllerWSClient.prototype.deleteTransitRouter = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/transit-routers/{id}';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        path = path.replace('{id}', parameters['id']);

        if (parameters['id'] === undefined) {
            deferred.reject(new Error('Missing required  parameter: id'));
            return deferred.promise;
        }

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('DELETE', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Create a new database snapshot. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#createDatabaseSnapshot
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.createDatabaseSnapshot = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/database/snapshot';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Runs an data integrity scan on the datastore and returns any found issues. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#checkDataIntegrity
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.checkDataIntegrity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/database/check-data-integrity';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('GET', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };
    /**
     * Runs an data integrity scan on the datastore, attempts to fix any issues it can, and returns any found issues. Requires admin access.
     * @method
     * @name ZitiControllerWSClient#fixDataIntegrity
     * @param {object} parameters - method options and parameters
     */
    ZitiControllerWSClient.prototype.fixDataIntegrity = function(parameters) {
        if (parameters === undefined) {
            parameters = {};
        }
        let deferred = Q.defer();
        let domain = this.domain,
            path = '/database/fix-data-integrity';
        let body = {},
            queryParameters = {},
            headers = {},
            form = {};

        headers = this.setAuthHeaders(headers);
        headers['Accept'] = ['application/json'];
        headers['Content-Type'] = ['application/json'];

        queryParameters = mergeQueryParams(parameters, queryParameters);

        this.request('POST', domain + path, parameters, body, headers, queryParameters, form, deferred);

        return deferred.promise;
    };

    return ZitiControllerWSClient;
})();

module.exports = ZitiControllerWSClient;
