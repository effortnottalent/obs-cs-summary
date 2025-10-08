require('dotenv').config();

const express = require('express');
const app = express();
app.use(express.json());
const port = process.env.PORT;
const { summary, macroEnable, prerecRefresh } = require('./summary');

app.get('/summary', summary);
app.post('/macro/enable', macroEnable);
app.post('/prerec_refresh', prerecRefresh);

app.listen(port, () => {
    console.log(`OBS CS app listening on port ${port}`)
});