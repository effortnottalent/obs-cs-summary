require('dotenv').config();

const cors = require('cors');
const express = require('express');
const app = express();
app.use(cors());
app.use(express.json());
const http = require('http');
const https = require('https');
const fs = require('fs');

const credentials = {
        key: fs.readFileSync(process.env.PRIVATE_KEY, 'utf8'),
        cert: fs.readFileSync(process.env.CERT, 'utf8')
};
const port = process.env.PORT;
const { summary, prerecRefresh } = require('./handlers');

app.get('/summary', summary);

http.createServer(app).listen(process.env.HTTP_PORT);
https.createServer(credentials, app).listen(process.env.HTTPS_PORT);