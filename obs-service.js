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

    if(sceneUuid === null || sceneUuid === undefined) return [];
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

    console.log('generating summary from profile json');
    const macros = profileSettings.modules['advanced-scene-switcher'].macros;
    const { scenes, currentProgramSceneName } = await obs.getSceneList();
    return ({
        currentProgramSceneName: currentProgramSceneName, 
        summary: await Promise.all(macros.map(async macro => ({
            name: macro.name,
            enabled: !macro.pause,
            triggers: macro.conditions ? macro.conditions
                .filter(condition => condition.id === 'date')
                .map(condition => ({
                    time: condition.dateTime,
                    logic: logic[condition.logic]
                })) : [],
            scenes: macro.actions ? await Promise.all(macro.actions
                .filter(action => action.id === 'scene_switch')
                .map(async action => ({
                    name: action.sceneSelection.name,
                    //media: "mock input"
                    media: await getSceneMedia(
                        scenes.find(scene => scene.sceneName === 
                            action.sceneSelection.name)?.sceneUuid)
                }))) : [],
            macros: macro.actions ? macro.actions
                .filter(action => action.id === 'sequence')
                .map(action => ({
                        name: action.macros.map(macro => macro.macro).join(', ')})) : []
        })))});
}

function isCalendarRefreshNeeded() {
    
    const calendarFile = process.env.PLAYLIST_PATH + '/' + process.env.MP3_CALENDAR_FILE;
    if(!fs.existsSync(calendarFile)) return true;
    const calendarFileMTime = fs.statSync(calendarFile).mtime;    
    const mp3s = getMp3Files()
        .filter(file => fs.statSync(process.env.PLAYLIST_PATH + '/' + file)
            .mtime > calendarFileMTime);
    return mp3s.length > 0;

}

function getMp3Files() {
    const regex = /.*\.(mp3|m4a)$/;
    return fs
        .readdirSync(
            process.env.PLAYLIST_PATH, 
            { recursive: false })
        .filter(file => file.match(regex) !== null);
}

function getMp3Calendar() {

    console.log('getting calendar');
    const mp3CalendarPath = process.env.PLAYLIST_PATH + '/' + 
        process.env.MP3_CALENDAR_FILE;
    if(isCalendarRefreshNeeded()) {
        console.log(`calendar refresh needed, generating to ${mp3CalendarPath}`);
        const mp3Calendar = refreshCalendarFromMp3s();
        fs.writeFileSync(mp3CalendarPath, 
            JSON.stringify(mp3Calendar, null, 2));
        return mp3Calendar;
    } else {
        console.log(`calendar refresh not needed, serving from ${mp3CalendarPath}`);
        return JSON.parse(fs.readFileSync(mp3CalendarPath, 
            { encoding: 'utf8' }));
    }
}

function refreshCalendarFromMp3s() {

    return getMp3Files().map(mp3 => {
        const udts = id3.read(process.env.PLAYLIST_PATH + '/' + mp3)?.userDefinedText;
        if(udts === null || udts === undefined) return null;
        const mp3Info = udts.find(u => u.description === 'CS scheduling json')?.value;
        if(mp3Info !== null && mp3Info !== undefined) {
            const mp3json = JSON.parse(mp3Info);
            return { 
                file: mp3, 
                djName: mp3json['DJ'], 
                date: mp3json['Air Date'], 
                slot: mp3json['Slot']
            };
        }
    }).filter(item => item !== null);
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
    getMp3Calendar,
    isCalendarRefreshNeeded,
    refreshCalendarFromMp3s,
};