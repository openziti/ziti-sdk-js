
const error = require('./error');
const dragDrop = require('drag-drop');
const fileParser = require('./file-parser');


/**
 *	Inject JS drag-drop-handler for the Identity Modal.
 *
 */  
exports.injectDragDropHandler = () => {

  dragDrop('#animation', (files, pos, fileList, directories) => {
   
    let file = files[0];

    if (file) {
  
      fileParser.parse(file);     
    
    } else {
      error.setMessage('No file was selected');
    }

  });
    
}
  