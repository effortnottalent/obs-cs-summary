const facade = require('./obs-websocket-facade');
const service = require('./obs-service');
const { exec } = require('child_process');
const fs = require('fs');
const id3 = require('node-id3');

jest.mock('./obs-websocket-facade');
jest.mock('child_process');
jest.mock('fs');
jest.mock('node-id3');

beforeEach(() => {
  jest.resetAllMocks();
});

test('no need for generate if there\'s no new mp3s', () => {

    fs.readdirSync.mockReturnValue(['mock.mp3']);
    const fsMock = fs.statSync
        .mockReturnValueOnce({ mtime: new Date('2026-06-03T12:00:00Z') })
        .mockReturnValueOnce({ mtime: new Date('2026-06-02T12:00:00Z') });
    const needed = service.isCalendarRefreshNeeded();
    expect(needed).toEqual(false);
    expect(fsMock).toHaveBeenNthCalledWith(1, 
        process.env.PLAYLIST_PATH + '/' + process.env.MP3_CALENDAR_FILE);
    expect(fsMock).toHaveBeenNthCalledWith(2, 
        process.env.PLAYLIST_PATH + '/mock.mp3');

});

test('need for generate if there is a new mp3', () => {

    fs.readdirSync.mockReturnValue(['mock.mp3']);
    const fsMock = fs.statSync
        .mockReturnValueOnce({ mtime: new Date('2026-06-02T12:00:00Z') })
        .mockReturnValueOnce({ mtime: new Date('2026-06-03T12:00:00Z') });
    const needed = service.isCalendarRefreshNeeded();
    expect(needed).toEqual(true);
    expect(fsMock).toHaveBeenNthCalledWith(1, 
        process.env.PLAYLIST_PATH + '/' + process.env.MP3_CALENDAR_FILE);
    expect(fsMock).toHaveBeenNthCalledWith(2, 
        process.env.PLAYLIST_PATH + '/mock.mp3');

});

test('get calendar info from mp3s', () => {
    fs.readdirSync.mockReturnValue(['mock.mp3']);
    id3.read.mockReturnValue({
        userDefinedText: [
            { description: 'CS scheduling json', value: '{"DJ":"mock DJ","Air Date":"mock date","Slot":"mock slot"}' }
        ]
    });
    const calendar = service.refreshCalendarFromMp3s();
    expect(calendar[0].file).toEqual('mock.mp3');
    expect(calendar[0].djName).toEqual('mock DJ');
    expect(calendar[0].date).toEqual('mock date');
    expect(calendar[0].slot).toEqual('mock slot');
});

test('generate calendar if needed', () => {
    fs.readdirSync.mockReturnValue(['mock.mp3']);
    const fsMock = fs.statSync
        .mockReturnValueOnce({ mtime: new Date('2026-06-02T12:00:00Z') })
        .mockReturnValueOnce({ mtime: new Date('2026-06-03T12:00:00Z') });
    fs.writeFileSync = jest.fn();
    service.getMp3Calendar();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(0);
    jest.restoreAllMocks();
});

test('read file if calendar not needed', () => {
    fs.readdirSync.mockReturnValue(['mock.mp3']);
    const fsMock = fs.statSync
        .mockReturnValueOnce({ mtime: new Date('2026-06-03T12:00:00Z') })
        .mockReturnValueOnce({ mtime: new Date('2026-06-02T12:00:00Z') });
    fs.readFileSync = jest.fn().mockReturnValue('{}');
    const calendar = service.getMp3Calendar();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(0);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(calendar).toEqual({});
});

test('connect to OBS if not connected', async () => {
    facade.connect.mockImplementation((username, password, data) => { 
        return { 
            obsWebSocketVersion: 'mock ob version', 
            negotiatedRpcVersion: 'mock rpc version'}});
    await service.connectObs();
    expect(facade.connect).toHaveBeenCalledTimes(1);
});

test('don\'t connect to OBS if connected', async () => {
    facade.connect.mockImplementation((username, password, data) => { 
        return { 
            obsWebSocketVersion: 'mock ob version', 
            negotiatedRpcVersion: 'mock rpc version'}});
    service.isObsConnected = true;
    await service.connectObs();
    expect(facade.connect).toHaveBeenCalledTimes(0);
});

