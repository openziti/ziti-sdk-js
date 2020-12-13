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


"use strict";

/**
 * 
 */
const ZITI_CONSTANTS = 
{   
    /**
     * The selected JWT to enroll with
     */
    'ZITI_JWT':             'ZITI_JWT',

    /**
     * The location of the Controller REST endpoint (as decoded from the JWT)
     */
    'ZITI_CONTROLLER':      'ZITI_CONTROLLER',

    /**
     * The location of the Controller WS endpoint (as returned from /protocols)
     */
    'ZITI_CONTROLLER_WS':      'ZITI_CONTROLLER_WS',

    /**
     * The Identity certificate (produced during enrollment)
     */
    'ZITI_IDENTITY_CERT':   'ZITI_IDENTITY_CERT',

    /**
     * The Identity public key (generated locally during enrollment)
     */
    'ZITI_IDENTITY_PUBLIC_KEY':    'ZITI_IDENTITY_PUBLIC_KEY',

    /**
     * The Identity private key (generated locally during enrollment)
     */
    'ZITI_IDENTITY_PRIVATE_KEY':    'ZITI_IDENTITY_PRIVATE_KEY',

    /**
     * The Identity CA (retrived from Controller during enrollment)
     */
    'ZITI_IDENTITY_CA':     'ZITI_IDENTITY_CA',

    /**
     * The default timeout in milliseconds for connections and write operations to succeed.
     */
    'ZITI_DEFAULT_TIMEOUT': 10000,

    /**
     * The ...
     */
    'ZITI_CLIENT_CERT_PEM': 'ZITI_CLIENT_CERT_PEM',

    /**
     * The ...
     */
    'ZITI_CLIENT_PRIVATE_KEY_PEM': 'ZITI_CLIENT_PRIVATE_KEY_PEM',

};

  
exports.get = () => {  
    return ZITI_CONSTANTS;
};
  