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
// const MicroModal            = require('micromodal');
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
const ZitiUPDB              = require('../updb/updb');
const error                 = require('../updb/error');
// const identityModalCSS      = require('../ui/identity_modal/css');
// const identityModalHTML     = require('../ui/identity_modal/html');
// const identityModalSelect   = require('../ui/identity_modal/select');
// const identityModalDragDrop = require('../ui/identity_modal/dragdrop');
// const identityModalLogin    = require('../ui/identity_modal/login');
// const error                 = require('../ui/identity_modal/error');
const zitiConstants         = require('../constants');
const ZitiControllerClient  = require('../context/controller-client');
const {throwIf}             = require('../utils/throwif');
const base64_url_decode     = require('./base64_url_decode');
const pkiUtil               = require('../utils/pki');
const Base64                = require('./base64');
const pjson                 = require('../../package.json');


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
  this.ctx = _options.ctx;
  this.logger = _options.logger;
}


/**
 * Injects and opens the Modal dialog that prompts for the JWT file.
 *
 */
ZitiEnroller.prototype.loadJWTFromFileSystem = async function() {

  let self = this;

  if (this._modalIsOpen) {
    return;
  }

  // this._rawJWT = await ls.getWithExpiry(zitiConstants.get().ZITI_JWT);

  // if (!isNull( this._rawJWT )) {
    // return this._rawJWT;
  // }

  /* below was moved to UPDB

  identityModalCSS.inject();
  identityModalHTML.inject();
  this._loginFormValues = undefined;
  identityModalLogin.injectButtonHandler(function( results ) { 
    self._loginFormValues = results;
    self.logger.debug('Login Form cb(): results [%o]', results);
  });
  // identityModalSelect.injectChangeHandler();
  // identityModalDragDrop.injectDragDropHandler();


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

  this._modalIsOpen = true;
  */
}


/**
 * Return a Promise that will resolve as soon as we have acquired login creds from the UI.
 *
 * @returns {Promise}   
 */
ZitiEnroller.prototype._awaitLoginFormComplete = async function() {

  this.logger.debug('enroll._awaitLoginFormComplete() starting');

  let self = this;

  this.loadJWTFromFileSystem();

  return new Promise((resolve, reject) => {

    //TEMP
    // self._loginFormValues = { username: 'admin', password: 'admin' };    
    //TEMP


    (function waitForJWTLoadFromFileSystemComplete() {
      if (self._loginFormValues) {
        return resolve(self._loginFormValues);
      }
      self.logger.debug('_awaitLoginFormComplete() _loginFormValues still not present');
      setTimeout(waitForJWTLoadFromFileSystemComplete, 500);
    })();

  });
}


/**
 * Return a Promise that will resolve as soon as we have gotten login creds from the UI and those creds 
 * have been used to successfully acquire an API session.
 *
 * @returns {Promise}   
 */
ZitiEnroller.prototype._awaitHaveAPISession = async function() {

  let self = this;

  return new Promise(async (resolve, reject) => {

    self.logger.debug('enroll._awaitHaveAPISession() starting');

    //
    let apisess = await ls.getWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN);
    if (!isNull(apisess)) {
      self.ctx._apiSession = apisess;
    }

    let updb = new ZitiUPDB(ZitiUPDB.prototype);
    await updb.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
  
    while (isUndefined( self.ctx._apiSession )) {

      // Don't proceed until we have gotten login creds from UI
      self._loginFormValues = await updb.awaitLoginFormComplete();  // await user creds input

      self.logger.debug('login Form submitted: creds are [%o]', self._loginFormValues);
    
      // Establish an API session with Controller
      await self.getAPISession( self ).catch( async (err) => {

        error.setMessage('ERROR: Invalid credentials');

        self._loginFormValues = undefined;

        await ls.removeItem( zitiConstants.get().ZITI_IDENTITY_USERNAME );
        await ls.removeItem( zitiConstants.get().ZITI_IDENTITY_PASSWORD );

        reject(err);

      });
    
    }

    self.logger.debug('API session acquired: token is [%o]', self.ctx._apiSession.token);

    resolve();

  });
}


