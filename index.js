
const express = require('express');
const SelfReloadJSON = require('self-reload-json');
const hex_sha1 = require('./sha1.js');
const elasticlunr = require('elasticlunr');
const fs = require('fs');
const https = require('https');
const http = require('http');

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;
const METADATA = process.env.METADATA || "/etc/metadata.json";
const BASE_URL = process.env.BASE_URL || "";

function _sha1_id(s) {
    return "{sha1}"+hex_sha1(s);
}

let index = null;
let db = null;

function _update(entities) {
    let index_load = elasticlunr(function() {
       this.addField('title');
       this.addField('descr');
       this.addField('tags');
       this.setRef('id');
       this.saveDocument(false);
    });
    let count = 0;
    let db_load = {};
    for (let i = 0; i < entities.length; i++) {
       e = entities[i];
       e.entity_id = e.entityID;
       e.id = _sha1_id(e.entityID);
       if (e.type == 'idp') {
           let doc = {
               "id": e.id,
               "title": e.title.toLowerCase(),
               "descr": e.descr.toLowerCase()
           };
           if (e.scope) {
               doc.tags = e.scope.split(",").map(function(scope) {
                   let parts = scope.split('.');
                   return parts.slice(0,-1);
               }).join(' ');
           }
           index_load.addDoc(doc);
       }
       db_load[e.id] = e;
       count++;
    }
    db = db_load;
    index = index_load;
    let old_count = 0;
    if (db) {
       old_count = Object.values(db).length;
    }
    console.log(`loaded ${count} objects (previous ${old_count})`)
}

const metadata = new SelfReloadJSON(METADATA);
_update(metadata);
metadata.on("updated",_update);

const app = express();

function search(q) {
    if (q) {
       return index.search(q,{}).map(function(m) {
           return lookup(m.ref);
       })
    } else {
       return Object.values(db);
    }
}

function lookup(id) {
    return db[id];
}

app.get('/', (req, res) => {
    const meta = require('./package.json');
    return res.json({'version': meta.version, 'size': Object.values(db).length});
});

app.get('/entities/?', function(req, res) {
   let q = req.query.query || req.query.q;
   return res.json(search(q));
});

app.get('/entities/:path', function(req, res) {
   let id = req.params.path.split('.');
   let entity = lookup(id[0]);
   if (entity) {
      return res.json(entity);
   } else {
      return res.status(404).send("Not found");
   }
});

app.get('/.well-known/webfinger', function(req, res) {
    let links = Object.values(db).map(function (e) {
        return {"rel": "disco-json", "href": `${BASE_URL}/entities/${e.id}`}
    });
    links.unshift({"rel": "disco-json", "href": `${BASE_URL}/entities/`});
    let wf = {
        "expires": new Date().getTime() + 3600,
        "subject": BASE_URL,
        "links": links
    };
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