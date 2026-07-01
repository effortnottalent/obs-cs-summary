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

test('get schedule details from mp3', () => {

    fs.readdirSync.mockReturnValue(['mock.mp3', 'not-mock.txt']);
    id3.read.mockReturnValue({
        userDefinedText: [
            { description: 'DJ', value: 'slipmatt' },
            { description: 'Air Date', value: '2026-06-03' },
            { description: 'Slot', value: 11 }
        ]
    });
    const calendar = service.getCalendarFromMp3s();
    expect(calendar).toEqual([{
        file: 'mock.mp3',
        djName: 'slipmatt',
        date: '2026-06-03',
        slot: 11
    }]);
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
    expect(summary[0].name).toEqual('mock macro 1');
    expect(summary[0].enabled).toEqual(true);
    expect(summary[0].scenes[0].name).toEqual('mock scene 2');
    expect(summary[0].scenes[0].media[0]).toEqual('mock input');
    expect(summary[0].triggers[0].time).toEqual('Sun Sep 28 14:42:00 2025');
    expect(summary[0].triggers[0].logic).toEqual('default');
    
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
    expect(summary[0].name).toEqual('mock macro 1');
    expect(summary[0].enabled).toEqual(true);
    expect(summary[0].triggers[0].time).toEqual('Sun Sep 28 14:42:00 2025');
    expect(summary[0].triggers[0].logic).toEqual('default');
    expect(summary[0].macros[0].name).toEqual('mock scene 2');
    
});