/**
 * 
 *
 */
ZitiEnroller.prototype.enroll = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    self.logger.debug('enroll() starting');

    let publicKey = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY);
    let privateKey = await ls.getWithExpiry(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);

    // If there is no keypair currently in the browZer, then something is wrong
    if (
      isNull( publicKey ) || isUndefined( publicKey ) ||
      isNull( privateKey )  || isUndefined( privateKey )
    ) {
      return reject('no keypair found!');
    }

    // Don't proceed until we have successfully logged in to Controller and have established an API session
    await ziti._ctx.ensureAPISession();
    
    this._publicKey  = forge.pki.publicKeyFromPem( publicKey );
    this._privateKey = forge.pki.privateKeyFromPem( privateKey);

    this.generateCSR();

    await this.createEphemeralCert();

    resolve();
  });
}

// ZitiEnroller.prototype._dismissModal = function() {
  // MicroModal.close('ziti-updb-modal');
  // this._modalIsOpen = false;
// }


/**
 * 
 *
 */
ZitiEnroller.prototype.getAPISession = async function( who ) {

  // error.setProgress('Transmitting Authenticate Request');

  let self = who;

  return new Promise( async (resolve, reject) => {

    // Get an API session with Controller
    let res = await self.ctx._controllerClient.authenticate({

      method: 'password',

      body: { 

        username: self._loginFormValues.username,
        password: self._loginFormValues.password,

        configTypes: [
          'ziti-tunneler-client.v1'
        ],

        envInfo: {
          arch: window.navigator.platform,    // e.g. 'MacIntel'
          os: window.navigator.appVersion,    // e.g. '5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
        },
        sdkInfo: {
          // branch: "string",
          // revision: "string",
          type: 'ziti-sdk-js',
          version: pjson.version
        },
      }
    });

    if (!isUndefined(res.error)) {
      self.logger.error(res.error.message);
      // error.setMessage('ERROR: ' + res.error.message);
      // error.setProgress('');
      reject(res.error.message);
      return;
    }

    self.ctx._apiSession = res.data;
    self.logger.debug('Controller API Session established: [%o]', self.ctx._apiSession);

    // Set the token header on behalf of all subsequent Controller API calls
    self.ctx._controllerClient.setApiKey(self.ctx._apiSession.token, 'zt-session', false);

    //
    await ls.setWithExpiry(zitiConstants.get().ZITI_API_SESSION_TOKEN, self.ctx._apiSession, new Date(8640000000000000));

    resolve()

  });
}


/**
 * 
 */
ZitiEnroller.prototype.createEphemeralCert = async function() {

  let self = this;

  return new Promise( async (resolve, reject) => {

    res = await self.ctx._controllerClient.createCurrentApiSessionCertificate({
      body: { 
        csr:  this._csr
      }
    });

    if (!isUndefined(res.error)) {
      this.logger.error(res.error.message);
      // error.setMessage('ERROR: Ephemeral Cert creation failed - ' + res.error.message);
      reject(res.error.message);
      return;
    }

    if (isUndefined(res.data.certificate)) {
      this.logger.error('cert not returned in response from detailCurrentApiSessionCertificate');
      // error.setMessage('ERROR: Ephemeral Cert creation failed');
      reject('Ephemeral Cert creation failed');
      return;
    }

    let certPEM = res.data.certificate;
    certPEM = certPEM.replace(/\\n/g, '\n');
    certPEM = certPEM.replace(/[\r]+/g, '');
    certPEM = certPEM.replace(/\n/g, '\x0a');

    let flatcert = certPEM.replace(/\\n/g, '\n');

    let certificate;
    try {
      certificate = pkiUtil.convertPemToCertificate( flatcert );
      pkiUtil.printCertificate( certificate );
    } catch (err) {
      self.logger.error('controllerClient.createCurrentApiSessionCertificate returned cert [%o] which pkiUtil.convertPemToCertificate cannot process', certPEM);
      reject('controllerClient.createCurrentApiSessionCertificate returned cert which pkiUtil.convertPemToCertificate cannot process');
    }

    let expiryTime = pkiUtil.getExpiryTimeFromCertificate(certificate);
    let expiryDate = new Date(expiryTime);

    self.logger.debug('controllerClient.createCurrentApiSessionCertificate returned cert with expiryTime: [%o] expiryDate:[%o]', expiryTime, expiryDate);

    await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT, certPEM, expiryTime);
    
    resolve()

  });
}


