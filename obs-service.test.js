const facade = require('./obs-websocket-facade');
const service = require('./obs-service');
const { exec } = require('child_process');
const fs = require('fs');

jest.mock('./obs-websocket-facade');
jest.mock('child_process');
jest.mock('fs');

beforeEach(() => {
  jest.resetAllMocks();
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
    const updatedProfileSettings = await service.enableMacro(profileSettings, 'mock macro 2', false);
    expect(updatedProfileSettings
        .modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === 'mock macro 1')[0]
        .pause).toEqual(false);
    expect(updatedProfileSettings
        .modules['advanced-scene-switcher']
        .macros.filter(macro => macro.name === 'mock macro 2')[0]
        .pause).toEqual(true);
    
});


test('supdate macro with new date', async () => {
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