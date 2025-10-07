const OBSWebSocket = require('obs-websocket-js').OBSWebSocket
const obs = new OBSWebSocket();
module.exports = {
    getSceneItemList: async function (data) { return obs.call('GetSceneItemList', data) },
    getInputSettings: async function (data) { obs.call('GetInputSettings', data) },
    getSceneList: async function (data) { obs.call('GetSceneList', data) },
    setInputSettings: async function (data) { obs.call('SetInputSettings', data) },
};