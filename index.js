require('dotenv').config();

const express = require('express');
const app = express();
app.use(express.json());
const port = process.env.PORT;
const service = require('./obs-service');
const HEADER_APIKEY = 'x-api-key';

async function failsPrecheck(req, res) {
    if(req.get(HEADER_APIKEY)!== process.env.OBS_APIKEY) {
        res.status(401).send('API key was wrong or missing');
        return true;
    }
    await service.connectObs();
}

app.get('/summary', async (req, res) => {
    if(failsPrecheck) return;

    const profileSettings = service.readMacroFile();
    const macroSummary = await service.summariseMacros(profileSettings);
    const variables = profileSettings
        .modules['advanced-scene-switcher']
        .variables;

    res.send({ macros: macroSummary, variables: variables });

});

app.post('/macro/enable', async (req, res) => {

    if(failsPrecheck) return;

    const macroName = req.body.name;
    const macroState = req.body.state == "enabled" ? 
        true : req.body.state == "disabled" ? false : null;
    if(macroState === null) {
        res.status(400).send('Coundn\'t understand input');
        return;
    }
    const profileSettings = await readMacroFile();
    const updatedProfileSettings = 
        await service.enableMacro(profileSettings, macroName, macroState);
    await writeMacroFile(updatedProfileSettings);
    res.status(200);

});

app.post('/prerec_refresh', async (req, res) => {

    if(failsPrecheck) return;

    const regex = /codesouth (.*) ([0-9\-]+)\.(mp3|m4a)$/;
    const dateNow = Date.now();
    const prerecUpdates = fs
        .readdirDync(
            process.env.PLAYLIST_PATH, 
            { recursive: true })
        .map(file => file.match(regex))
        .filter(([,,airDate]) => Date.parse(airDate > dateNow));

    prerecUpdates.map(async ([djName, path]) => 
        await service.updatePrerecViaObs(djName, path));
    await service.shutdowonObs();
    const profileSettings = service.readMacroFile();
    await service.backupMacroFile();
    const updatedProfileSettings = 
        prerecUpdates.map(async ([djName, date]) => 
            await service.updatePrerecViaFile(
                profileSettings, djName, Date.parse(date)));
    await service.writeMacroFile(updatedProfileSettings);
    await service.startupObs();

    res.status(200).send();

});

app.listen(port, () => {
    console.log(`OBS CS app listening on port ${port}`)
});