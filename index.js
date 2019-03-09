
const express = require('express')
const SelfReloadJSON = require('self-reload-json')
const hex_sha1 = require('./sha1.js');
const elasticlunr = require('elasticlunr')

function _sha1_id(s) {
    return "{sha1}"+hex_sha1(s);
}

var index = null;
var db = null;

const metadata = new SelfReloadJSON("/etc/metadata.json")
metadata.on("update", function(json) {
    var index_load = elasticlunr(function() {
       this.addField('title');
       this.addField('descr');
       this.setRef('id');
    });
    var db_load = {}; 
    metadata.forEach(function(e) {
       e.entity_id = e.entityID;
       e.id = _sha1_id(e.entityID);
       index_load.add(e);
       db_load[e.id] = e;
    });
    db = db_load;
    index = index_load;
});

const app = express()
const port = 3000

function search(q) {
    if (q) {
       return index.search(q);
    } else {
       return db.values()
    }
}

function lookup(id) {
    return db[id];
}

app.get('/entities/?', function(req, res) {
   let q = req.query.query;
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
