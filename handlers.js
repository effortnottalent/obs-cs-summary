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

    res.send({ macros: macroSummary, variables: variables });
}

async function macroEnable(req, res) {

    if(await failsPrecheck(req, res)) return;

    const macroName = req.body.name;
    const macroState = req.body.state == "enabled" ? 
        true : req.body.state == "disabled" ? false : null;
    if(macroState === null) {
        res.status(400).send('Coundn\'t understand input');
        return;
    }
    const profileSettings = await service.readMacroFile();
    const updatedProfileSettings = 
        service.enableMacro(profileSettings, macroName, macroState);
    await service.writeMacroFile(updatedProfileSettings);
    res.status(200);

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
        .filter(([,,airDate]) => Date.parse(airDate) > dateNow);
    if(prerecUpdates.length === 0) {
        res.status(200).send();
        return;
    }
    prerecUpdates.map(async ([djName, path]) => 
        await service.updatePrerecViaObs(djName, path));
    await service.shutdownObs();
    const profileSettings = service.readMacroFile();
    const updatedProfileSettings = 
        prerecUpdates.map(async ([djName, date]) => 
            await service.updatePrerecViaFile(
                profileSettings, djName, Date.parse(date)));
    await service.writeMacroFile(updatedProfileSettings);
    await service.startupObs();

    res.status(200).send();

}

module.exports = {
    summary,
    macroEnable,
    prerecRefresh,
    failsPrecheck
}