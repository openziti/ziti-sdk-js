// global.window = {}
// require('mock-local-storage');
// window.localStorage = global.localStorage


const item = {
    value: "https://curt-edge-controller:1280",
    expiry: 1629296626000,
}
localStorage.setItem("ZITI_CONTROLLER", JSON.stringify(item))
