const express = require('express');
const hex_sha1 = require('./sha1.js');
const lunr = require('lunr');
const fs = require('fs');
const https = require('https');
const http = require('http');
import {ArrayFormatter} from "./utils";

const Stream = require('stream');

const cors = require('cors');

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;
const METADATA = process.env.METADATA || "/etc/metadata.json";
const BASE_URL = process.env.BASE_URL || "";

function _sha1_id(s) {
    return "{sha1}" + hex_sha1(s);
}

let db = {};
let count = 0;
let last_updated = new Date();
const metadata = JSON.parse(fs.readFileSync(METADATA));

let locales = ["sv-SE", "en-US"];

let index = lunr(function () {
    this.pipeline.remove(lunr.trimmer);
    this.field('title');
    this.field('tags');
    this.field('scopes');

    for (let i = 0; i < metadata.length; i++) {
        let e = metadata[i];
        e.entity_id = e.entityID;
        e.id = _sha1_id(e.entityID);
        if (e.type == 'idp') {
            let doc = {
                "id": e.id,
                "title": e.title.toLocaleLowerCase(locales),
            };
            if (e.scope) {
                doc.tags = e.scope.split(",").map(function (scope) {
                    let parts = scope.split('.');
                    return parts.slice(0, -1);
                }).join(' ');
                doc.scopes = e.scope.split(",");
            }
            this.add(doc);
        }
        db[e.id] = e;
        count++;
    }
    console.log(`loaded ${count} objects`);
});

const app = express();

function search(q, res) {
    if (q) {
        res.append("Surrogate-Key", `q q-${q}`);
        q = q.toLocaleLowerCase(locales);
        let ati = q.indexOf('@');
        if (ati > -1) {
            q = q.substring(ati + 1);
        }
        let matches = [q.split(/\s+/).map(x => "+" + x).join(' '), q.split(/\s+/).map(x => "+" + x + "*").join(' ')];
        for (let i = 0; i < matches.length; i++) {
            let match = matches[i];
            //console.log(match);
            let res = index.search(match).map(function (m) {
                console.log(m);
                return lookup(m.ref);
            });
            if (res && res.length > 0) {
                return res;
            }
        }
        ;
        return [];
    } else {
        res.append("Surrogate-Key", "entities");
        return Object.values(db);
    }
}

function lookup(id) {
    return db[id];
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
    return res.json({'version': meta.version, 'size': count, 'last_updated': last_updated});
});

app.get('/entities/?', cors(), function (req, res) {
    let q = req.query.query || req.query.q;
    res.contentType('json');
    let format = new ArrayFormatter();
    stream(search(q, res)).pipe(format).pipe(res);
});

app.get('/entities/:path', cors(), function (req, res) {
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
    if (count > 0) {
        res.append("Surrogate-Key", "meta");
        return res.status(200).send("OK");
    } else {
        return res.status(500).send("Not enough data");
    }
});

app.get('/status', (req, res) => {
    if (count > 0) {
        res.append("Surrogate-Key", "meta");
        return res.status(200).send("OK");
    } else {
        return res.status(500).send("Not enough data");
    }
});

app.get('/.well-known/webfinger', function (req, res) {
    let links = Object.values(db).map(function (e) {
        return {"rel": "disco-json", "href": `${BASE_URL}/entities/${e.id}`}
    });
    links.unshift({"rel": "disco-json", "href": `${BASE_URL}/entities/`});
    let wf = {
        "expires": new Date().getTime() + 3600,
        "subject": BASE_URL,
        "links": links
    };
    res.append("Surrogate-Key", "meta");
    return res.json(wf);
});

if (process.env.SSL_KEY && process.env.SSL_CERT) {
    let options = {
        'key': fs.readFileSync(process.env.SSL_KEY),
        'cert': fs.readFileSync(process.env.SSL_CERT)
    };
    http.createServer(options, app).listen(PORT, function () {
        console.log(`HTTPS listening on ${HOST}:${PORT}`);
    });
} else {
    http.createServer(app).listen(PORT, function () {
        console.log(`HTTP listening on ${HOST}:${PORT}`);
    })
}