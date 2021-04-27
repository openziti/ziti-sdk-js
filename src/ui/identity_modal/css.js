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

  

/**
 *	Inject CSS needed for the Identity Modal.
 *
 */  
exports.inject = () => {

	styleString = `

	// body {
	// 	background: #eee !important;
	//   }
	  
	* {
		-webkit-box-sizing: border-box;
		-moz-box-sizing: border-box;
		box-sizing: border-box;
	}

	.h1, .h2, .h3, .h4, .h5, .h6, h1, h2, h3, h4, h5, h6 {
		font-family: inherit;
		font-weight: 500;
		line-height: 1.1;
		color: inherit;
	}

	  .wrapper {
		margin-top: 80px;
		margin-bottom: 80px;
		position: relative; 
		z-index: 999;
	  }
	  
	  .form-signin {
		border-radius: 10px;
		max-width: 380px;
		padding: 15px 35px 45px;
		margin: 0 auto;
		background-color: #fff;
		border: 1px solid rgba(0, 0, 0, 0.1);
		box-sizing: border-box;
	  }
	  .form-signin .form-signin-heading,
	  .form-signin .checkbox {
		margin-bottom: 30px;
		font-size: 18px;
		color: black;
		font-family: sans-serif;
	  }
	  .form-signin .checkbox {
		font-weight: normal;
	  }
	  .form-signin .form-control {
		position: relative;
		font-size: 16px;
		height: auto;
		padding: 10px;
		-webkit-box-sizing: border-box;
		-moz-box-sizing: border-box;
		box-sizing: border-box;
	  }
	  .form-signin .form-control:focus {
		z-index: 2;
	  }
	  .form-signin input[type="text"] {
		margin-bottom: -1px;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	  }
	  .form-signin input[type="password"] {
		margin-bottom: 20px;
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	  }
	  
	  .form-signin-button {
		background-image: linear-gradient(to bottom right, #082481 , #e00043);
	  }
  
  	.modal {
	  	font-family: -apple-system,BlinkMacSystemFont,avenir next,avenir,helvetica neue,helvetica,ubuntu,roboto,noto,segoe ui,arial,sans-serif;
	  	background-image: linear-gradient(to bottom right, #082481 , #e00043);
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 1050;
		display: none;
		overflow: hidden;
		-webkit-overflow-scrolling: touch;
		outline: 0;
	}

	
	.modal__overlay {
	  position: fixed;
	  top: 0;
	  left: 0;
	  right: 0;
	  bottom: 0;
	  background: rgba(0,0,0,0.6);
	  display: flex;
	  justify-content: center;
	  align-items: center;
	}
	
	.modal__container {
	  background-color: #fff;
	  padding: 30px;
	  /* max-width: 500px; */
	  max-height: 100vh;
	  border-radius: 4px;
	  overflow-y: auto;
	  box-sizing: border-box;
	}
	
	.modal__header {
	  display: flex;
	  justify-content: space-between;
	  align-items: center;
	  border-bottom: 1px solid #00449e;
	  padding-bottom: 8px;
	  position: relative;
	  background: white
	}
	
	.modal__title {
	  margin-top: 0;
	  margin-bottom: 0;
	  font-weight: 600;
	  font-size: 1.0rem;
	  line-height: 1.0;
	  color: #000000;
	  box-sizing: border-box;
	  font-family: sans-serif;
	}

	.modal__title span {
		display: block;
		position: absolute;
		height: 16px;
		top: 50%;
		margin-top: -14px;
		margin-left: 32px;
		font-size: 18px;
	}
	
	
	.modal__close {
	  background: transparent;
	  border: 0;
	}
	
	.modal__header .modal__close:before { content: "\\2715"; }
	
	.modal__content {
	  margin-top: 2rem;
	  margin-bottom: 2rem;
	  line-height: 1.5;
	  color: rgba(0,0,0,.8);
	}
  
	.modal__content p {
	  text-align: center;
	}
  
	label.modal__upload {
	  width: 100%;
	}
  
	.modal__btn {
	  font-size: .875rem;
	  padding-left: 1rem;
	  padding-right: 1rem;
	  padding-top: .5rem;
	  padding-bottom: .5rem;
	  background-color: #e6e6e6;
	  color: rgba(0,0,0,.8);
	  border-radius: .25rem;
	  border-style: none;
	  border-width: 0;
	  cursor: pointer;
	  -webkit-appearance: button;
	  text-transform: none;
	  overflow: visible;
	  line-height: 1.15;
	  margin: 0;
	  will-change: transform;
	  -moz-osx-font-smoothing: grayscale;
	  -webkit-backface-visibility: hidden;
	  backface-visibility: hidden;
	  -webkit-transform: translateZ(0);
	  transform: translateZ(0);
	  transition: -webkit-transform .25s ease-out;
	  transition: transform .25s ease-out;
	  transition: transform .25s ease-out,-webkit-transform .25s ease-out;
	}
	
	.modal__btn:focus, .modal__btn:hover {
	  -webkit-transform: scale(1.05);
	  transform: scale(1.05);
	}
	
	.modal__btn-primary {
	  background-color: #00449e;
	  color: #fff;
	}
	
	
	
	/**************************\
	  Demo Animation Style
	\**************************/
	@keyframes mmfadeIn {
		from { opacity: 0; }
		  to { opacity: 1; }
	}
	
	@keyframes mmfadeOut {
		from { opacity: 1; }
		  to { opacity: 0; }
	}
	
	@keyframes mmslideIn {
	  from { transform: translateY(15%); }
		to { transform: translateY(0); }
	}
	
	@keyframes mmslideOut {
		from { transform: translateY(0); }
		to { transform: translateY(-10%); }
	}
	
	.micromodal-slide {
	  display: none;
	}
	
	.micromodal-slide.is-open {
	  display: block;
	}
	
	.micromodal-slide[aria-hidden="false"] .modal__overlay {
	  animation: mmfadeIn .3s cubic-bezier(0.0, 0.0, 0.2, 1);
	}
	
	.micromodal-slide[aria-hidden="false"] .modal__container {
	  animation: mmslideIn .3s cubic-bezier(0, 0, .2, 1);
	}
	
	.micromodal-slide[aria-hidden="true"] .modal__overlay {
	  animation: mmfadeOut .3s cubic-bezier(0.0, 0.0, 0.2, 1);
	}
	
	.micromodal-slide[aria-hidden="true"] .modal__container {
	  animation: mmslideOut .3s cubic-bezier(0, 0, .2, 1);
	}
	
	.micromodal-slide .modal__container,
	.micromodal-slide .modal__overlay {
	  will-change: transform;
	}  
  
	.ziti-footer {
	  font-family: 'Roboto', 'Noto', sans-serif;
	  font-weight: 400;
	  -webkit-font-smoothing: antialiased;
	  letter-spacing: 0.011em;
	  font-size: 12px;
	  line-height: 16px;
	  color: white;
	  text-align: center;
	}
  
	.btn-block {
		display: block;
		width: 100%;
	}
	.btn-group-lg>.btn, .btn-lg {
		padding: 10px 16px;
		font-size: 18px;
		line-height: 1.3333333;
		border-radius: 6px;
	}
	.btn-primary {
		color: #fff;
		background-color: #337ab7;
		border-color: #2e6da4;
	}
	.btn {
		display: inline-block;
		padding: 6px 12px;
		margin-bottom: 0;
		font-size: 14px;
		font-weight: 400;
		line-height: 1.42857143;
		text-align: center;
		white-space: nowrap;
		vertical-align: middle;
		-ms-touch-action: manipulation;
		touch-action: manipulation;
		cursor: pointer;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;
		user-select: none;
		// background-image: none;
		border: 1px solid transparent;
		border-radius: 4px;
		font-family: sans-serif;
	}
	
	button, input, select, textarea {
		font-family: inherit;
		font-size: inherit;
		line-height: inherit;
	}
	button, html input[type=button], input[type=reset], input[type=submit] {
		-webkit-appearance: button;
		cursor: pointer;
	}
	button, select {
		text-transform: none;
	}
	button {
		overflow: visible;
	}
	button, input, optgroup, select, textarea {
		margin: 0;
		font: inherit;
		color: inherit;
	}
	button, input, select, textarea {
		font-family: inherit;
		font-size: inherit;
		line-height: inherit;
	}
	button, html input[type=button], input[type=reset], input[type=submit] {
		-webkit-appearance: button;
		cursor: pointer;
	}
	button, select {
		text-transform: none;
	}
	button {
		overflow: visible;
	}
	button, input, optgroup, select, textarea {
		margin: 0;
		font: inherit;
		color: inherit;
	}
	* {
		-webkit-box-sizing: border-box;
		-moz-box-sizing: border-box;
		box-sizing: border-box;
	}
	* {
		-webkit-box-sizing: border-box;
		-moz-box-sizing: border-box;
		box-sizing: border-box;
	}

	.form-control {
		display: block;
		width: 100%;
		height: 34px;
		padding: 6px 12px;
		font-size: 14px;
		line-height: 1.42857143;
		color: #555;
		background-color: #fff;
		background-image: none;
		border: 1px solid #ccc;
		border-radius: 4px;
		-webkit-box-shadow: inset 0 1px 1px rgb(0 0 0 / 8%);
		box-shadow: inset 0 1px 1px rgb(0 0 0 / 8%);
		-webkit-transition: border-color ease-in-out .15s,-webkit-box-shadow ease-in-out .15s;
		-o-transition: border-color ease-in-out .15s,box-shadow ease-in-out .15s;
		transition: border-color ease-in-out .15s,box-shadow ease-in-out .15s;
		font-family: sans-serif;
	}	
	`;
  
	const style = document.createElement('style');
	style.textContent = styleString;
	document.head.append(style);
  
	// document.head.insertAdjacentHTML('afterbegin', `
	//   <link href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.4/css/bootstrap.min.css" rel="stylesheet"/>
	// `);
  
  }
  