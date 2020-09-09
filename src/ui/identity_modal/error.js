

/**
 *	Inject err msg into the Identity Modal.
 *
 */  
exports.setMessage = (errorMessage) => {

  var el = document.getElementById("ziti-identity-error") 
  if (typeof errorMessage != "undefined") { 
    el.textContent = errorMessage 
    el.style.color = "red" 
  } else { 
    el.textContent = "" 
  } 
        
}
  