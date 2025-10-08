const facade = require('./obs-websocket-facade');
const service = require('./obs-service');
const { exec } = require('child_process');
const fs = require('fs');

jest.mock('./obs-websocket-facade');
jest.mock('child_process');
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn().mockResolvedValue(),
        copyFile: jest.fn().mockResolvedValue(),
        readFile: jest.fn().mockResolvedValue() }}));

beforeEach(() => {
  jest.resetAllMocks();
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

test('backup file appends timestamp', async () => {
    await service.backupMacroFile();
    const [actualSource, actualDest] = fs.promises.copyFile.mock.calls[0];
    expect(actualSource).toEqual(process.env.OBS_SC_PATH);
    const regex = new RegExp(`^${process.env.OBS_SC_PATH}.\\d{10,}$`);
    expect(actualDest.match(regex)).not.toBeNull();
});

test('write file makes backup', async () => {
    const json = { a: 1 };
    await service.writeMacroFile(json);
    const [actualDest, actualJson] = fs.promises.writeFile.mock.calls[0];
    expect(fs.promises.copyFile).toHaveBeenCalledTimes(1);
    expect(actualDest).toEqual(process.env.OBS_SC_PATH);
    expect(JSON.parse(actualJson)).toEqual(json);
});

test('set source path on input', async () => {
    facade.setInputSettings.mockImplementation((data) => ({}));
    await service.updatePrerecViaObs('mock dj', '/test/path/to.mp3');
    const [ data ] = facade.setInputSettings.mock.calls[0];
    expect(data.inputName).toEqual(process.env.OBS_PREREC_SOURCE_PREFIX + 'mock dj');
    expect(data.inputSettings.file).toEqual('/test/path/to.mp3');
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

test('disable macro 1', async () => {
    const profileSettings = JSON.parse(`
{
    "modules": {
        "advanced-scene-switcher": {
            "macros": [{
                "name": "mock macro 1",
                "pause": false
            },{
                "name": "mock macro 2",
                "pause": false
            }]
        }
    }
}
    `);
    const updatedProfileSettings = 
        await service.enableMacro(profileSettings, 'mock macro 2', false);
    expect(updatedProfileSettings
        .modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === 'mock macro 1')[0]
        .pause).toEqual(false);
    expect(updatedProfileSettings
        .modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === 'mock macro 2')[0]
        .pause).toEqual(true);
    
});

test('disable non-existing macro, nothing should change', async () => {
    const profileSettings = JSON.parse(`
{
    "modules": {
        "advanced-scene-switcher": {
            "macros": [{
                "name": "mock macro 1",
                "pause": false
            },{
                "name": "mock macro 2",
                "pause": false
            }]
        }
    }
}
    `);
    expect(() => { service.enableMacro(
        profileSettings, 'mock macro 3', false) })
            .toThrow(Error);
});

test('update macro with new date', async () => {
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
    const updatedProfileSettings = await service.updatePrerecViaFile(
        profileSettings, 'macro 1', new Date('2025-11-01'));
    expect(updatedProfileSettings
        .modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === 'mock macro 1')[0]
        .conditions[0]
        .dateTime)
        .toEqual('Sat Nov 1 14:42:00 2025');
    
});


test('update non-existing macro throws exception', async () => {
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
    expect(() => { service.updatePrerecViaFile(
        profileSettings, 'macro 3', new Date('2025-11-01')) })
            .toThrow(Error);
    
});