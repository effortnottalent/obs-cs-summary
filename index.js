require('dotenv').config();

const express = require('express');
const app = express();
app.use(express.json());
const port = process.env.PORT;
const { summary, prerecRefresh } = require('./handlers');

app.get('/summary', summary);
app.get('/prerec_refresh', prerecRefresh);

app.listen(port, () => {
    console.log(`OBS CS app listening on port ${port}`)
});