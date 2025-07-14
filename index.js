
require('dotenv').config();

const express = require('express')
const app = express()
const port = process.env.PORT

const fs = require('node:fs/promises');
const profilePath = process.env.OBS_SC_PATH;
const HEADER_APIKEY = 'x-api-key';

const OBSWebSocket = require('obs-websocket-js').OBSWebSocket
const obs = new OBSWebSocket();
let isObsConnected = false;
const logic = {
    '0': 'default',
    '100': 'ignore',
    '101': 'and',
    '102': 'or',
    '103': 'and not',
    '104': 'or not'
};

const connectObs = async () => {
    try {
        const {
          obsWebSocketVersion,
          negotiatedRpcVersion
        } = await obs.connect(
            process.env.OBS_WS_URI, 
            process.env.OBS_WS_PASSWORD, 
            { rpcVersion: 1 }
        );
        isObsConnected = true;
        console.log(`connected using ${obsWebSocketVersion}`);
    } catch (e) {
        console.error(e);
    }
}

async function getSceneMedia(sceneUuid) {
    const sceneItems = (await obs.call('GetSceneItemList', 
        { sceneUuid: sceneUuid })).sceneItems;
    const sceneItemSettingsOutcomes = (await Promise.allSettled(
        sceneItems.map(async sceneItem => await obs.call('GetInputSettings', 
                { inputUuid: sceneItem.sourceUuid }))));
    const sceneItemSettings = sceneItemSettingsOutcomes
            .filter(outcome => outcome.status === 'fulfilled')
            .map(outcome => outcome.value);
    return sceneItemSettings
        .map(sis => sis.inputSettings.input 
            || sis.inputSettings.local_file 
            || sis.inputSettings.playlist?.map(item => item.value))
        .flat()
        .filter(item => item !== null && item !== undefined);
}

app.get('/summary', async (req, res) => {

    if(req.get(HEADER_APIKEY) !== process.env.OBS_APIKEY) {
        res.status(401).send('API key was wrong or missing');
        return;
    }
    isObsConnected || await connectObs();

    // scheduling info

    const profileSettings = JSON.parse(await fs.readFile(profilePath, 
        { encoding: 'utf8' }));
    const { scenes } = await obs.call('GetSceneList');
    const macros = profileSettings.modules['advanced-scene-switcher'].macros;

    // macros info

    const macroSummary = await Promise.all(macros.map(async macro => ({
        name: macro.name,
        enabled: !macro.paused,
        triggers: macro.conditions
            .filter(condition => condition.id === 'date')
            .map(condition => ({
                time: condition.dateTime,
                logic: logic[condition.logic]
            })),
        scenes: await Promise.all(macro.actions
            .filter(action => action.id === 'scene_switch')
            .map(async action => ({
                name: action.sceneSelection.name,
                media: await getSceneMedia(
                    scenes.find(scene => scene.sceneName === 
                        action.sceneSelection.name).sceneUuid)}))),
        macros: await Promise.all(macro.actions
            .filter(action => action.id === 'sequence')
            .map(action => ({
                    name: action.macros.map(macro => macro.macro).join(', ')})))
    })));

    res.send(macroSummary);

})

app.listen(port, () => {
    console.log(`OBS CS app listening on port ${port}`)
})