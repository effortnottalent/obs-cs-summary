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

    console.log(`generating summary from ${process.env.OBS_SC_PATH} and mp3s uploaded`);
    const profileSettings = await service.readMacroFile();
    const summary = (await service.summariseMacros(profileSettings));
    res.status(200).send({ 
        currentScene: summary.currentProgramSceneName,
        macros: summary.summary, 
        variables: profileSettings
            .modules['advanced-scene-switcher']
            .variables, 
        calendar: service.getMp3Calendar()  
    });
}

module.exports = {
    summary,
    failsPrecheck
}