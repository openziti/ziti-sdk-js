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

const flatOptions           = require('flat-options');
const forge                 = require('node-forge');
const isUndefined           = require('lodash.isundefined');
const isNull                = require('lodash.isnull');
const consola               = require('consola');
let MicroModal;
let modalMsg;
if (typeof window !== 'undefined') {
MicroModal            = require('micromodal');
modalMsg              = require('../ui/identity_modal/keypair_generation_msg');
}

const ZitiReporter          = require('../utils/ziti-reporter');
const ls                    = require('../utils/localstorage');
const defaultOptions        = require('./options');
const zitiConstants         = require('../constants');
let identityModalCSS;
let keypairModalHTML;
if (typeof window !== 'undefined') {
identityModalCSS      = require('../ui/identity_modal/css');
keypairModalHTML     = require('../ui/identity_modal/keypair_generation_html');
}


/**
 * Expose `ZitiPKI`.
 */

module.exports = ZitiPKI;

/**
 * Initialize a new `ZitiPKI`.
 *
 * @api public
 */

function ZitiPKI(obj) {
  var ctx = mixin(obj);
  return ctx;
}

/**
 * Mixin the prototype properties.
 *
 * @param {Object} obj
 * @return {Object}
 * @api private
 */
function mixin(obj) {
  for (const key in ZitiPKI.prototype) {
    if (Object.prototype.hasOwnProperty.call(ZitiPKI.prototype, key))
      obj[key] = ZitiPKI.prototype[key];
  }

  return obj;
}


/**
 * Initialize the Ziti PKI.
 * 
 * Tasks:
 * - validate options
 * - create logger if necessary
 *
 * @param {Object} [options]
 * @returns {nothing}   
 */
ZitiPKI.prototype.init = async function(options) {

  let self = this;

  return new Promise( async (resolve, reject) => {

    let _options = flatOptions(options, defaultOptions);

    self.ctx = _options.ctx;
    self.logger = _options.logger;

    if (isNull(self.logger)) {
      self.logger = consola.create({
        level: _options.logLevel,
        reporters: [
          new ZitiReporter()
        ],
        defaults: {
          additionalColor: 'white'
        }
      });
      self.logger.wrapConsole();
    }

    resolve();
  });
}


ZitiPKI.prototype._haveKeypair = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    let privateKey = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);
    let publicKey  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY);

    if (
      isNull( privateKey ) || isUndefined( privateKey ) ||
      isNull( publicKey )  || isUndefined( publicKey )
    ) {
      resolve( false );
    } else {
      resolve( true );
    }
  });

}

/**
 * Generate the keypair for this browser
 * 
 * @params  {nothing}   
 * @returns {nothing}   
 */
