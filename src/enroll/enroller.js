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
const MicroModal            = require('micromodal');
const isEqual               = require('lodash.isequal');
const isUndefined           = require('lodash.isundefined');
const forEach               = require('lodash.foreach');
const formatMessage         = require('format-message');
const jwt_decode            = require('jwt-decode');
const forge                 = require('node-forge');
const pkijs                 = require("pkijs");
const asn1js                = require('asn1js');
const isNull                = require('lodash.isnull');

var asn1 = forge.asn1;

const ls                    = require('../utils/localstorage');
const defaultOptions        = require('./options');
const identityModalCSS      = require('../ui/identity_modal/css');
const identityModalHTML     = require('../ui/identity_modal/html');
const identityModalSelect   = require('../ui/identity_modal/select');
const identityModalDragDrop = require('../ui/identity_modal/dragdrop');
const error                 = require('../ui/identity_modal/error');
const zitiConstants         = require('../constants');
const ZitiControllerClient  = require('../context/controller-client');
const {throwIf}             = require('../utils/throwif');
const base64_url_decode     = require('./base64_url_decode');
const pkiUtil               = require('../utils/pki');
const Base64                = require('./base64');


/**
 * Expose `ZitiEnroller`.
 */

module.exports = ZitiEnroller;

/**
 * Initialize a new `ZitiEnroller`.
 *
 * @api public
 */

function ZitiEnroller(obj) {
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
  for (const key in ZitiEnroller.prototype) {
    if (Object.prototype.hasOwnProperty.call(ZitiEnroller.prototype, key))
      obj[key] = ZitiEnroller.prototype[key];
  }

  return obj;
}


/**
 * Initialize the Ziti Enroller.
 * 
 * @param {Object} [options]
 * @returns {nothing}   
 */
ZitiEnroller.prototype.init = async function(options) {
  let _options = flatOptions(options, defaultOptions);
  this.logger = _options.logger;
}


/**
 * Injects and opens the Modal dialog that prompts for the JWT file.
 *
 */
ZitiEnroller.prototype.loadJWTFromFileSystem = async function() {

  this._rawJWT = ls.getWithExpiry(zitiConstants.get().ZITI_JWT);

  if (!isNull( this._rawJWT )) {
    return this._rawJWT;
  }

  identityModalCSS.inject();
  identityModalHTML.inject();
  identityModalSelect.injectChangeHandler();
  identityModalDragDrop.injectDragDropHandler();


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

  MicroModal.show('modal-1');

  this._modalIsOpen = true;
}


/**
 * Return a Promise that will resolve as soon as we have read in the JWT from file system.
 *
 * @returns {Promise}   
 */
ZitiEnroller.prototype._awaitJWTLoadFromFileSystemComplete = async function() {

  let self = this;

  this.loadJWTFromFileSystem();

  return new Promise((resolve, reject) => {
    let startTime = new Date();
    (function waitForJWTLoadFromFileSystemComplete() {
      self._rawJWT = ls.getWithExpiry(zitiConstants.get().ZITI_JWT);
      if (self._rawJWT) {
        // if (self._modalIsOpen) {
        //   MicroModal.close('modal-1');
        //   self._modalIsOpen = false;
        // }
        return resolve(self._rawJWT);
      }
      self.logger.debug('_awaitJWTLoadFromFileSystemComplete() JWT still not loaded');
      let now = new Date();
      let elapsed = now.getTime() - startTime.getTime();
      if (elapsed > 1000*60) {
        return reject('JWT not specified');
      } else {
        setTimeout(waitForJWTLoadFromFileSystemComplete, 500);
      }
    })();
  });
}


/**
 * Loads the JWT from local storage.
 *
 */
ZitiEnroller.prototype.enroll = async function() {

  this._rawJWT = await this._awaitJWTLoadFromFileSystemComplete().catch((err) => {
    this.logger.error(err);
    throw err;
  });
  this.logger.debug('JWT loaded: [%o]', this._rawJWT);

  this.loadJWTFromLocalStorage();

  let keyPairPromise = this.generateKeyPair();  // initiate the (async) keypair calculation

  await this.getWellKnownCerts();

  this.parsePKCS7();

  await keyPairPromise; // Don't proceed until keypair calculation has completed

  this.generateCSR();

  await this.enrollOTT();

  setTimeout(this._dismissModal, 5000);

}

ZitiEnroller.prototype._dismissModal = function() {
  MicroModal.close('modal-1');
  this._modalIsOpen = false;
}

/**
 * 
 *
 */
