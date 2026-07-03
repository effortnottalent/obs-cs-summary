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
