var assert = require('assert');
var ziti = require('../../src/index');

require('../mock-localstorage');


(function() {


  describe('client', function() {

    it('undefined context should fail', () => {
      assert.notEqual(ziti, undefined);
      assert.throws(function () {
        ziti.newConnection(undefined, null);
      }, /^TypeError: Specified context is undefined.$/);
    
      
    });

    it('null context should fail', () => {
      assert.notEqual(ziti, undefined);
      assert.throws(function () {
        ziti.newConnection(null, null);
      }, /^TypeError: Specified context is null.$/);
    });

    it('ziti.init should succeed', async () => {
      let ctx = await ziti.init();
      assert.notEqual(ctx, undefined);
    });

    it('ziti.init should succeed', async () => {
      let ctx = await ziti.init();
      assert.notEqual(ctx, undefined);
      let conn = ziti.newConnection(ctx, null);
      assert.notEqual(conn, undefined);
      // console.log('conn is: ', conn);
    });

  });

})();
