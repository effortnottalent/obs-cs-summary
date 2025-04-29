
require('dotenv').config();

const express = require('express')
const app = express()
const port = process.env.PORT

const fs = require('node:fs/promises');
const profilePath = process.env.OBS_SC_PATH;

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

    isObsConnected || await connectObs();

    // scheduling info

    const profileSettings = JSON.parse(await fs.readFile(profilePath, { encoding: 'utf8' }));
    const macros = profileSettings.modules['advanced-scene-switcher'].macros;

    // scene info

    const { scenes } = await obs.call('GetSceneList');
    const scenesWithItems = await Promise.all(
        scenes.map(async scene => ({
            scene: scene, 
            sceneItems: await obs.call('GetSceneItemList', { sceneUuid: scene.sceneUuid })})));
    const sceneItemSettingsOutcomes = await Promise.allSettled(
        scenesWithItems.map(async scene => ({
            scene: scene.scene,
            sceneItems: scene.sceneItems.sceneItems,
            sceneItemSettings: await obs.call('GetInputSettings', { 
                inputUuid: scene.sceneItems.sceneItems.find(item => 
                    ['ffmpeg_source', 'vlc_source'].includes(item.inputKind))?.sourceUuid || 'none' })
            })));
    const sceneItemSettings = sceneItemSettingsOutcomes
        .filter(outcome => outcome.status === 'fulfilled')
        .map(outcome => outcome.value);
    const sceneItemSummary = sceneItemSettings.map(sis => ({
        scene: sis.scene.sceneName,
        file: sis.sceneItemSettings.inputSettings.local_file || 
            sis.sceneItemSettings.inputSettings.playlist.map(item => item.value),
        macro: macros
            .filter(macro => 
                macro.conditions.find(condition => condition.id === 'date') &&
                macro.actions.find(action => 
                    action.sceneSelection?.name === sis.scene.sceneName))
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