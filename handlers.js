const service = require('./obs-service');
const fs = require('fs');

async function failsPrecheck(req, res) {
    if(req.get(process.env.HEADER_APIKEY)!== process.env.OBS_APIKEY) {
        res.status(401).send('API key was wrong or missing');
        return true;
    }
    await service.connectObs();
}

async function summary(req, res) {
    
    if(await failsPrecheck(req, res)) return;

    const profileSettings = await service.readMacroFile();
    const macroSummary = await service.summariseMacros(profileSettings);
    const variables = profileSettings
        .modules['advanced-scene-switcher']
        .variables;

    res.status(200).send({ macros: macroSummary, variables: variables });
}

async function prerecRefresh(req, res) {

    if(await failsPrecheck(req, res)) return;

    const regex = /codesouth (.*) ([0-9\-]+)\.(mp3|m4a)$/;
    const dateNow = Date.now();
    const prerecUpdates = fs
        .readdirSync(
            process.env.PLAYLIST_PATH, 
            { recursive: true })
        .map(file => file.match(regex))
        .filter(matches => matches !== null)
        .filter(([,,airDate]) => Date.parse(airDate) > dateNow);
    if(prerecUpdates.length === 0) {
        res.status(200).send({});
        return;
    }
    try {
        await service.shutdownObs();
    } catch (e) {}
    const profileSettings = service.readMacroFile();
    const updatedProfileSettings = prerecUpdates.reduce(
        (acc, [path, djName, date]) => service.updatePrerecViaFile(
            profileSettings, djName, path, date),
        profileSettings);
    service.writeMacroFile(updatedProfileSettings);
    await service.startupObs();

    res.status(200).send({});

}

module.exports = {
    summary,
    prerecRefresh,
    failsPrecheck
}