/**
 * 
 *
 */
ZitiEnroller.prototype.enrollOTF = async function() {

  // error.setProgress('Transmitting Enroll Request');

  let self = this;

  return new Promise( async (resolve, reject) => {

    /*
    let controllerClient = new ZitiControllerClient({
      domain: window.zitiConfig.controller.api, // set in HTML of web app that embeds ziti-sdk-js
      logger: self.logger
    });

    // Get an API session with Controller
    let res = await controllerClient.authenticate({

      method: 'password',

      body: { 

        username: self._loginFormValues.username,
        password: self._loginFormValues.password,

        envInfo: {
          arch: window.navigator.platform,    // e.g. 'MacIntel'
          os: window.navigator.appVersion,    // e.g. '5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
        },
        sdkInfo: {
          // branch: "string",
          // revision: "string",
          type: 'ziti-sdk-js',
          version: pjson.version
        },
      }
    });
    if (!isUndefined(res.error)) {
      this.logger.error(res.error.message);
      reject(res.error.message);
      return;
    }
    this._apiSession = res.data;
    this.logger.debug('Controller API Session established: [%o]', this._apiSession);

    // Set the token header on behalf of all subsequent Controller API calls
    controllerClient.setApiKey(this._apiSession.token, 'zt-session', false);
    */
    

    let certPEM;

    // Enroll the Identity
    res = await self.ctx._controllerClient.enrollOtf({
      method: 'otf',
      username: self._loginFormValues.username,
      // token: this._decoded_jwt.jti,
      body:  this._csr
    });
    if (!isUndefined(res.error)) {
      this.logger.error(res.error.message);
      // error.setMessage('ERROR: Enrollment failed - ' + res.error.message);
      reject(res.error.message);
      return;
    }
    // error.setProgress('OTF Enrollment SUCCEEDED - This dialog will auto-dismiss in a few seconds');

    certPEM = res.data.cert;

    let flatcert = certPEM.replace(/\\n/g, '\n');

    let certificate;
    try {
      certificate = pkiUtil.convertPemToCertificate( flatcert );
    } catch (err) {
      self.logger.error('controllerClient.enroll returned cert [%o] which pkiUtil.convertPemToCertificate cannot process', certPEM);
      reject('controllerClient.enroll returned cert which pkiUtil.convertPemToCertificate cannot process');
    }

    let expiryTime = pkiUtil.getExpiryTimeFromCertificate(certificate);
    await ls.setWithExpiry(zitiConstants.get().ZITI_EXPIRY_TIME, expiryTime, expiryTime);

    self.logger.trace('controllerClient.enroll returned cert: [%o] with expiryTime: [%o]', certPEM, expiryTime);

    // let pk = forge.pki.privateKeyToPem(self._privateKey);
    // pk = pk.replaceAll(/\\n/g, '\n');
    // pk = pk.replaceAll('\r', '');
    // await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY, pk, expiryTime);

    await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_CERT, certPEM, expiryTime);

    // let flatca = self._certChain.replaceAll(/\\n/g, '\n');
    // flatca = flatca.replaceAll('\r', '');
    // await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_CA, flatca, expiryTime);

    // await ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER, self._decoded_jwt.iss, expiryTime);
    await ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER, window.zitiConfig.controller.api, expiryTime);

    // Get Controller protocols info
    res = await self.ctx._controllerClient.listProtocols();
    self.logger.trace('controllerClient.listProtocols returned: [%o]', res);
    if (isUndefined(res.data.ws)) {
      reject('controllerClient.listProtocols data contains no "ws" section');
    }
    if (isUndefined(res.data.ws.address)) {
      reject('controllerClient.listProtocols "ws" section contains no "address');
    }
    await ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER_WS, 'ws://' + res.data.ws.address , expiryTime);

    resolve()

  });
}


