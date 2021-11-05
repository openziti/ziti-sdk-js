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


const MicroModal = require('micromodal');
const isNull                = require('lodash.isnull');
const isUndefined           = require('lodash.isundefined');

// const dragDrop = require('drag-drop');


/**
 *	Inject HTML needed for the Identity Modal.
 *
 */  
exports.inject = ( text ) => {

    let self = this;

    htmlString = `
  
        <div class="modal micromodal-slide" id="ziti-updb-modal-keypairDirectory" aria-hidden="true">
            <div class="wrapper">
                <form class="form-signin" name="zitikeypair" id="ziti-keypair-form">
                    <header class="modal__header">
                        <h2 class="modal__title" id="modal-1-title">
                            <img src="https://ziti-logo.s3.amazonaws.com/ziti-logo_avatar.png" width=25 >
                            <span>
                                Zero-Trust KeyPair Selection
                            </span>
                        </h2>
                    </header>

                    <h2 class="form-signin-heading">${text}</h2>
                    <span style="padding-top: 5px;">&nbsp;</span>
                    <button id="ziti-keypairDirectory-button" class="btn btn-lg btn-primary btn-block form-signin-button" type="submit">Select Folder</button>   
                </form>
            </div>

            <div style="text-align: center;">
                <span id="ziti-identity-progress" style="color: white; font-weight: 800"></span> 
            </div>
            <div style="text-align: center;">
                <span id="ziti-identity-error" style="color: red; font-weight: 800"></span> 
            </div>
            
            
            <footer class="modal__footer">
            </footer>
            
            <p class="ziti-footer" >
                To access this application, you must be enrolled in the Ziti network.
            </p>
        </div>
    
    `;
  
    if (isNull(document.body) || isUndefined(document.body)) {
        var body = document.createElement("body");
        document.documentElement.appendChild(body);
    }

    document.body.insertAdjacentHTML('afterbegin', htmlString);      
    
    // let div = document.createElement('div');
    // div.innerHTML = htmlString;
    // document.body.append(div);
  
}
  