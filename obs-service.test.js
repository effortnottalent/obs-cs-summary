const facade = require('./obs-websocket-facade');
const service = require('./obs-service');
const { exec } = require('child_process');
const fs = require('fs');
const id3 = require('node-id3');

jest.mock('./obs-websocket-facade');
jest.mock('child_process');
jest.mock('fs', () => ({
    writeFileSync: jest.fn().mockResolvedValue(),
    copyFileSync: jest.fn().mockResolvedValue(),
    readFileSync: jest.fn().mockResolvedValue() }));
jest.mock('node-id3');

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
    service.backupMacroFile();
    const [actualSource, actualDest] = fs.copyFileSync.mock.calls[0];
    expect(actualSource).toEqual(process.env.OBS_SC_PATH);
    const regex = new RegExp(`^${process.env.OBS_SC_PATH}.\\d{10,}$`);
    expect(actualDest.match(regex)).not.toBeNull();
});

test('write file makes backup', async () => {
    const json = { a: 1 };
    service.writeMacroFile(json);
    const [actualDest, actualJson] = fs.writeFileSync.mock.calls[0];
    expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
    expect(actualDest).toEqual(process.env.OBS_SC_PATH);
    expect(JSON.parse(actualJson)).toEqual(json);
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
    },
    "sources": [{
        "name": "mock source macro 1",
        "settings": {
            "local_file": "/playlist/path/old/path.mp3"
        }
    }]
}
    `);
    id3.read.mockImplementation(path => ({
        userDefinedText: [{
            description: 'cs_dj_name', value: 'macro 1'
        }, {
            description: 'cs_air_date', value: '2025-11-01'
        }]
    }));
    const updatedProfileSettings = await service.updatePrerecViaFile(
        profileSettings, 'new/path.mp3');
    expect(profileSettings).not.toEqual(updatedProfileSettings);
    expect(updatedProfileSettings
        .modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === 'mock macro 1')[0]
        .conditions[0]
        .dateTime)
        .toEqual('Sat Nov 1 14:42:00 2025');
    expect(updatedProfileSettings
        .sources.filter(source => source.name === 'mock source macro 1')[0]
        .settings
        .local_file)
        .toEqual('/playlist/path/new/path.mp3');
    
});

test('update non-existing macro doesn\'t change file', async () => {
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
    },
    "sources": [{
        "name": "mock source macro 1",
        "settings": {
            "local_file": "/old/path.mp3"
        }
    }]
}
    `);
    id3.read.mockImplementation(path => ({
        userDefinedText: [{
            description: 'cs_dj_name', value: 'macro 3'
        }, {
            description: 'cs_air_date', value: '2025-11-01'
        }]
    }));
    const updatedProfileSettings = service.updatePrerecViaFile(
        profileSettings, 'new/path.mp3');
    expect(profileSettings).toEqual(updatedProfileSettings);
    
});

test('update non-existing source doesn\'t change file', async () => {
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
    },
    "sources": [{
        "name": "mock source macro 2",
        "settings": {
            "local_file": "/old/path.mp3"
        }
    }]
}
    `);
    id3.read.mockImplementation(path => ({
        userDefinedText: [{
            description: 'cs_dj_name', value: 'macro 1'
        }, {
            description: 'cs_air_date', value: '2025-11-01'
        }]
    }));
    const updatedProfileSettings = service.updatePrerecViaFile(
        profileSettings, 'new/path.mp3');
    expect(profileSettings).toEqual(updatedProfileSettings);
    
});


test('file without id3 doesn\'t change file', async () => {
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
    },
    "sources": [{
        "name": "mock source macro 2",
        "settings": {
            "local_file": "/old/path.mp3"
        }
    }]
}
    `);
    expect(() => service.updatePrerecViaFile(
        profileSettings, 'new/path.mp3')).toThrow(Error);
    
});