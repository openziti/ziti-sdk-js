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
const error = require('./error');

/**
 *	Inject JS select change-handler for the Identity Modal.
 *
 */  
exports.injectButtonHandler = (cb) => {

    let loginButton = document.getElementById("ziti-login-button");

    loginButton.onclick = function(e) {

      e.preventDefault();

      let results = formValidation();
      if (!isUndefined( results )) {
        cb(results);
      }
    };
}
  
function formValidation()
{
  let username = document.zitilogin.username;
  var username_len = username.value.length;
  if (username_len == 0) {
    error.setMessage('ERROR: Please specify a Username');
    return undefined;
  }
  if (username_len < 4) {
    error.setMessage('ERROR: Username must be at least 4 characters long');
    return undefined;
  }

  let password = document.zitilogin.password;
  var password_len = password.value.length;
  if (password_len == 0) {
    error.setMessage('ERROR: Please specify a Password');
    return undefined;
  }
  if (password_len < 4) {
    error.setMessage('ERROR: Password must be at least 4 characters long');
    return undefined;
  }

  error.setMessage('');

  return { username: username.value, password: password.value };
}

