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
    const mp3Calendar = service.getCalendarFromMp3s();
    const variables = profileSettings
        .modules['advanced-scene-switcher']
        .variables;

    res.status(200).send({ 
        macros: macroSummary, 
        variables: variables, 
        calendar: mp3Calendar  
    });
}

module.exports = {
    summary,
    failsPrecheck
}