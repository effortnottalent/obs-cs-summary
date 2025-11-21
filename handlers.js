const service = require('./obs-service');
const fs = require('fs');
const jsonDiff = require('json-diff');

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

    const regex = /.*\.(mp3|m4a)$/;
    console.log(`scanning ${process.env.PLAYLIST_PATH} to find files using regex ${regex}`);
    const dateNow = Date.now();
    const prerecUpdates = fs
        .readdirSync(
            process.env.PLAYLIST_PATH, 
            { recursive: true })
        .filter(file => file.match(regex) !== null)
    console.log(`...found: ${prerecUpdates}`);
    if(prerecUpdates.length === 0) {
        res.status(200).send({});
        return;
    }

    const profileSettings = service.readMacroFile();
    const updatedProfileSettings = prerecUpdates.reduce(
        (acc, path) => service.updatePrerecViaFile(acc, path),
        profileSettings);
    
    if(jsonDiff.diff(profileSettings, updatedProfileSettings)) {
        console.log('updates made! restarting OBS');
        try {
            await service.shutdownObs();
        } catch (e) {}
        service.writeMacroFile(updatedProfileSettings);
        await service.startupObs();
    } else {
        console.log('no changes, not restarting OBS');
    }

    res.status(200).send({});

}

module.exports = {
    summary,
    prerecRefresh,
    failsPrecheck
}