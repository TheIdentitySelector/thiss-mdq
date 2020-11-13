const express = require('express');
import { ArrayFormatter } from "./utils";
const Stream = require('stream');
const cors = require('cors');
let compression = require('compression')
const fsp = require("fs").promises;

const CACHE_TIME = parseInt(process.env.CACHE_TIME) || 3600;
const S_MAXAGE = parseInt(process.env.S_MAXAGE) || CACHE_TIME;
const MAXAGE = parseInt(process.env.MAXAGE) || CACHE_TIME;
const CONTENT_CACHE_HEADER = process.env.CONTENT_CACHE_HEADER || `s-maxage=${S_MAXAGE}, max-age=${MAXAGE}`;
const META_CACHE_HEADER = process.env.META_CACHE_HEADER || "private, no-store";

const app = express();
app.use(compression());

const start_time = new Date();

function stream(a) {
    const readable = new Stream.Readable();
    a.forEach(item => readable.push(JSON.stringify(item)));
    readable.push(null);
    return readable;
}

app.get('/', async (req, res) => {
    const meta = require('./package.json');
    res.append("Surrogate-Key", "meta");
    res.append("Cache-Control", META_CACHE_HEADER)

    fsp.stat(app.locals.md.file).then((stats) => {
        return {
            'last_modified': stats.mtime,
            'last_created': stats.ctime,
            'size': app.locals.md.count,
        }
    }).then(r => {
        res.json({
            'version': meta.version,
            'start_time': start_time,
            'metadata': r,
        });
    });
});

app.get('/entities/?', cors(), function(req, res) {
    let q = req.query.query || req.query.q;
    res.contentType('json');
    res.append("Cache-Control", CONTENT_CACHE_HEADER)
    let format = new ArrayFormatter();
    stream(app.locals.md.search(q, res)).pipe(format).pipe(res);
});

app.get('/entities/:path', cors(), function(req, res) {
    let id = req.params.path.split('.');
    let entity = app.locals.md.lookup(id[0]);
    if (entity) {
        res.append("Surrogate-Key", entity.entity_id);
        res.append("Cache-Control", CONTENT_CACHE_HEADER)
        return res.json(entity);
    } else {
        res.append("Cache-Control", META_CACHE_HEADER);
        return res.status(404).send("Not found");
    }
});

app.head('/status', (req, res) => {
    if (app.locals.md.count > 0) {
        res.append("Surrogate-Key", "meta");
        res.append("Cache-Control", META_CACHE_HEADER)
        return res.status(200).send("OK");
    } else {
        return res.status(500).send("Not enough data");
    }
});

app.get('/status', (req, res) => {
    if (app.locals.md.count > 0) {
        res.append("Surrogate-Key", "meta");
        res.append("Cache-Control", META_CACHE_HEADER);
        return res.status(200).send("OK");
    } else {
        return res.status(500).send("Not enough data");
    }
});

app.get('/.well-known/webfinger', function(req, res) {
    let links = Object.values(app.locals.md.db).map(function(e) {
        return { "rel": "disco-json", "href": `${BASE_URL}/entities/${e.id}` }
    });
    links.unshift({ "rel": "disco-json", "href": `${BASE_URL}/entities/` });
    let wf = {
        "expires": new Date().getTime() + 3600,
        "subject": BASE_URL,
        "links": links
    };
    res.append("Cache-Control", META_CACHE_HEADER);
    res.append("Surrogate-Key", "meta");
    return res.json(wf);
});

module.exports = app;