ZitiEnroller.prototype.enrollOTT = async function() {

  error.setProgress('Transmitting Enroll Request');

  let self = this;

  return new Promise( async (resolve, reject) => {

    let controllerClient = new ZitiControllerClient({
      domain: self._decoded_jwt.iss,
      logger: self.logger
    });

    let certPEM;

    // Enroll the Identity
    let response = await controllerClient.enroll({
      method: 'ott',
      token: this._decoded_jwt.jti,
      body:  this._csr
    });

    if (!response.ok) {
      let json = await response.json();
      error.setMessage('ERROR: Enrollment failed - ' + json.error.message);
      error.setProgress();
      reject(json);
      return;
    } else {
      error.setProgress('Enrollment SUCCEEDED - This dialog will auto-dismiss in a few seconds');
      debugger
      let blob = await response.blob();
      certPEM = await blob.text();
    }  

    let flatcert = certPEM.replaceAll(/\\n/g, '\n');

    let certificate;
    try {
      certificate = pkiUtil.convertPemToCertificate( flatcert );
    } catch (err) {
      self.logger.error('controllerClient.enroll returned cert [%o] which pkiUtil.convertPemToCertificate cannot process', certPEM);
      reject('controllerClient.enroll returned cert which pkiUtil.convertPemToCertificate cannot process');
    }

    let expiryTime = pkiUtil.getExpiryTimeFromCertificate(certificate);

    self.logger.trace('controllerClient.enroll returned cert: [%o] with expiryTime: [%o]', certPEM, expiryTime);

    let pk = forge.pki.privateKeyToPem(self._privateKey);
    pk = pk.replaceAll(/\\n/g, '\n');
    pk = pk.replaceAll('\r', '');
    ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_KEY, pk, expiryTime);

    ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT, certPEM, expiryTime);

    let flatca = self._certChain.replaceAll(/\\n/g, '\n');
    flatca = flatca.replaceAll('\r', '');
    ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_CA, flatca, expiryTime);

    ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER, self._decoded_jwt.iss, expiryTime);

    // Get Controller protocols info
    let res = await controllerClient.listProtocols();
    self.logger.trace('controllerClient.listProtocols returned: [%o]', res);
    if (isUndefined(res.data.ws)) {
      reject('controllerClient.listProtocols data contains no "ws" section');
    }
    if (isUndefined(res.data.ws.address)) {
      reject('controllerClient.listProtocols "ws" section contains no "address');
    }
    ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER_WS, 'ws://' + res.data.ws.address , expiryTime);

    resolve()

  });
}


/**
 * Loads the JWT from local storage.
 *
 */
ZitiEnroller.prototype.loadJWTFromLocalStorage = async function() {

  this._rawJWT = ls.getWithExpiry(zitiConstants.get().ZITI_JWT);

  this._decoded_jwt = jwt_decode(this._rawJWT);
  this.logger.debug('decoded JWT: %o', this._decoded_jwt);

  this._jwt_sig = this._rawJWT.split(".")[2];
  this.logger.debug('JWT Signature: %o', this._jwt_sig);

  this._jwt_sig_decoded = base64_url_decode(this._jwt_sig);
  this.logger.debug('JWT Signature (decoded): %o', this._jwt_sig_decoded);

}


/**
 * 
 *
 */
ZitiEnroller.prototype.getWellKnownCerts = async function() {

  error.setProgress('starting fetch of Controller well-known certs');

  let self = this;

  return new Promise( async (resolve, reject) => {

    let controllerClient = new ZitiControllerClient({
      domain: self._decoded_jwt.iss,
      logger: self.logger
    });

    // Get Controller's well-known certs
    self._wellKnownCerts = await controllerClient.listWellKnownCas()
    self.logger.trace('Controller well-known certs: [%o]', self._wellKnownCerts);

    error.setProgress('Controller well-known certs obtained');

    resolve()

  });
}


/**
 * 
 *
 */
