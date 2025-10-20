const OBSWebSocket = require('obs-websocket-js').OBSWebSocket
const obs = new OBSWebSocket();
module.exports = {
    connect: function(uri, password, data) { return obs.connect(uri, password, data) },
    getSceneItemList: function(data) { return obs.call('GetSceneItemList', data) },
    getInputSettings: function(data) { return obs.call('GetInputSettings', data) },
    getSceneList: function(data) { return obs.call('GetSceneList', data) },
    setInputSettings: function(data) { return obs.call('SetInputSettings', data) },
};