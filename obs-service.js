const fs = require('node:fs/promises');
const OBSWebSocket = require('obs-websocket-js').OBSWebSocket
const obs = new OBSWebSocket();
const logic = {
    '0': 'default',
    '100': 'ignore',
    '101': 'and',
    '102': 'or',
    '103': 'and not',
    '104': 'or not'
};
//const exec = require('node:child-process');
let isObsConnected = false;

const connectObs = async () => {
    if(!isObsConnected) {
        const {
            obsWebSocketVersion,
            negotiatedRpcVersion
        } = await obs.connect(
            process.env.OBS_WS_URI, 
            process.env.OBS_WS_PASSWORD, 
            { rpcVersion: 1 }
        );
        console.log(`connected using ${obsWebSocketVersion}`);
        isObsConnected = true;
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

const backupMacroFile = async () => 
    await fs.copyFile(
        process.env.OBS_SC_PATH, 
        process.env.OBS_SC_PATH + '.' + Date.now());

async function enableMacro(profileSettings, macroName, macroState) {

    const macros = profileSettings.modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === macroName);
    if(macros.length === 0) {
        res.status(400).send(`Coundn\'t find macro with name ${macroName}`);
        return;
    }
    macros.map(macro => macro.pause = !macroState);
    return profileSettings;
}

const readMacroFile = async () => JSON.parse(
    await fs.readFile(process.env.OBS_SC_PATH, { encoding: 'utf8' }));

const writeMacroFile = async (json) => 
    await backupMacroFile() &&
    await fs.writeFile(profilePath, JSON.stringify(profileSettings, null, 4));

async function summariseMacros(profileSettings) {
    const macros = profileSettings.modules['advanced-scene-switcher'].macros;
    const { scenes } = await obs.call('GetSceneList');
    return await Promise.all(macros.map(async macro => ({
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
        macros: macro.actions
            .filter(action => action.id === 'sequence')
            .map(action => ({
                    name: action.macros.map(macro => macro.macro).join(', ')}))})));
}

function updatePrerecViaFile(profileSettings, djName, date) {

    const macros = profileSettings.modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === `${process.env.OBS_PREREC_SCENE_PREFIX}${djName}`);
    if(macros.length === 0) {
        console.error(`Coundn\'t find macro for dj ${djName}`);
        return;
    }
    const condition = macros[0].conditions[0];
    const airTime = condition.dateTime.match(/\d{2}:\d{2}:\d{2}/)[0];
    condition.dateTime = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] + ' ' + 
        ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()] + ' ' +
        date.getDate() + ' ' +
        airTime + ' ' +
        date.getFullYear();
    return profileSettings;

}

const updatePrerecViaObs = async (djName, path) =>
    await obs.call('SetInputSettings', { 
        inputName: process.env.OBS_PREREC_SOURCE_PREFIX + djName, 
        inputSettings: { file: PLAYLIST_PATH + '/' + path }});

/*
const shutdowonObs = async () => await exec('osascript -e \'quit app "OBS"\'');
const startupObs = async () => await exec('open -a OBS');
*/
module.exports = {
    connectObs,
    getSceneMedia,
    backupMacroFile,
    enableMacro,
    readMacroFile,
    writeMacroFile,
    summariseMacros,
    updatePrerecViaFile,
    updatePrerecViaObs,
    /*
    startupObs,
    shutdowonObs,
    */
};