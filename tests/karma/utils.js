var ASSERT = require('assert');
var UTILS = require('../../src/utils/utils');


(function() {

  // custom assertion to test array-like objects
  function assertArrayEqual(actual, expected) {
    ASSERT.equal(actual.length, expected.length);
    for(var idx = 0; idx < expected.length; idx++) {
      ASSERT.equal(actual[idx], expected[idx]);
    }
  }

    describe('util', function() {
   
        it('should parse a URL', function() {
          var parsedUrl = UTILS.parseURL( 'https://somewhere.ziti:1234/the/path?foo=bar' );
          ASSERT.equal(parsedUrl.protocol, 'https:');    
          ASSERT.equal(parsedUrl.host, 'somewhere.ziti:1234');    
          ASSERT.equal(parsedUrl.hostname, 'somewhere.ziti');    
          ASSERT.equal(parsedUrl.port, 1234);    
          ASSERT.equal(parsedUrl.pathname, '/the/path');    
          ASSERT.equal(parsedUrl.search, '?foo=bar');          
        });

    });

})();
