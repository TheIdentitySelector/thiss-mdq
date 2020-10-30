const path = require('path');
require('@babel/register');
require('@babel/polyfill');

const app = require(path.join(__dirname, '/server.js'));
const load_metadata = require(path.join(__dirname, '/metadata.js'));

const https = require('https');
const http = require('http');
const fs = require('fs');

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT) || 3000;
const METADATA = process.env.METADATA || "/etc/metadata.json";
const BASE_URL = process.env.BASE_URL || "";
const RELOAD_ON_CHANGE = JSON.parse(process.env.RELOAD_ON_CHANGE || "true") || true;

const cluster = require('cluster');
const os = require('os');

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
        cluster.fork();
    }
} else {
    load_metadata(METADATA).then((md) => {
        app.locals.md = md
    }).then(() => runServer(app));
}
