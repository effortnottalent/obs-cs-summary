const service = require('./obs-service');
const handlers = require('./handlers');
const fs = require('fs');
jest.mock('fs', () => ({
    readdirSync: jest.fn().mockResolvedValue()}));

jest.mock('./obs-websocket-facade');
jest.mock('./obs-service');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.resetAllMocks();
});

test('no header fails precheck', async () => {
    const req = {
        get: (header) => { return 'not real one' }};
    const res = mockRes();
    const isFailing = await handlers.failsPrecheck(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(service.connectObs).toHaveBeenCalledTimes(0);
    expect(isFailing);
});

test('correct header connects OBS', async () => {
    const req = {
        get: (header) => { return process.env.OBS_APIKEY }};
    const res = mockRes();
    const isFailing = await handlers.failsPrecheck(req, res);
    expect(res.status).toHaveBeenCalledTimes(0);
    expect(service.connectObs).toHaveBeenCalledTimes(1);
    expect(!isFailing);
});

test('summary - no header fails precheck', async () => {
    const req = {
        get: (header) => { return 'not real one' }};
    const res = mockRes();
    await handlers.summary(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(service.connectObs).toHaveBeenCalledTimes(0);
});

test('summary', async () => {
    const profileSettings = JSON.parse(`
{
    "modules": {
        "advanced-scene-switcher": {
            "variables": [{ "variable": "value" }]
        }
    }
}
    `);
    const req = {
        get: (header) => { return process.env.OBS_APIKEY }};
    const res = mockRes();
    service.readMacroFile.mockImplementation(() => profileSettings);
    service.summariseMacros.mockImplementation(() => 'summary');

    await handlers.summary(req, res);

    expect(service.readMacroFile).toHaveBeenCalledTimes(1);
    expect(service.summariseMacros).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith({
        macros: 'summary', variables: [{ variable: 'value' }]});
});

test('enable macro', async () => {
    const profileSettings = JSON.parse(`
{
    "modules": {
        "advanced-scene-switcher": {
            "variables": [{ "variable": "value" }]
        }
    }
}
    `);
    const req = {
        get: (header) => { return process.env.OBS_APIKEY },
        body: { name: 'macro 1', state: 'enabled' }};
    const res = mockRes();
    service.readMacroFile.mockImplementation(() => profileSettings);

    await handlers.macroEnable(req, res);

    expect(service.readMacroFile).toHaveBeenCalledTimes(1);
    expect(service.enableMacro).toHaveBeenCalledTimes(1);
    expect(service.writeMacroFile).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);

});

test('enable macro but get fields wrong', async () => {
    const profileSettings = JSON.parse(`
{
    "modules": {
        "advanced-scene-switcher": {
            "variables": [{ "variable": "value" }]
        }
    }
}
    `);
    const req = {
        get: (header) => { return process.env.OBS_APIKEY },
        body: { name: 'macro 1' }};
    const res = mockRes();
    service.readMacroFile.mockImplementation(() => profileSettings);

    await handlers.macroEnable(req, res);

    expect(service.readMacroFile).toHaveBeenCalledTimes(0);
    expect(service.enableMacro).toHaveBeenCalledTimes(0);
    expect(service.writeMacroFile).toHaveBeenCalledTimes(0);
    expect(res.status).toHaveBeenCalledWith(400);

});

test('enable macro but get macro wrong', async () => {
    const req = {
        get: (header) => { return process.env.OBS_APIKEY },
        body: { name: 'macro 1', state: 'enabled' }};
    const res = mockRes();
    service.readMacroFile.mockImplementation(() => {});
    service.enableMacro.mockImplementation(() => { throw new Error() });

    await expect(() => handlers.macroEnable(req, res)).rejects.toThrow(Error);

    expect(service.readMacroFile).toHaveBeenCalledTimes(1);
    expect(service.enableMacro).toThrow(Error);
    expect(service.writeMacroFile).toHaveBeenCalledTimes(0);

});

test('refresh noop when no files are present', async () => {
    const req = {
        get: (header) => { return process.env.OBS_APIKEY }};
    const res = mockRes();
    fs.readdirSync.mockImplementation((path, data) => []);

    await handlers.prerecRefresh(req, res);

    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(service.updatePrerecViaObs).toHaveBeenCalledTimes(0);
    expect(service.updatePrerecViaFile).toHaveBeenCalledTimes(0);
    expect(service.shutdownObs).toHaveBeenCalledTimes(0);
    expect(service.readMacroFile).toHaveBeenCalledTimes(0);
    expect(service.writeMacroFile).toHaveBeenCalledTimes(0);
    expect(service.startupObs).toHaveBeenCalledTimes(0);
    expect(res.status).toHaveBeenCalledWith(200);

});

test('refresh noop when old files are present', async () => {
    const req = {
        get: (header) => { return process.env.OBS_APIKEY }};
    const res = mockRes();
    const dateString = new Date(Date.now() - 24 * 3600 * 2000 * 7)
        .toISOString().substring(0,10);
    fs.readdirSync.mockImplementation((path, data) => [
        `./codesouth dj woooo ${dateString}.mp3`
    ]);

    await handlers.prerecRefresh(req, res);

    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(service.updatePrerecViaObs).toHaveBeenCalledTimes(0);
    expect(service.updatePrerecViaFile).toHaveBeenCalledTimes(0);
    expect(service.shutdownObs).toHaveBeenCalledTimes(0);
    expect(service.readMacroFile).toHaveBeenCalledTimes(0);
    expect(service.writeMacroFile).toHaveBeenCalledTimes(0);
    expect(service.startupObs).toHaveBeenCalledTimes(0);
    expect(res.status).toHaveBeenCalledWith(200);

});

test('refresh when new files are present', async () => {
    const req = {
        get: (header) => { return process.env.OBS_APIKEY }};
    const res = mockRes();
    const dateString1 = new Date(Date.now() + 24 * 3600 * 2000 * 7)
        .toISOString().substring(0,10);
    const dateString2 = new Date(Date.now() + 24 * 3600 * 2000 * 7)
        .toISOString().substring(0,10);
    fs.readdirSync.mockImplementation((path, data) => [
        `./codesouth dj woooo ${dateString1}.mp3`,
        `./codesouth dj woooo ${dateString2}.mp3`,
    ]);

    await handlers.prerecRefresh(req, res);

    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(service.updatePrerecViaObs).toHaveBeenCalledTimes(2);
    expect(service.updatePrerecViaFile).toHaveBeenCalledTimes(2);
    expect(service.shutdownObs).toHaveBeenCalledTimes(1);
    expect(service.readMacroFile).toHaveBeenCalledTimes(1);
    expect(service.writeMacroFile).toHaveBeenCalledTimes(1);
    expect(service.startupObs).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);

});