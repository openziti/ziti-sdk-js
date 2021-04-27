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
let identityModalLogin;
let error;
if (typeof window !== 'undefined') {
MicroModal            = require('micromodal');
modalMsg              = require('../ui/identity_modal/keypair_generation_msg');
identityModalLogin    = require('./login');
error                 = require('./error');
}

const ZitiReporter          = require('../utils/ziti-reporter');
const ls                    = require('../utils/localstorage');
const defaultOptions        = require('./options');
const zitiConstants         = require('../constants');
let identityModalCSS;
let updbModalHTML;
if (typeof window !== 'undefined') {
identityModalCSS      = require('../ui/identity_modal/css');
updbModalHTML     = require('../ui/identity_modal/updb_prompt_html');
}


/**
 * Expose `ZitiUPDB`.
 */

module.exports = ZitiUPDB;

/**
 * Initialize a new `ZitiUPDB`.
 *
 * @api public
 */

function ZitiUPDB(obj) {
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
  for (const key in ZitiUPDB.prototype) {
    if (Object.prototype.hasOwnProperty.call(ZitiUPDB.prototype, key))
      obj[key] = ZitiUPDB.prototype[key];
  }

  return obj;
}


/**
 * Initialize the Ziti Context.
 * 
 * Tasks:
 * - validate options
 * - create logger if necessary
 *
 * @param {Object} [options]
 * @returns {nothing}   
 */
ZitiUPDB.prototype.init = async function(options) {

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


ZitiUPDB.prototype._haveCreds = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    let username = await ls.get(zitiConstants.get().ZITI_IDENTITY_USERNAME);
    let password  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PASSWORD);

    if (
      isNull( username ) || isUndefined( username ) ||
      isNull( password )  || isUndefined( password )
    ) {
      resolve( false );
    } else {
      self._loginFormValues = { username: username, password: password };
      resolve( true );
    }
  });

}

/**
 * Prompt the user for their creds
 * 
 * @params  {nothing}   
 * @returns {nothing}   
 */
ZitiUPDB.prototype.promptForCreds = async function() {

  let self = this;

  let haveKeys = await self._haveCreds();
  if (haveKeys) {
    self.logger.info('Pre-existing creds found; skipping prompt');
    return;
  }

  self.logger.info('Starting Creds Prompt');

  if (typeof window !== 'undefined') {

    if (!self.identityModalInjected) {
      identityModalCSS.inject();
      updbModalHTML.inject();
      self.identityModalInjected = true;
    }

    this._loginFormValues = undefined;
    identityModalLogin.injectButtonHandler( async function( results ) { 
      self._loginFormValues = results;
      self.logger.debug('Login Form cb(): results [%o]', results);
      await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_USERNAME, self._loginFormValues.username, new Date(8640000000000000));
      await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PASSWORD, self._loginFormValues.password, new Date(8640000000000000));
    });
  
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
  
    MicroModal.show('ziti-updb-modal');

    self.modalShown = true;
  }
}


/**
 * Return a Promise that will resolve as soon as we have acquired login creds from the UI.
 *
 * @returns {Promise}   
 */
ZitiUPDB.prototype.awaitLoginFormComplete = async function() {

  this.logger.debug('ZitiUPDB.awaitLoginFormComplete() starting');

  let self = this;

  return new Promise( async (resolve, reject) => {

    let haveKeys = await self._haveCreds();
    if (haveKeys) {
      self.logger.info('Pre-existing KeyPair found; skipping login form');
      return resolve(self._loginFormValues);
    }  
  
    this.promptForCreds();

    //TEMP
    // self._loginFormValues = { username: 'admin', password: 'admin' };    
    //TEMP

    (function waitForLoginFormComplete() {
      if (self._loginFormValues) {
        return resolve(self._loginFormValues);
      }
      self.logger.debug('ZitiUPDB.awaitLoginFormComplete() _loginFormValues still not present');
      setTimeout(waitForLoginFormComplete, 500);
    })();

  });
}


/**
 * Return a Promise that will resolve as soon as we have acquired login creds from the UI.
 *
 * @returns {Promise}   
 */
ZitiUPDB.prototype.closeLoginForm = async function() {
  if (this.modalShown) {
    MicroModal.close('ziti-updb-modal');
    this.modalShown = false;
  }
}