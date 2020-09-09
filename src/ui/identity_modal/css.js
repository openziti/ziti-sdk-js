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
  
  	.modal {
	  font-family: -apple-system,BlinkMacSystemFont,avenir next,avenir,helvetica neue,helvetica,ubuntu,roboto,noto,segoe ui,arial,sans-serif;
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
	}
	
	.modal__title {
	  margin-top: 0;
	  margin-bottom: 0;
	  font-weight: 600;
	  font-size: 1.25rem;
	  line-height: 1.25;
	  color: #00449e;
	  box-sizing: border-box;
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
  
	.disclaimer.ytcp-uploads-file-picker:last-of-type {
	  margin: 8px 0;
	}
  
  
	.disclaimer.ytcp-uploads-file-picker {
	  font-family: 'Roboto', 'Noto', sans-serif;
	  font-weight: 400;
	  -webkit-font-smoothing: antialiased;
	  letter-spacing: 0.011em;
	  font-size: 12px;
	  line-height: 16px;
	  color: var(--ytcp-black-secondary);
	  text-align: center;
	}
  
	.ytcp-uploads-file-picker:not([disabled]) ytcp-uploads-file-picker-animation.ytcp-uploads-file-picker {
	  cursor: pointer;
	}
	.ytcp-uploads-file-picker-animation.ytcp-uploads-file-picker {
		margin-top: auto;
	}
	.ytcp-uploads-file-picker-animation {
		display: block;
	}
	.ytcp-uploads-file-picker {
		display: flex;
		justify-content: center;
		height: 100%;
		width: 100%;
		--ytcp-feature-discovery-zindex: 3000;
	}
    
	#modal__upload.ytcp-uploads-file-picker {
	  display: flex;
	  flex-direction: column;
	  align-items: center;
	  justify-content: center;
	  min-height: 370px;
	  padding: 16px 24px 0 24px;
	}
  
	#circle.ytcp-uploads-file-picker-animation {
	  width: 136px;
	  height: 136px;
	  background: linear-gradient(140deg, rgba(2,0,36,1) 10%, rgba(20,95,235,1) 0%, rgba(238,6,79,1) 83%);
	  position: relative;
	  border-radius: 68px;
	  overflow: hidden;
	  cursor: pointer;
	}
  
	#arrow-group.ytcp-uploads-file-picker-animation {
	  position: absolute;
	  top: calc(68px - 52px/2);
	  left: calc(68px - 40px/2);
	  width: 40px;
	  display: flex;
	  flex-direction: column;
	  z-index: 30;
	}
  
	#arrow.ytcp-uploads-file-picker-animation {
	  position: relative;
	  width: 38px;
	  height: 36px;
	  flex: none;
	  align-self: center;
	}
  
	#arrow-tip.ytcp-uploads-file-picker-animation {
	  width: 0;
	  height: 0;
	  border-left: 19px solid transparent;
	  border-right: 19px solid transparent;
	  border-bottom: 21px solid #fff;
	  position: absolute;
	  top: 0;
	  z-index: 30;
	}
  
	#smoke.ytcp-uploads-file-picker-animation {
	  height: 150px;
	  background: white;
	  opacity: 0.5;
	  width: 36px;
	  height: 100px;
	  position: absolute;
	  top: 20px;
	  left: calc(19px - 36px/2);
	  z-index: 10;
	  transform: translateY(0px) scale(1, 0);
	}
  
	#arrow-line.ytcp-uploads-file-picker-animation {
	  width: 16px;
	  height: 16px;
	  background: #fff;
	  position: absolute;
	  top: 20px;
	  left: 11px;
	  z-index: 30;
	}
  
	#arrow-underline.ytcp-uploads-file-picker-animation {
	  flex: none;
	  align-self: center;
	  width: 40px;
	  border-bottom: 6px solid #fff;
	  margin-top: 10px;
	}
  
	.label.ytcp-uploads-file-picker {
	  font-weight: bold;
	  font-size: 1.0rem;
	  margin-top: 25px;
	  color: #00449e;
	}
  
	.ytcp-uploads-file-picker.drag::before {
	  content: '';
	  position: fixed;
	  top: 80px;
	  left: 30px;
	  bottom: 160px;
	  right: 30px;
	  background: linear-gradient(124deg, rgba(2,0,36,1) 0%, rgba(20,95,235,1) 50%, rgba(238,6,79,1) 100%);
	  border: 3px #ee064f dashed;
	}
	
	`;
  
	const style = document.createElement('style');
	style.textContent = styleString;
	document.head.append(style);
  
	document.head.insertAdjacentHTML('afterbegin', `
	  <link href="//maxcdn.bootstrapcdn.com/bootstrap/3.3.4/css/bootstrap.min.css" rel="stylesheet"/>
	`);
  
  }
  