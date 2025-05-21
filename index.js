
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

app.get('/summary', async (req, res) => {

    if(req.get(HEADER_APIKEY) !== process.env.OBS_APIKEY) {
        res.status(401).send('API key was wrong or missing');
        return;
    }
    isObsConnected || await connectObs();

    // scheduling info

    const profileSettings = JSON.parse(await fs.readFile(profilePath, { encoding: 'utf8' }));
    const macros = profileSettings.modules['advanced-scene-switcher'].macros;

    // scene info

    const { scenes } = await obs.call('GetSceneList');
    const sceneItems = (await Promise.all(
        scenes.map(async scene => 
            (await obs.call('GetSceneItemList', { sceneUuid: scene.sceneUuid })).sceneItems
                .map(sceneItem => ({ ...sceneItem, sceneUuid: scene.sceneUuid })))))
        .flat();
    const sceneItemSettingsOutcomes = await Promise.allSettled(
        sceneItems.map(async sceneItem => ({
            ...(await obs.call('GetInputSettings', { inputUuid: 
                ['ffmpeg_source', 'vlc_source'].includes(sceneItems[0].inputKind) 
                    ? sceneItem.sourceUuid : 'none' })), 
            sceneUuid: sceneItem.sceneUuid
         })));
    const sceneItemSettings = sceneItemSettingsOutcomes
        .filter(outcome => outcome.status === 'fulfilled')
        .map(outcome => outcome.value);
    const sceneItemSummary = scenes.map(scene => ({
        scene: scene.sceneName,
        files: sceneItemSettings
            .filter(sis => sis.sceneUuid === scene.sceneUuid)
            .map(sis => sis.inputSettings.local_file || sis.inputSettings.playlist?.map(item => item.value))
            .flat(),
        macro: macros
            .filter(macro => 
                macro.conditions.find(condition => condition.id === 'date') &&
                macro.actions.find(action => 
                    action.sceneSelection?.name === scene.sceneName))
            .map(macro => ({
                triggers: (macro.conditions.map(condition => condition.dateTime)).flat(),
                active: !macro.pause
            }))
    }));

    res.send(sceneItemSummary);
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})