test('get scene media - input set', async () => {
    facade.getSceneItemList.mockImplementation(() => (
        { sceneItems: [{ sourceUuid: 'mock sourceUuid' }]}));
    facade.getInputSettings.mockImplementation(() => (
        { inputSettings: { input: 'mock input' }}));
    expect(await service.getSceneMedia('mock sceneUuid')).toEqual(['mock input']);
});

test('get scene media - local_file set', async () => {
    facade.getSceneItemList.mockImplementation(() => (
        { sceneItems: [{ sourceUuid: 'mock sourceUuid' }]}));
    facade.getInputSettings.mockImplementation(() => (
        { inputSettings: { local_file: 'mock local file' }}));
    expect(await service.getSceneMedia('mock sceneUuid')).toEqual(['mock local file']);
});

test('get scene media - playlist set', async () => {
    facade.getSceneItemList.mockImplementation(() => (
        { sceneItems: [{ sourceUuid: 'mock sourceUuid' }]}));
    facade.getInputSettings.mockImplementation(() => (
        { inputSettings: { playlist: [ { value: 'mock entry 1' }, { value: 'mock entry 2' }]}}));
    expect(await service.getSceneMedia('mock sceneUuid')).toEqual([ 'mock entry 1', 'mock entry 2' ]);
});

test('summarise all macros', async () => {
    facade.getInputSettings.mockImplementation(() => (
        { inputSettings: { input: 'mock input' }}));
    facade.getSceneItemList.mockImplementation(() => (
        { sceneItems: [{ sourceUuid: 'mock sourceUuid' }]}));
    facade.getSceneList.mockImplementation(() => ({
        scenes: [{ sceneName: 'mock scene 1' },{ 
            sceneName: 'mock scene 2',
            sceneUuid: 'mock sceneUuid'
    }]}));
    const profileSettings = JSON.parse(`
{
    "modules": {
        "advanced-scene-switcher": {
            "macros": [{
                "name": "mock macro 1",
                "pause": false,
                "conditions": [{
                    "id": "date",
                    "dateTime": "Sun Sep 28 14:42:00 2025",
                    "logic": 0
                }],
                "actions": [{
                    "id": "scene_switch",
                    "sceneSelection": {
                        "name": "mock scene 2"
                    }
                }]
            }]
        }
    }
}
    `);
    const summary = await service.summariseMacros(profileSettings);
    expect(summary.summary[0].name).toEqual('mock macro 1');
    expect(summary.summary[0].enabled).toEqual(true);
    expect(summary.summary[0].scenes[0].name).toEqual('mock scene 2');
    expect(summary.summary[0].scenes[0].media[0]).toEqual('mock input');
    expect(summary.summary[0].triggers[0].time).toEqual('Sun Sep 28 14:42:00 2025');
    expect(summary.summary[0].triggers[0].logic).toEqual('default');
    
});

test('summarise with macros rather than media', async () => {
    facade.getInputSettings.mockImplementation(() => (
        { inputSettings: { input: 'mock input' }}));
    facade.getSceneList.mockImplementation(() => ({
        scenes: [{ sceneName: 'mock scene 1' },{ sceneName: 'mock scene 2'}]}));
    const profileSettings = JSON.parse(`
{
    "modules": {
        "advanced-scene-switcher": {
            "macros": [{
                "name": "mock macro 1",
                "pause": false,
                "conditions": [{
                    "id": "date",
                    "dateTime": "Sun Sep 28 14:42:00 2025",
                    "logic": 0
                }],
                "actions": [{
                    "id": "sequence",
                    "macros": [{
                        "macro": "mock scene 2"
                    }]
                }]
            }]
        }
    }
}
    `);
    const summary = await service.summariseMacros(profileSettings);
    expect(summary.summary[0].name).toEqual('mock macro 1');
    expect(summary.summary[0].enabled).toEqual(true);
    expect(summary.summary[0].triggers[0].time).toEqual('Sun Sep 28 14:42:00 2025');
    expect(summary.summary[0].triggers[0].logic).toEqual('default');
    expect(summary.summary[0].macros[0].name).toEqual('mock scene 2');
    
});
