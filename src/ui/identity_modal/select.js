
const error = require('./error');
const fileParser = require('./file-parser');

/**
 *	Inject JS select change-handler for the Identity Modal.
 *
 */  
exports.injectChangeHandler = () => {

    let imageUpload = document.getElementById("upload");
  
    imageUpload.onchange = function() {

      let file = this.files[0];

      if (file) {

        fileParser.parse(file);     
      
      } else {
        error.setMessage('No file was selected');
      }

    };  
      
}
  