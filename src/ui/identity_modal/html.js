
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
                    Identity Required
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
                    <input type="file" id="upload" style="display:none" accept="application/JSON">
                    </label>
                
                    <p class="label style-scope ytcp-uploads-file-picker">
                        Drag and drop a Ziti Identity file, or click above to select one from your computer.
                    </p>
            
                    <div style="text-align: center;">
                        <span id="ziti-identity-error" style="color: red;"></span> 
                    </div>
            
                </main>
            
                <footer class="modal__footer">
                </footer>
            
                <p class="disclaimer style-scope ytcp-uploads-file-picker" >
                    In order to access this application, you must be enrolled into the Ziti network and have a valid Ziti Identity.
                </p>
                </div>
            </div>
        </div>
    
    `;
  
    document.body.insertAdjacentHTML('afterbegin', htmlString);  
      
}
  