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

const isUndefined = require('lodash.isundefined');
const isNull = require('lodash.isnull');
const ZitiPKI = require('../pki/pki');
const ls = require('../utils/localstorage');
const zitiConstants = require('../constants');

/**
 *	Inject JS select change-handler for the Identity Modal.
 *
 */  
exports.injectButtonHandler = (updb, source, cb) => {

    let keypairDirectoryButton = document.getElementById("ziti-keypairDirectory-button");

    keypairDirectoryButton.onclick = async function(e) {

      e.preventDefault();

      function ab2str(buf) {
        return String.fromCharCode.apply(null, new Uint16Array(buf));
      }
      function str2ab(str) {
        var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
        var bufView = new Uint16Array(buf);
        for (var i=0, strLen=str.length; i < strLen; i++) {
          bufView[i] = str.charCodeAt(i);
        }
        return buf;
      }      

      // Render the directory chooser, and obtain dir handle
      let directoryHandle = await window.showDirectoryPicker( {} );
      ziti._ctx.logger.debug('got directoryHandle: ', directoryHandle);

              
      if ( source == zitiConstants.get().ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_FS ) {


        let publicKeyfileHandle = await directoryHandle.getFileHandle(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY_FILENAME, { create: false }).catch((err) => { ziti._ctx.logger.warn(err); });
        ziti._ctx.logger.debug('publicKeyfileHandle: ', publicKeyfileHandle);
        let privateKeyfileHandle = await directoryHandle.getFileHandle(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY_FILENAME, { create: false }).catch((err) => { ziti._ctx.logger.warn(err); });
        ziti._ctx.logger.debug('privateKeyfileHandle: ', privateKeyfileHandle);

        // If public key NOT present in chosen directory
        if ( isUndefined( publicKeyfileHandle ) ) {
          cb( zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY_FILE_NOT_FOUND );
          return;
        }
        // If private key NOT present in chosen directory
        if ( isUndefined( privateKeyfileHandle ) ) {
          cb( zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY_FILE_NOT_FOUND );
          return;
        }

        // Otherwise, keypair IS present in chosen directory, so read it from disk, and store in IndexedDb

        let publicKeyfile = await publicKeyfileHandle.getFile();
        let publicKeyfileContents = await publicKeyfile.arrayBuffer();
        publicKeyfileContents = ab2str(publicKeyfileContents);
        await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY, publicKeyfileContents, new Date(8640000000000000));    

        let privateKeyfile = await privateKeyfileHandle.getFile();
        let privateKeyfileContents = await privateKeyfile.arrayBuffer();
        privateKeyfileContents = ab2str(privateKeyfileContents);
        await ls.setWithExpiry(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY, privateKeyfileContents, new Date(8640000000000000));    

        cb( zitiConstants.get().ZITI_IDENTITY_KEYPAIR_FOUND );

        return;

      }

      else if ( source == zitiConstants.get().ZITI_IDENTITY_KEYPAIR_OBTAIN_FROM_IDB ) {

        ziti._ctx.logger.debug('Must pull keypair from IndexedDb');

        // Obtain the keypair from IndexedDb
        let publicKey  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY);
        let privateKey = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);

        ziti._ctx.logger.debug('publicKey: ', publicKey);
        ziti._ctx.logger.debug('privateKey: ', privateKey);

        if (
          isNull( publicKey ) || isUndefined( publicKey ) ||
          isNull( privateKey )  || isUndefined( privateKey )
        ) {
          throw new Error('WTF');
        }

        // Determine if the public key file is in the selected directory already
        publicKeyfileHandle = await directoryHandle.getFileHandle(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY_FILENAME, { create: true }).catch((err) => {
          ziti._ctx.logger.info(err);
        });
        ziti._ctx.logger.debug('publicKeyfileHandle: ', publicKeyfileHandle);
        // Determine if the private key file is in the selected directory already
        privateKeyfileHandle = await directoryHandle.getFileHandle(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY_FILENAME, { create: true }).catch((err) => {
          ziti._ctx.logger.info(err);
        });
        ziti._ctx.logger.debug('privateKeyfileHandle: ', privateKeyfileHandle);

        // Prepare to write the keypair files to disk
        let perms = await publicKeyfileHandle.queryPermission()
        ziti._ctx.logger.debug('publicKeyfileHandle perms: ', perms);

        let publicKeyfileWritable = await publicKeyfileHandle.createWritable({ keepExistingData: false }).catch((err) => {
          ziti._ctx.logger.info(err);
        });
        ziti._ctx.logger.debug('publicKeyfileWritable: ', publicKeyfileWritable);

        perms = await privateKeyfileHandle.queryPermission()
        ziti._ctx.logger.debug('privateKeyfileHandle perms: ', perms);

        let privateKeyfileWritable = await privateKeyfileHandle.createWritable({ keepExistingData: false }).catch((err) => {
          ziti._ctx.logger.info(err);
        });
        ziti._ctx.logger.debug('privateKeyfileWritable: ', privateKeyfileWritable);

        // If we don't have writability
        if ( isUndefined( publicKeyfileWritable ) && isUndefined( privateKeyfileWritable ) ) {

          ziti._ctx.logger.info( 'Failed to get writable filehandles' );

          throw new Error('WTF');
        }

        ziti._ctx.logger.info('doing publicKeyfileWritable.write');
        await publicKeyfileWritable.write( str2ab( publicKey ) );
        ziti._ctx.logger.info('completed publicKeyfileWritable.write');
        await publicKeyfileWritable.close();
        ziti._ctx.logger.info('completed publicKeyfileWritable.close');

        ziti._ctx.logger.info('doing privateKeyfileWritable.write');
        await privateKeyfileWritable.write( str2ab( privateKey ) );
        ziti._ctx.logger.info('completed privateKeyfileWritable.write');
        await privateKeyfileWritable.close();
        ziti._ctx.logger.info('completed privateKeyfileWritable.close');

        cb( zitiConstants.get().ZITI_IDENTITY_KEYPAIR_FOUND );

        return;

      }
      else {
        throw new Error('WTF');
      }

      

      // ziti._ctx.logger.debug('Must pull keypair from IndexedDb');

      // // Do not proceed until we have generated a fresh keypair
      // let pki = new ZitiPKI(ZitiPKI.prototype);
      // await pki.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
      // let neededToGenerate = await pki.awaitKeyPairGenerationComplete( true ); // await completion of keypair calculation
      // ziti._ctx.logger.debug('awaitKeyPairGenerationComplete returned: ', neededToGenerate);

      // if (neededToGenerate) {
      //   // Trigger a page reload now that we have a fresh identity
      //   // let updb = new ZitiUPDB(ZitiUPDB.prototype);
      //   // await updb.init( { ctx: ziti._ctx, logger: ziti._ctx.logger } );
      //   updb.relodingPage();
      //   setTimeout(function(){ 
      //     window.location.reload();
      //   }, 500);        
      // }

      // // Obtain the keypair from IndexedDb
      // let publicKey  = await ls.get(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY);
      // let privateKey = await ls.get(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY);

      // ziti._ctx.logger.debug('publicKey: ', publicKey);
      // ziti._ctx.logger.debug('privateKey: ', privateKey);

      // // Determine if the public key file is in the selected directory already
      // publicKeyfileHandle = await directoryHandle.getFileHandle(zitiConstants.get().ZITI_IDENTITY_PUBLIC_KEY_FILENAME, { create: true }).catch((err) => {
      //   ziti._ctx.logger.info(err);
      // });
      // ziti._ctx.logger.debug('publicKeyfileHandle: ', publicKeyfileHandle);
      // // Determine if the private key file is in the selected directory already
      // privateKeyfileHandle = await directoryHandle.getFileHandle(zitiConstants.get().ZITI_IDENTITY_PRIVATE_KEY_FILENAME, { create: true }).catch((err) => {
      //   ziti._ctx.logger.info(err);
      // });
      // ziti._ctx.logger.debug('privateKeyfileHandle: ', privateKeyfileHandle);

      // // Prepare to write the keypair files to disk
      // let perms = await publicKeyfileHandle.queryPermission()
      // ziti._ctx.logger.debug('publicKeyfileHandle perms: ', perms);

      // let publicKeyfileWritable = await publicKeyfileHandle.createWritable({ keepExistingData: false }).catch((err) => {
      //   ziti._ctx.logger.info(err);
      // });
      // ziti._ctx.logger.debug('publicKeyfileWritable: ', publicKeyfileWritable);

      // perms = await privateKeyfileHandle.queryPermission()
      // ziti._ctx.logger.debug('privateKeyfileHandle perms: ', perms);

      // let privateKeyfileWritable = await privateKeyfileHandle.createWritable({ keepExistingData: false }).catch((err) => {
      //   ziti._ctx.logger.info(err);
      // });
      // ziti._ctx.logger.debug('privateKeyfileWritable: ', privateKeyfileWritable);

      // // If we don't have writability
      // if ( isUndefined( publicKeyfileWritable ) && isUndefined( privateKeyfileWritable ) ) {

      //   ziti._ctx.logger.info( 'Failed to get writable filehandles' );

      //   // Close the loop on this UI gesture
      //   cb( );
      //   return;
        
      // }
      
      // console.log('doing publicKeyfileWritable.write');
      // await publicKeyfileWritable.write( str2ab( publicKey ) );
      // console.log('completed publicKeyfileWritable.write');
      // await publicKeyfileWritable.close();
      // console.log('completed publicKeyfileWritable.close');

      // console.log('doing privateKeyfileWritable.write');
      // await privateKeyfileWritable.write( str2ab( privateKey ) );
      // console.log('completed privateKeyfileWritable.write');
      // await privateKeyfileWritable.close();
      // console.log('completed privateKeyfileWritable.close');

      // // Close the loop on this UI gesture
      // cb( );
      // return;
      
    };
}
  
