var assert = require('assert');
var UTILS = require('../../src/utils/utils');


(function() {

  // custom assertion to test array-like objects
  function assertArrayEqual(actual, expected) {
    assert.equal(actual.length, expected.length);
    for(var idx = 0; idx < expected.length; idx++) {
      assert.equal(actual[idx], expected[idx]);
    }
  }

    describe('util', function() {

        it('should succeed', () => {
          assert.ok(true);
        });


        it('should append buffers', function() {
          var buffer1 = Buffer.from('1234', 'utf8');
          var buffer2 = Buffer.from('5678', 'utf8');
          var buffer3 = UTILS.appendBuffer(buffer1, buffer2);
          assert.equal(buffer3.byteLength, 8);
        });


        it('should create utf8 array', function() {
          var utf8array = UTILS.toUTF8Array('0123456789');
          assert.notEqual(utf8array, undefined);
          assert.equal(utf8array[0], 48);
          assert.equal(utf8array[1], 49);
          assert.equal(utf8array[2], 50);
          assert.equal(utf8array[3], 51);
          assert.equal(utf8array[4], 52);
          assert.equal(utf8array[5], 53);
          assert.equal(utf8array[6], 54);
          assert.equal(utf8array[7], 55);
          assert.equal(utf8array[8], 56);
          assert.equal(utf8array[9], 57);
        });

       
        it('should sum array properties', function() {
          const objects = [{ 'n': 4 }, { 'n': 2 }, { 'n': 8 }, { 'n': 6 }]
          var number = UTILS.sumBy(objects, ({ n }) => n);
          assert.equal(number, 20);
        });
    
    });

})();