ZitiPKI.prototype.generateKeyPair = async function() {

  let self = this;

  let privateKeySize  = 4096;
  let stepInterval    = 500;  // step-time interval, in ms, for generating keypair

  return new Promise( async (resolve, reject) => {

    let haveKeys = await self._haveKeypair();
    if (haveKeys) {
      self.logger.trace('Pre-existing KeyPair found; skipping new keypair generation');
      resolve( false );
      return;
    }

    self.logger.info('Starting KeyPair Generation');

    // if (typeof window !== 'undefined') {

    //   identityModalCSS.inject();
    //   keypairModalHTML.inject();
    //   MicroModal.init({
    //     onShow: modal => console.info(`${modal.id} is shown`), // [1]
    //     onClose: modal => console.info(`${modal.id} is hidden`), // [2]
    //     openTrigger: 'ziti-data-micromodal-trigger', // [3]
    //     closeTrigger: 'data-custom-close', // [4]
    //     openClass: 'is-open', // [5]
    //     disableScroll: true, // [6]
    //     disableFocus: false, // [7]
    //     awaitOpenAnimation: false, // [8]
    //     awaitCloseAnimation: true, // [9]
    //     debugMode: false // [10]
    //   });
    
    //   MicroModal.show('ziti-keypair-modal');

    //   modalMsg.setMessage('Please do not close this browser window.');

    //   modalMsg.setProgress('Zero-Trust KeyPair creation in progress.');
    // }
  

    var startTime, endTime;

    startTime = performance.now();

    // Generate an RSA key pair, run for a few ms at a time on the main JS thread, so as not to completely block JS execution in browser.
    var state = forge.pki.rsa.createKeyPairGenerationState( privateKeySize );

    var step = async function() {

      // If keypair generation still not complete
      if (!forge.pki.rsa.stepKeyPairGenerationState( state, stepInterval )) {

        endTime = performance.now();
        var timeDiff = endTime - startTime; //in ms 
        timeDiff /= 1000; // strip the ms
        var seconds = Math.round(timeDiff);
      
        if ((seconds % 2) == 0) {
          self.logger.debug('Zero-Trust KeyPair creation in progress: elapsed[' + seconds + ' sec]');
          if (typeof window !== 'undefined') {
            modalMsg.setProgress('Zero-Trust KeyPair creation in progress: elapsed[' + seconds + ' sec]');
          }
        }

        setTimeout(step, 50);
      
      } else {  // Now that we have a keypair

        self._privateKey = state.keys.privateKey
        self._publicKey  = state.keys.publicKey

        let privatePEM = forge.pki.privateKeyToPem(self._privateKey);
        privatePEM = privatePEM.replace(/\\n/g, '\n');
        privatePEM = privatePEM.replace(/[\r]+/g, '');
        privatePEM = privatePEM.replace(/\n/g, '\x0a');
        await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY, privatePEM, new Date(8640000000000000));
    
        let publicPEM = forge.pki.publicKeyToPem(self._publicKey);
        publicPEM = publicPEM.replace(/\\n/g, '\n');
        publicPEM = publicPEM.replace(/[\r]+/g, '');
        publicPEM = publicPEM.replace(/\n/g, '\x0a');
        await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY, publicPEM, new Date(8640000000000000));    

        endTime = performance.now();
        var timeDiff = endTime - startTime; //in ms 
        timeDiff /= 1000; // strip the ms
        var seconds = Math.round(timeDiff);

        self.logger.info('KeyPair Generation COMPLETE... elapsed[' + seconds + ' sec]');

        // if (typeof window !== 'undefined') {
        //   modalMsg.setProgress('KeyPair Generation COMPLETE... elapsed[' + seconds + ' sec]');

        //   modalMsg.setMessage('You may now REFRESH this browser window to load the application.');

        //   MicroModal.close('ziti-keypair-modal');
        // }

        resolve( true );
      }
    };

    setTimeout(step); // initiate async keypair generation
  });

}


/**
 * Wait for keypair generation to complete before returning
 * 
 * @params  {nothing}   
 * @returns {nothing}   
 */
 ZitiPKI.prototype.awaitKeyPairGenerationComplete = async function( bypassRenderingOfUI ) {

  let self = this;

  return new Promise( async (resolve, reject) => {

    let haveKeys = await self._haveKeypair();
    if (haveKeys) {
      self.logger.info('Pre-existing KeyPair found; skipping wait for keypair generation completion');
      resolve( false );
      return;
    }

    if (typeof window !== 'undefined') {

      if (bypassRenderingOfUI) {
        self.logger.info('bypassRenderingOfUI');
      } else {

        identityModalCSS.inject();
        keypairModalHTML.inject();
        MicroModal.init({
          onShow: modal => console.info(`${modal.id} is shown`), // [1]
          onClose: modal => console.info(`${modal.id} is hidden`), // [2]
          openTrigger: 'ziti-data-micromodal-trigger', // [3]
          closeTrigger: 'data-custom-close', // [4]
          openClass: 'is-open', // [5]
          disableScroll: true, // [6]
          disableFocus: false, // [7]
          awaitOpenAnimation: false, // [8]
          awaitCloseAnimation: true, // [9]
          debugMode: false // [10]
        });
      
        MicroModal.show('ziti-keypair-modal');

        modalMsg.setMessage('Please do not close this browser window.');

        modalMsg.setProgress('Zero-Trust KeyPair creation in progress.');
      }
    }


    (async function waitForKeyPairGenerationComplete() {
      let haveKeys = await self._haveKeypair();
      if (haveKeys) {
        MicroModal.close('ziti-keypair-modal');
        return resolve();
      }
      setTimeout(waitForKeyPairGenerationComplete, 200);
    })();      
    
  });
}
