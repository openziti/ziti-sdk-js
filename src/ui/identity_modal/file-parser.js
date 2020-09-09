
const ls = require('../../utils/localstorage');
const pkiUtil = require('../../utils/pki');
const zitiConstants = require('../../constants');
const error = require('./error');

let ztAPI;
let certPEM;

let chunkSize = 100;

let state_need_ztAPI      = true;
let state_need_certStart  = true;
let state_need_certEnd    = true;


/**
 *	Parse the selected identity.json file and save data we need to local storage
 *
 * @param {File} file
 */  
exports.parse = (file) => {
  var fileSize   = file.size;
  var offset     = 0;
  var self       = this; // we need a reference to the current object
  var chunkReaderBlock = null;

  var readEventHandler = function(evt) {
      if (evt.target.error == null) {
          offset += evt.target.result.length;
          receiveFileChunk(evt.target.result); // callback for handling read chunk
      } else {
          console.error("Read error: " + evt.target.error);
          return;
      }
      if (offset >= fileSize) {
          receiveEOF(); // callback for handling EOF
          return;
      }

      // off to the next chunk
      chunkReaderBlock(offset, chunkSize, file);
  }

  chunkReaderBlock = function(_offset, length, _file) {
      var r = new FileReader();
      var blob = _file.slice(_offset, length + _offset);
      r.onload = readEventHandler;
      r.readAsText(blob);
  }

  // now let's start the read with the first block
  chunkReaderBlock(offset, chunkSize, file);
}


/**
 *	Parse the ztAPI from the chunk
 *
 * @param {string} chunk
 */  
function extract_ztAPI(chunk) {
  let re = /^.*\"ztAPI\"\:.*\"(.*)\"/gm;
  let matches = re.exec(chunk);
  if (matches != null) {
    ztAPI = matches[1];
    state_need_ztAPI = false;
  }
}


/**
 *	Parse the (start of the) cert from the chunk
 *
 * @param {string} chunk
 */  
function extract_certStart(chunk) {
  let re = /^.*\"cert\"\:.*\"pem:(.*)/gm;
  let matches = re.exec(chunk);
  if (matches != null) {
    certPEM = matches[1];
    state_need_certStart = false;
  }
}


/**
 *	Parse the (rest of the) cert from the chunk
 *
 * @param {string} chunk
 */  
function extract_certEnd(chunk) {
  let re = /^(.*)".*\}\,/s;
  let matches = re.exec(chunk);
  if (matches == null) {
    certPEM += chunk;
  } else {
    certPEM += matches[1];
    state_need_certEnd = false;
  }
}


/**
 *	Dispatch the chunk depending on state of the parser
 *
 * @param {string} chunk
 */  
function receiveFileChunk(chunk) {
  if (state_need_ztAPI) {
    extract_ztAPI(chunk);
    return;
  }
  if (state_need_certStart) {
    extract_certStart(chunk);
    return;
  }
  if (state_need_certEnd) {
    extract_certEnd(chunk);
  }
}


/**
 *	Process results of parsing
 *
 * @param {string} chunk
 */  
function receiveEOF() {
  if (state_need_ztAPI) {
    error.setMessage('No value for [ztAPI] found in selected file');
    return;
  }
  if (state_need_certEnd) {
    error.setMessage('No value for [cert] found in selected file');
    return;
  }

  let cert;
  try {
    cert = pkiUtil.convertPemToCertificate( certPEM.replace(/\\n/g, '\n') );
  } catch (err) {
    error.setMessage('[cert] in selected file cannot be parsed');
    return;
  }

  ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER, ztAPI, pkiUtil.getExpiryTimeFromCertificate(cert));
  ls.setWithExpiry(zitiConstants.get().ZITI_CONTROLLER+'_dbg', ztAPI, pkiUtil.getExpiryStringFromCertificate(cert));
}