/**
 * 
 *
 */
/*
ZitiEnroller.prototype.enrollOTT = async function() {

  // error.setProgress('Transmitting Enroll Request');

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
      // error.setMessage('ERROR: Enrollment failed - ' + json.error.message);
      // error.setProgress();
      reject(json);
      return;
    } else {
      // error.setProgress('Enrollment SUCCEEDED - This dialog will auto-dismiss in a few seconds');
      let blob = await response.blob();
      certPEM = await blob.text();
    }  

    let flatcert = certPEM.replace(/\\n/g, '\n');

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
    ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY, pk, expiryTime);

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
*/


/**
 * Loads the JWT from local storage.
 *
 */
ZitiEnroller.prototype.loadJWTFromLocalStorage = async function() {

  this._rawJWT = await ls.getWithExpiry(zitiConstants.get().ZITI_JWT);

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

  // error.setProgress('starting fetch of Controller well-known certs');

  let self = this;

  return new Promise( async (resolve, reject) => {

    let controllerClient = new ZitiControllerClient({
      domain: window.zitiConfig.controller.api, // set in HTML of web app that embeds ziti-sdk-js
      logger: self.logger
    });

    // Get Controller's well-known certs
    self._wellKnownCerts = await controllerClient.listWellKnownCas()
    self.logger.trace('Controller well-known certs: [%o]', self._wellKnownCerts);

    // error.setProgress('Controller well-known certs obtained');

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

  // error.setProgress('Starting KeyPair Generation');
  console.log('Starting KeyPair Generation');

  let self = this;

  return new Promise( async (resolve, reject) => {

    // Generate an RSA key pair in steps.
    // We run for a few ms at a time on the main JS thread, so as not to completely block JS execution in browser.
    var state = forge.pki.rsa.createKeyPairGenerationState( privateKeySize );

    var step = async function() {

      if(!forge.pki.rsa.stepKeyPairGenerationState( state, 100 )) {

        // self.logger.trace('keypair generation tick... [%o]', state);
        console.log('keypair generation tick... ', state);

        if ((tick++ % 20) == 0) {
          // error.setProgress('Generating keypair for your Identity, please stand by... progress[' + tick + ']');
        }

        setTimeout(step, 1);
      
      } else {

        self._privateKey = state.keys.privateKey
        self._publicKey = state.keys.publicKey

        let privatePEM = forge.pki.privateKeyToPem(self._privateKey);
        privatePEM = privatePEM.replace(/\\n/g, '\n');
        privatePEM = privatePEM.replace('\r', '');
        await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY, privatePEM, new Date(8640000000000000));
    
        let publicPEM = forge.pki.publicKeyToPem(self._publicKey);
        publicPEM = publicPEM.replace(/\\n/g, '\n');
        publicPEM = publicPEM.replace('\r', '');
        await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY, publicPEM, new Date(8640000000000000));    

        // error.setProgress('KeyPair Generation Complete');
        console.log('KeyPair Generation Complete');

        resolve(state.keys)
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
      // value: this._decoded_jwt.sub
      value: 'OTF'
    // }, {
    //   name: 'description',
    //   // value: this._decoded_jwt.iss
    //   value: 'OTF CSR'
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
  
  this.logger.debug('generateCSR results [%o]', this._csr);
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
