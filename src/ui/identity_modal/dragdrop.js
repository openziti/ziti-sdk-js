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
  