import {lunrIndexer, redisIndexer} from "./search-index";
import {esc_query, touchp} from "./utils";
const fs = require('fs');
const chokidar = require('chokidar');
const Chain = require('stream-chain');
const parser = require('stream-json');
const StreamArray = require('stream-json/streamers/StreamArray');
const hex_sha1 = require('./sha1.js');
const util = require('util');
const sw = require('stopword');

function _sha1_id(s) {
    return "{sha1}" + hex_sha1(s);
}

let locales = ["sv-SE", "en-US"];
const institution_words = ['university','school','institute','college','institute'];
let all_stopwords = [...sw.en, ...sw.sv, ...sw.fi, ...sw.no, ...sw.fr, ...sw.de, ...institution_words]

const INDEXER = process.env.INDEXER || 'lunr';

class Metadata {

    constructor(file, cb) {
        let self = this;
        try {
            this.file = file;
            this.cb = cb;
            this.db = {};
            this.count = 0;

            if (INDEXER === "redis") {
                this.idx = new redisIndexer();
            } else if (INDEXER == "lunr") {
                this.idx = new lunrIndexer();
            } else {
                throw `Unknown indexer "${INDEXER}"`;
            }

            self._p = new Chain([fs.createReadStream(file), parser(), new StreamArray(), data => {
                let e = data.value;
                e.entity_id = e.entityID;
                e.id = _sha1_id(e.entityID);
                if (e.type == 'idp' && !(e.id in self.db)) {
                    let doc = {
                        "id": e.id,
                        "title": [e.title.toLocaleLowerCase(locales)],
                    };
                    if (e.keywords) {
                        doc.keywords = e.keywords.toLocaleLowerCase(locales).split(",").map(e=>e.trim())
                    }
                    if (e.title_langs) {
                        doc.title.push(...Object.entries(e.title_langs).map((kv,i) => {
                            return kv[1].toLocaleLowerCase(locales).trim();
                        }))
                    }
                    if (e.scope) {
                        doc.tags = e.scope.split(",").map(function (scope) {
                            let parts = scope.split('.');
                            return parts.slice(0, -1);
                        }).join(',');
                        doc.scopes = e.scope.split(",");
                    }
                    doc.title = [...new Set(doc.title)].sort()
                    doc.scopes = [...new Set(doc.scopes)].sort()
                    //console.log(doc)
                    this.idx.add(doc);
                }
                self.db[e.id] = e;
                ++self.count;
            }]);
            self._p.on('data', () => {
            });
            self._p.on('end', () => {
                this.idx.build();
                console.log(`loaded ${self.count} objects`);
                if (self.cb) {
                    self.cb(undefined, self)
                }
            });
        } catch (e) {
            self.cb(e, self)
        }
    }

    lookup(id) {
        return this.db[id];
    }

    search(q, res) {
        let self = this;

        if (q) {
            res.append("Surrogate-Key", `query`);
            q = q.toLocaleLowerCase(locales);
            let ati = q.indexOf('@');
            if (ati > -1) {
                q = q.substring(ati + 1);
            }
            q = esc_query(q)
            let tokens = q.split(/\s+/);
            let str = [tokens[0]]
            str.push(...sw.removeStopwords(tokens.slice(1), all_stopwords))
            let matches = [
                str.map(x => "+" + x).join(' '),
                str.map(x => "+" + x + "*").join(' '),
            ];
            let results = {};
            for (let i = 0; i < matches.length; i++) {
                let match = matches[i];
                self.idx.search(match).forEach(function(m) {
                    //console.log(`${match} -> ${m.ref}`);
                    if (!results[m.ref]) {
                        results[m.ref] = self.lookup(m.ref);
                    }
                });
            }
            return Object.values(results);
        } else {
            res.append("Surrogate-Key", "entities");
            return Object.values(self.db);
        }
    }
}

function load_metadata(metadata_file, cb) {
    return new Metadata(metadata_file, cb);
}

module.exports = util.promisify(load_metadata);