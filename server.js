const express = require('express');
const hex_sha1 = require('./sha1.js');
const fs = require('fs');
const https = require('https');
const http = require('http');
import { ArrayFormatter, touchp, esc_query } from "./utils";
const chokidar = require('chokidar');
const Stream = require('stream');
const Chain = require('stream-chain');
const parser = require('stream-json');
const StreamArray = require('stream-json/streamers/StreamArray');

const { lunrIndexer, redisIndexer } = require('./search-index');
const program = require('commander');

const cors = require('cors');

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT) || 3000;
const METADATA = process.env.METADATA || "/etc/metadata.json";
const BASE_URL = process.env.BASE_URL || "";
const RELOAD_INTERVAL = parseInt(process.env.RELOAD_INTERVAL) || 0;

program
    .option('-r, --redis', 'Select redis to index the metadata');
const args = program.parse(process.argv);

function _sha1_id(s) {
    return "{sha1}" + hex_sha1(s);
}

let locales = ["sv-SE", "en-US"];

class Metadata {
    constructor(file, cb) {
        let self = this;
        this.cb = cb;
        this.db = {};
        this.last_updated = new Date();
        this.count = 0;

        if (args.redis) {
            this.idx = new redisIndexer();
            this.idx.create();
        } else {
            this.idx = new lunrIndexer;
        };

        self._p = new Chain([fs.createReadStream(file), parser(), new StreamArray(), data => {
            let e = data.value;
            e.entity_id = e.entityID;
            e.id = _sha1_id(e.entityID);
            if (e.type == 'idp' && !(e.id in self.db)) {
                let doc = {
                    "id": e.id,
                    "title": e.title.toLocaleLowerCase(locales),
                };
                if (e.scope) {
                    doc.tags = e.scope.split(",").map(function(scope) {
                        let parts = scope.split('.');
                        return parts.slice(0, -1);
                    }).join(' ');
                    doc.scopes = e.scope.split(",");
                }
                this.idx.add(doc);
            }
            self.db[e.id] = e;
            ++self.count;
        }]);
        self._p.on('data', () => {});
        self._p.on('end', () => {
            if (!args.redis) {
                this.idx.build();
            };
            console.log(`loaded ${self.count} objects`);
            if (self.cb) { self.cb() }
        });
    }
}

let md = new Metadata(METADATA);
chokidar.watch(METADATA, { awaitWriteFinish: true }).on('change', (path, stats) => {
    console.log(`${METADATA} change detected ... reloading`);
    let md_new = new Metadata(METADATA, () => { md = md_new });
});

function triggerReload() {
    touchp(METADATA).then(function() { setTimeout(triggerReload, RELOAD_INTERVAL * 1000) })
}

const app = express();
const drop = ['a', 'the', 'of', 'in', 'i', 'av', 'af', 'den', 'le', 'la', 'les', 'si', 'de', 'des', 'los'];

function search(q, res) {
    if (q) {
        res.append("Surrogate-Key", `q q-${q}`);
        q = q.toLocaleLowerCase(locales);
        let ati = q.indexOf('@');
        if (ati > -1) {
            q = q.substring(ati + 1);
        }
        q = esc_query(q)
        let str = q.split(/\s+/).filter(x => !drop.includes(x));
        let matches = [str.map(x => "+" + x).join(' '), str.map(x => "+" + x + "*").join(' ')];
        console.log(matches);
        let results = {};
        for (let i = 0; i < matches.length; i++) {
            let match = matches[i];
            md.index.search(match).forEach(function(m) {
                console.log(`${match} -> ${m.ref}`);
                if (!results[m.ref]) {
                    results[m.ref] = lookup(m.ref);
                }
            });
        }
        return Object.values(results);
    } else {
        res.append("Surrogate-Key", "entities");
        return Object.values(md.db);
    }
}

function lookup(id) {
    return md.db[id];
}

function stream(a) {
    const readable = new Stream.Readable();
    a.forEach(item => readable.push(JSON.stringify(item)));
    readable.push(null);
    return readable;
}

app.get('/', (req, res) => {
    const meta = require('./package.json');
    res.append("Surrogate-Key", "meta");
    return res.json({ 'version': meta.version, 'size': md.count, 'last_updated': md.last_updated });
});

app.get('/entities/?', cors(), function(req, res) {
    let q = req.query.query || req.query.q;
    res.contentType('json');
    let format = new ArrayFormatter();
    stream(search(q, res)).pipe(format).pipe(res);
});

app.get('/entities/:path', cors(), function(req, res) {
    let id = req.params.path.split('.');
    let entity = lookup(id[0]);
    if (entity) {
        res.append("Surrogate-Key", entity.entity_id);
        return res.json(entity);
    } else {
        return res.status(404).send("Not found");
    }
});

app.head('/status', (req, res) => {
    if (md.count > 0) {
        res.append("Surrogate-Key", "meta");
        return res.status(200).send("OK");
    } else {
        return res.status(500).send("Not enough data");
    }
});

app.get('/status', (req, res) => {
    if (md.count > 0) {
        res.append("Surrogate-Key", "meta");
        return res.status(200).send("OK");
    } else {
        return res.status(500).send("Not enough data");
    }
});

app.get('/.well-known/webfinger', function(req, res) {
    let links = Object.values(md.db).map(function(e) {
        return { "rel": "disco-json", "href": `${BASE_URL}/entities/${e.id}` }
    });
    links.unshift({ "rel": "disco-json", "href": `${BASE_URL}/entities/` });
    let wf = {
        "expires": new Date().getTime() + 3600,
        "subject": BASE_URL,
        "links": links
    };
    res.append("Surrogate-Key", "meta");
    return res.json(wf);
});

if (RELOAD_INTERVAL > 0) {
    setTimeout(triggerReload, RELOAD_INTERVAL * 1000)
}

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