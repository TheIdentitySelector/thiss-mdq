import path from 'path';

import app from './server.js';
import load_metadata from './metadata.js';

import https from 'https';
import http from 'http';
import fs from 'fs';

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT) || 3000;
const METADATA = process.env.METADATA || "/etc/metadata.json";
const TRUSTINFO = process.env.TRUSTINFO || "/etc/trustinfo.json";
const BASE_URL = process.env.BASE_URL || "";
const RELOAD_ON_CHANGE = JSON.parse(process.env.RELOAD_ON_CHANGE || "true") || true;

import cluster from 'cluster';
import os from 'os';

function runServer(app) {
    if (process.env.SSL_KEY && process.env.SSL_CERT) {
        let options = {
            'key': fs.readFileSync(process.env.SSL_KEY),
            'cert': fs.readFileSync(process.env.SSL_CERT)
        };
        https.createServer(options, app).listen(PORT, function() {
            console.log(`HTTPS listening on ${HOST}:${PORT}`);
        });
    } else {
        http.createServer(app).listen(PORT, function() {
            console.log(`HTTP listening on ${HOST}:${PORT}`);
        })
    }
}

cluster.on('exit', function (worker) {
  console.log(`Worker ${worker.id} died'`);
  console.log(`Staring a new one...`);
  cluster.fork();
});

if (cluster.isMaster) {
    const cpuCount = os.cpus().length;
    for (let j = 0; j < cpuCount; j++) {
        console.log(`Forking ${j}`);
        cluster.fork();
    }
} else {
    load_metadata(METADATA, TRUSTINFO).then((md) => {
        app.locals.md = md;
        console.log('Loaded metadata');
    }).then(() => runServer(app));
}
