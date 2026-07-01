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

const readMacroFile = () => JSON.parse(
    fs.readFileSync(process.env.OBS_SC_PATH, 
        { encoding: 'utf8' }));

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

function getCalendarFromMp3s() {

    const regex = /.*\.(mp3|m4a)$/;
    console.log(`scanning ${process.env.PLAYLIST_PATH} to find files using regex ${regex}`);
    const mp3s = fs
        .readdirSync(
            process.env.PLAYLIST_PATH, 
            { recursive: true })
        .filter(file => file.match(regex) !== null)
    return mp3s.map(mp3 => {
        const udts = id3.read(mp3)?.userDefinedText;
        const [ djName, date, slot ] = [ 'DJ', 'Air Date', 'Slot' ]
            .map(d => udts.find(u => u.description === d)?.value);
        if(djName !== null || date !== null) return { file: mp3, djName: djName, date: date, slot: slot };
    });
}


const generateDateTimeString = (date, time) => 
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] + ' ' + 
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()] + ' ' +
    date.getDate() + ' ' +
    time + ' ' +
    date.getFullYear();


module.exports = {
    connectObs,
    getSceneMedia,
    readMacroFile,
    summariseMacros,
    getCalendarFromMp3s,
};