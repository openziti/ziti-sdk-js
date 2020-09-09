
const asn1js = require('asn1js');
const pkijs = require("pkijs");
const Certificate = pkijs.Certificate;



/**
 *	Convert base64 string to buffer
 *
 * @param {string} b64str
 */  
exports.base64StringToArrayBuffer = (b64str) => {
    let byteStr = atob(b64str);
    let bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) {
        bytes[i] = byteStr.charCodeAt(i);
    }
    return bytes.buffer;
}


/**
 *	Convert PEM string to binary
 *
 * @param {string} pem
 */  
exports.convertPemToBinary = (pem) => {
    var lines = pem.split('\n');
    var encoded = '';
    for(var i = 0;i < lines.length;i++){
        if (lines[i].trim().length > 0 &&
            lines[i].indexOf('-BEGIN RSA PRIVATE KEY-') < 0 && 
            lines[i].indexOf('-BEGIN RSA PUBLIC KEY-') < 0 &&
            lines[i].indexOf('-BEGIN PUBLIC KEY-') < 0 &&
            lines[i].indexOf('-BEGIN CERTIFICATE-') < 0 &&
            lines[i].indexOf('-BEGIN PRIVATE KEY-') < 0 &&
            lines[i].indexOf('-END PRIVATE KEY-') < 0 &&
            lines[i].indexOf('-END CERTIFICATE-') < 0 &&
            lines[i].indexOf('-END PUBLIC KEY-') < 0 &&
            lines[i].indexOf('-END RSA PRIVATE KEY-') < 0 &&
            lines[i].indexOf('-END RSA PUBLIC KEY-') < 0) {
            
            encoded += lines[i].trim();
        
        }
    }
    return exports.base64StringToArrayBuffer(encoded);
}
  

/**
 *	Convert buffer to Certificate
 *
 * @param {Buffer} certificateBuffer
 */  
exports.convertBinaryToCertificate = (certificateBuffer) => {
    let asn1 = asn1js.fromBER(certificateBuffer);
    if(asn1.offset === (-1)) {
        console.log("Can not parse binary data");
    } 
    const certificate = new Certificate({ schema: asn1.result });
    return certificate;
}
  

/**
 *	Convert PEM to Certificate
 *
 * @param {string} pem
 */  
exports.convertPemToCertificate = (pem) => {
    return exports.convertBinaryToCertificate( exports.convertPemToBinary(pem) );
}

/**
 *	Convert buffer to Certificate
 *
 * @param {string} pem
 */  
exports.printCertificate = (certificateBuffer) => {
    console.log(certificate);
    console.log('Certificate Serial Number');
    console.log('Certificate Issuance');
    console.log(certificate.notBefore.value.toString());
    console.log('Certificate Expiry');
    console.log(certificate.notAfter.value.toString());  
    console.log(certificate.issuer);
}


/**
 *	Return time (in millis) for when Certificate expires
 *
 * @param {Buffer} certificateBuffer
 */  
exports.getExpiryTimeFromCertificate = (certificate) => {
    return certificate.notAfter.toSchema().toDate().getTime();
}


/**
 *	Return time (human-readable) for when Certificate expires
 *
 * @param {Buffer} certificateBuffer
 */  
exports.getExpiryStringFromCertificate = (certificate) => {
    return certificate.notAfter.toSchema().toDate().toString();
}