ZitiEnroller.prototype.parsePKCS7 = function() {

  let self = this;

  this._base64DecodedPkcs7 = Base64.decode(this._wellKnownCerts);
  this.logger.trace('base64_decoded_pkcs7: [%o]', this._base64DecodedPkcs7);

  let decoded_asn1 = asn1js.fromBER( this._base64DecodedPkcs7.buffer );
  this.logger.trace('asn1: [%o]', asn1);

  let decoded_sequence = decoded_asn1.result;
  let valueArray = decoded_sequence.valueBlock.value;
  throwIf(!isEqual(valueArray.length, 2), formatMessage('Should be 2 elements', { }) );

  let pkcs7_signedData_OID = valueArray[0];
  this.logger.trace('pkcs7_signedData_OID: [%o]', pkcs7_signedData_OID);

  let OID_PKCS7_SIGNED_DATA = new Uint8Array( [6, 9, 42, 134, 72, 134, 247, 13, 1, 7, 2] );
  throwIf(!isEqual(OID_PKCS7_SIGNED_DATA.buffer, pkcs7_signedData_OID.valueBeforeDecode), formatMessage('invalid pkcs7 signed data', { }) );

  valueArray = valueArray[1].valueBlock.value;
  throwIf(!isEqual(valueArray.length, 1), formatMessage('Should be 1 elements', { }) );

  valueArray = valueArray[0].valueBlock.value;
  throwIf(!isEqual(valueArray.length, 6), formatMessage('Should be 6 elements', { }) );

  let pkcs7_Data_OID = valueArray[2].valueBlock.value[0];
  this.logger.trace('pkcs7_Data_OID: [%o]', pkcs7_Data_OID);

  let OID_PKCS7_DATA = new Uint8Array( [6, 9, 42, 134, 72, 134, 247, 13, 1, 7, 1] );
  throwIf(!isEqual(OID_PKCS7_DATA.buffer, pkcs7_Data_OID.valueBeforeDecode), formatMessage('invalid pkcs7 data', { }) );
  
  const cmsContentSimpl = new pkijs.ContentInfo({ schema: decoded_asn1.result }); 
  const cmsSignedSimpl  = new pkijs.SignedData({ schema: cmsContentSimpl.content })

  let certArray = cmsSignedSimpl.certificates;
  this.logger.trace('certArray: [%o]', certArray);

  this._certChain = "";

  forEach(certArray, function(cert) {

    self._certChain += self.convertBinaryToPem(cert.toSchema(true).toBER(false), "CERTIFICATE");

  });

  this.logger.trace('certChain: [%o]', this._certChain);
}


ZitiEnroller.prototype.generateKeyPair = async function() {

  let privateKeySize = 4096;

  let tick = 1;

  error.setProgress('Starting KeyPair Generation');

  let self = this;

  return new Promise( async (resolve, reject) => {

    // Generate an RSA key pair in steps.
    // We run for on 100ms at a time on the main JS thread, so as not to completely block JS execution in browser.
    var state = forge.pki.rsa.createKeyPairGenerationState( privateKeySize );

    var step = function() {

      if(!forge.pki.rsa.stepKeyPairGenerationState(state, 1000)) {

        self.logger.trace('keypair generation tick... [%o]', state);

        error.setProgress('Generating keypair for your Identity, please stand by... progress[' + tick++ + ']');

        setTimeout(step, 1);
      
      } else {

        self._privateKey = state.keys.privateKey
        self._publicKey = state.keys.publicKey

        error.setProgress('KeyPair Generation Complete');

        resolve()
      }
    };

    setTimeout(step); // initiate async keypair generation
  });

}



ZitiEnroller.prototype.generateCSR = function(binaryData, label) {

  var csr = forge.pki.createCertificationRequest();

  csr.publicKey = this._publicKey;
  
  csr.setSubject([
    {
      name: 'commonName',
      value: this._decoded_jwt.sub
    }, {
      name: 'description',
      value: this._decoded_jwt.iss
    }, {
      name: 'countryName',
      value: 'US'
    }, {
      shortName: 'ST',
      value: 'NC'
    }, {
      name: 'organizationName',
      value: 'OpenZiti'
    }
  ]);

  csr.sign(this._privateKey);

  var verified = csr.verify();
  throwIf(!verified, formatMessage('csr.verify failed', { }) );

  this._csr = forge.pki.certificationRequestToPem(csr);
  
}


ZitiEnroller.prototype.convertBinaryToPem = function(binaryData, label) {

  var base64Cert = this.arrayBufferToBase64String(binaryData);

  var pemCert = "-----BEGIN " + label + "-----\r\n";

  var nextIndex = 0;
  var lineLength;
  while (nextIndex < base64Cert.length) {
      if (nextIndex + 64 <= base64Cert.length) {
          pemCert += base64Cert.substr(nextIndex, 64) + "\r\n";
      } else {
          pemCert += base64Cert.substr(nextIndex) + "\r\n";
      }
      nextIndex += 64;
  }

  pemCert += "-----END " + label + "-----\r\n";
  return pemCert;
}


ZitiEnroller.prototype.arrayBufferToBase64String = function(arrayBuffer) {

  var byteArray = new Uint8Array(arrayBuffer)
  var byteString = '';

  for (var i=0; i<byteArray.byteLength; i++) {
      byteString += String.fromCharCode(byteArray[i]);
  }

  return btoa(byteString);
}
