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
let identityModalKeypairDirectory;
let error;
if (typeof window !== 'undefined') {
MicroModal            = require('micromodal');
modalMsg              = require('../ui/identity_modal/keypair_generation_msg');
identityModalLogin    = require('./login');
identityModalKeypairDirectory    = require('./keypairDirectory');
error                 = require('./error');
}

const ZitiReporter          = require('../utils/ziti-reporter');
const ls                    = require('../utils/localstorage');
const defaultOptions        = require('./options');
const zitiConstants         = require('../constants');
let identityModalCSS;
let updbModalHTML;
let updbKeypairDirectoryModalHTML;
if (typeof window !== 'undefined') {
identityModalCSS      = require('../ui/identity_modal/css');
updbModalHTML     = require('../ui/identity_modal/updb_prompt_html');
updbKeypairDirectoryModalHTML     = require('../ui/identity_modal/updb_prompt_keypairDirectory_html');
reloadingpageModalHTML = require('../ui/identity_modal/reloading_page_html');
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


ZitiUPDB.prototype._haveKeypair = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    // Obtain the keypair from IndexedDb
    let publicKey  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY);
    let privateKey = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);

    if (
      isNull( publicKey ) || isUndefined( publicKey ) ||
      isNull( privateKey )  || isUndefined( privateKey )
    ) {
      resolve( false );
    } else {
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

      // Save the username/password, but ensure it vanishes in 5 minutes
      let expiry = new Date();
      expiry.setMinutes(expiry.getMinutes()+5);
      await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_USERNAME, self._loginFormValues.username, expiry );
      await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PASSWORD, self._loginFormValues.password, expiry );

      // if we're restarting with updb, then purge any existing API session & cert
      await ls.removeItem( zitiConstants.get().ZITI_API_SESSION_TOKEN );
      await ls.removeItem( zitiConstants.get().ZITI_CLIENT_CERT_PEM );  
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
 * Prompt the user for a dir to save keypair into
 * 
 * @params  {nothing}   
 * @returns {nothing}   
 */
 ZitiUPDB.prototype.promptForKeypairDirectory = async function( source ) {

  let self = this;
  let text;
  if (source === zitiConstants.get().ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_FS) {
    text = 'Select Folder for Keypair storage.';
  } else if (source === zitiConstants.get().ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_IDB) {
    text = 'New KeyPair generation is complete.<br/><br/>Select Folder to write new Keypair into.';
  } else {
    text = 'huh?';
  }

  self.logger.info('Starting keypairDirectory Prompt');

  if (typeof window !== 'undefined') {

    // if (!self.keypairDirectoryModalInjected) {
      identityModalCSS.inject();
      updbKeypairDirectoryModalHTML.inject( text );
      // self.keypairDirectoryModalInjected = true;
    // }

    this._keypairPresent = undefined;
    identityModalKeypairDirectory.injectButtonHandler( self, source, async function( result ) { 
      self._keypairPresent = result;
      self.logger.debug('keypairDirectory Form cb(): results [%o]', self._keypairPresent);

      MicroModal.close('ziti-updb-modal-keypairDirectory');
      self.modalShown = false;
  
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
  
    MicroModal.show('ziti-updb-modal-keypairDirectory');

    self.modalShown = true;
  }
}


/**
 * Display 'Reloading Page'
 * 
 * @params  {nothing}   
 * @returns {nothing}   
 */
 ZitiUPDB.prototype.relodingPage = function() {

  let self = this;

  if (typeof window !== 'undefined') {

    identityModalCSS.inject();
    reloadingpageModalHTML.inject();
  
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
  
    MicroModal.show('ziti-reloadingpage-modal');
  }
}


/**
 * Prompt the user for their creds
 * 
 * @params  {nothing}   
 * @returns {nothing}   
 */
ZitiUPDB.prototype.closeLoginForm = function() {

  if (this.modalShown) {
    MicroModal.close('ziti-updb-modal');
    this.modalShown = false;
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

    self._loginFormValues = undefined;
  
    self.promptForCreds();

    (function waitForLoginFormComplete() {
      if (self._loginFormValues) {
        return resolve(self._loginFormValues);
      }
      self.logger.trace('ZitiUPDB.awaitLoginFormComplete() _loginFormValues still not present');
      setTimeout(waitForLoginFormComplete, 250);
    })();

  });
}


/**
 * Return a Promise that will resolve as soon as we have acquired login creds from the UI
 * that are acceptable to the Ziti Controller.
 *
 * @returns {Promise}   
 */
 ZitiUPDB.prototype.awaitCredentialsAndAPISession = async function() {

  this.logger.debug('ZitiUPDB.awaitCredentialsAndAPISession() starting');

  let self = this;

  return new Promise( async (resolve, reject) => {

    // Remain in this loop until the creds entered on login form are acceptable to the Ziti Controller
    do {
      let loginFormValues = await self.awaitLoginFormComplete();  // await user creds input

      self.ctx.setLoginFormValues( loginFormValues );

      validCreds = await self.ctx.getFreshAPISession();

      if (!validCreds) {
        error.setMessage('ERROR: Invalid credentials');
      }
    } while ( !validCreds );

    this.logger.debug('ZitiUPDB.awaitCredentialsAndAPISession() now have valid creds, closing login form');

    self.closeLoginForm();

    resolve();

  });
}


/**
 * Return a Promise that will resolve as soon as we have acquired keypair dir location from the UI.
 *
 * @returns {Promise}   
 */
 ZitiUPDB.prototype.awaitKeypair = async function( source ) {

  this.logger.debug('ZitiUPDB.awaitKeypair() starting');

  let self = this;

  return new Promise( async (resolve, reject) => {

    self._keypairPresent = undefined;
  
    self.promptForKeypairDirectory( source );

    (function waitForKeypairDirectoryFormComplete() {

      if (self._keypairPresent == zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY_FILE_NOT_FOUND ) {
        return resolve( zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY_FILE_NOT_FOUND );
      }
      if (self._keypairPresent == zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY_FILE_NOT_FOUND ) {
        return resolve( zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY_FILE_NOT_FOUND );
      }
      if (self._keypairPresent == zitiConstants.get().ZITI_IDENTITY_KEYPAIR_FOUND ) {
        return resolve( zitiConstants.get().ZITI_IDENTITY_KEYPAIR_FOUND );
      }

      self.logger.trace('ZitiUPDB.awaitLoginFormComplete() _keypairPresent still not true');
      setTimeout(waitForKeypairDirectoryFormComplete, 500);

    })();

  });
}
