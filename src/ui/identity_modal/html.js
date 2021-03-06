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
const dragDrop = require('drag-drop');


/**
 *	Inject HTML needed for the Identity Modal.
 *
 */  
exports.inject = () => {

    let self = this;

    htmlString = `
  
        <div class="modal micromodal-slide" id="modal-1" aria-hidden="true">
            <div class="modal__overlay" tabindex="-1" data-micromodal-close>
                <div class="modal__container" role="dialog" aria-modal="true" aria-labelledby="modal-1-title">
                <header class="modal__header">
                    <h2 class="modal__title" id="modal-1-title">
                    <img src="https://ziti-logo.s3.amazonaws.com/ziti-logo_avatar.png" width=25 >
                        <span>
                            Enrollment Required
                        </span>
                    </h2>
                    <button class="modal__close" aria-label="Close modal" data-micromodal-close></button>
                </header>
            
                <main class="modal__content" id="modal-1-content">
            
                    <label class="modal__upload" for="upload">
                    <ytcp-uploads-file-picker-animation id="animation" class="style-scope ytcp-uploads-file-picker" state="idle">
                        <div id="circle" class="style-scope ytcp-uploads-file-picker-animation">
                        <div id="arrow-group" class="style-scope ytcp-uploads-file-picker-animation">
                            <div id="arrow" class="style-scope ytcp-uploads-file-picker-animation">
                            <div id="arrow-tip" class="style-scope ytcp-uploads-file-picker-animation">
                            </div>
                            <div id="smoke" class="style-scope ytcp-uploads-file-picker-animation">
                            </div>
                            <div id="arrow-line" class="style-scope ytcp-uploads-file-picker-animation">
                            </div>
                            </div>
                            <div id="arrow-underline" class="style-scope ytcp-uploads-file-picker-animation">
                            </div>
                        </div>
                        </div>
                    </ytcp-uploads-file-picker-animation>
                    <input type="file" id="upload" style="display:none" accept=".jwt">
                    </label>
                
                    <p class="label style-scope ytcp-uploads-file-picker">
                        Drag and drop a Ziti Enrollment Token file, or click above to select one from your computer.
                    </p>
            
                    <div style="text-align: center;">
                        <span id="ziti-identity-progress" style="color: green; font-weight: 800"></span> 
                    </div>
                    <div style="text-align: center;">
                        <span id="ziti-identity-error" style="color: red; font-weight: 800"></span> 
                    </div>
            
                </main>
            
                <footer class="modal__footer">
                </footer>
            
                <p class="disclaimer style-scope ytcp-uploads-file-picker" >
                    In order to access this application, you must be enrolled into the Ziti network.
                </p>
                </div>
            </div>
        </div>
    
    `;
  
    document.body.insertAdjacentHTML('afterbegin', htmlString);  
      
}
  