const service = require('./obs-service');
const handlers = require('./handlers');
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