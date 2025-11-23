const fs = require('fs');
const obs = require('./obs-websocket-facade');
const logic = {
    '0': 'default',
    '100': 'ignore',
    '101': 'and',
    '102': 'or',
    '103': 'and not',
    '104': 'or not'
};
const util = require('node:util');
const child_process = require('node:child_process');
const exec = util.promisify(child_process.exec);
const id3 = require('node-id3');
const e = require('express');

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

    const sceneItems = (await obs.getSceneItemList(
        { sceneUuid: sceneUuid })).sceneItems;
    const sceneItemSettingsOutcomes = (await Promise.allSettled(
        sceneItems.map(async sceneItem => await obs.getInputSettings(
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

const backupMacroFile = () =>
    fs.copyFileSync(
        process.env.OBS_SC_PATH, 
        process.env.OBS_SC_PATH + '.' + Date.now());

const readMacroFile = () => JSON.parse(
    fs.readFileSync(process.env.OBS_SC_PATH, 
        { encoding: 'utf8' }));

function writeMacroFile(profileSettings) { 
    backupMacroFile();
    fs.writeFileSync(process.env.OBS_SC_PATH, 
        JSON.stringify(profileSettings, null, 4));
}

async function summariseMacros(profileSettings) {

    const macros = profileSettings.modules['advanced-scene-switcher'].macros;
    const { scenes } = await obs.getSceneList();
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

function updatePrerecViaFile(profileSettings, path) {

    const udts = id3.read(process.env.PLAYLIST_PATH + '/' + path)?.userDefinedText;
    const [ djName, date ] = [ 'cs_dj_name', 'cs_air_date' ]
        .map(d => udts?.find(u => u.description === d)?.value);
    if(djName === undefined || date === undefined) {
        console.warn(`no id3 information on ${path}`);
        return profileSettings;
    }
    console.log(`found entry on ${path} for ${djName} at ${date}`);
    const updatedProfileSettings = JSON.parse(JSON.stringify(profileSettings));
    const macroName = `${process.env.OBS_PREREC_SCENE_PREFIX} ${djName}`;
    const macros = updatedProfileSettings.modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === macroName);
    if(macros.length === 0) {
        console.error(`Couldn't find macro for name ${macroName}, not making changes for ${path}`);
        return profileSettings;
    }
    const condition = macros[0].conditions[0];
    const airTime = macros[0].conditions[0].dateTime.match(/\d{2}:\d{2}:\d{2}/)[0];
    condition.dateTime = generateDateTimeString(new Date(date), airTime);
    const sourceName = `${process.env.OBS_PREREC_SOURCE_PREFIX} ${djName}`;
    const sources = updatedProfileSettings.sources.filter(
        source => source.name === sourceName);
    if(sources.length === 0) {
        console.warn(`Couldn't find source for name ${sourceName}, not making changes for ${path}`);
        return profileSettings;
    }
    sources[0].settings.local_file = `${process.env.PLAYLIST_PATH}/${path}`;
    return updatedProfileSettings;
}

const generateDateTimeString = (date, time) => 
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] + ' ' + 
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()] + ' ' +
    date.getDate() + ' ' +
    time + ' ' +
    date.getFullYear();

const shutdownObs = async () => await exec(`osascript -e '
try
    quit app "OBS"
    on error errMsg number errorNumber
end try
repeat until application "OBS" is not running
    delay .1
end repeat'
`);
const startupObs = async () => await exec(`
open -a "OBS" --args --startstreaming --disable-updater --disable-missing-files-check
`);

module.exports = {
    connectObs,
    getSceneMedia,
    backupMacroFile,
    readMacroFile,
    writeMacroFile,
    summariseMacros,
    updatePrerecViaFile,
    startupObs,
    shutdownObs,
};