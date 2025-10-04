
require('dotenv').config();

const express = require('express')
const app = express()
app.use(express.json());
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
const exec = require('node:child-process');

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

const enableObsRestartFlag = async(disable) => {
    return true;
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

app.post('/macro/enable', async (req, res) => {

    if(req.get(HEADER_APIKEY) !== process.env.OBS_APIKEY) {
        res.status(401).send('API key was wrong or missing');
        return;
    }
    isObsConnected || await connectObs();

    const macroName = req.body.name;
    const macroState = req.body.state == "enabled" ? true : req.body.state == "disabled" ? false : null;
    if(macroState === null) {
        res.status(400).send('Coundn\'t understand input');
        return;
    }
    const profileSettings = JSON.parse(await fs.readFile(profilePath, 
        { encoding: 'utf8' }));
    const macros = profileSettings.modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === macroName);
    if(macros.length === 0) {
        res.status(400).send(`Coundn\'t find macro with name ${macroName}`);
        return;
    }
    macros.map(macro => macro.pause = !macroState);
    await fs.writeFile(profilePath, JSON.stringify(profileSettings, null, 4));
    enableObsRestartFlag();
    res.send(macros);

});

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
        enabled: !macro.pause,
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

    // variables 

    const variables = profileSettings.modules['advanced-scene-switcher'].variables;

    res.send({ macros: macroSummary, variables: variables });

})

function updatePrerecViaFile(djName, date, path) {
    
    await fs.copyFile(profilePath, profilePath + `.${dateNow}`);

    // find prerec macro 

    const profileSettings = JSON.parse(await fs.readFile(profilePath, 
        { encoding: 'utf8' }));
    const macros = profileSettings.modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === macroName);
    if(macros.length === 0) {
        console.error(`Coundn\'t find macro with name ${macroName}`);
        return;
    }
    const macro = macros[0];

    macro.condition.dateTime = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][airDate.getDay()] + ' ' + 
        ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][airDate.getMonth()] + ' ' +
        airDate.getDate() + ' ' +
        airDate.getHour() + ':' + airDate.getMinute() + ":" + airDate.getSecond() + ' '
        airDate.getYear();
    await fs.writeFile(profilePath, profileSettings, { encoding: 'utf8' });

}

async function updatePrerecViaObs(djName, path) {

    const itemName = process.env.OBS_PREREC_SOURCE_PREFIX + djName;
    await obs.call('SetInputSettings', { itemName, { file: PLAYLIST_PATH + '/' + path } });

}

const shutdowonObs = async () => await exec('osascript -e \'quit app "OBS"\'');
const startupObs = async () => await exec('open -a OBS');

app.post('/prerec_refresh', async (req, res) => {

    if(req.get(HEADER_APIKEY) !== process.env.OBS_APIKEY) {
        res.status(401).send('API key was wrong or missing');
        return;
    }
    isObsConnected || await connectObs();

    const regex = /codesouth (.*) ([0-9\-]+)\.(mp3|m4a)$/;
    const dateNow = Date.now();
    const prerecUpdates = fs
        .readdirDync(
            process.env.PLAYLIST_PATH, 
            { recursive: true })
        .map(file => file.match(regex))
        .filter(matches => Date.parse(matches[2] > dateNow));

    prerecUpdates.map(update => updatePrerecViaObs(update[1], update[0]));
    await shutdowonObs();
    prerecUpdates.map(update => updatePrerecViaFile(update[1], Date.parse(update[2]), update[0]));
    await startupObs();

    res.status(200).send();

});

app.listen(port, () => {
    console.log(`OBS CS app listening on port ${port}`)
});