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

    constructor(mdFile, tiFile, cb) {
        let self = this;
        try {
            this.mdFile = mdFile;
            this.tiFile = tiFile;
            this.cb = cb;
            this.mdDb = {};
            this.tiDb = {};
            this.mdCount = 0;
            this.tiCount = 0;

            if (INDEXER === "redis") {
                this.idx = new redisIndexer();
            } else if (INDEXER == "lunr") {
                this.idx = new lunrIndexer();
            } else {
                throw `Unknown indexer "${INDEXER}"`;
            }

            self._t = new Chain([fs.createReadStream(tiFile), parser(), new StreamArray(), data => {
                const e = data.value;
                e.entity_id = e.entityID;
                self.tiDb[e.entity_id] = e;
                ++self.tiCount;
            }]);
            self._t.on('data', () => {
            });
            self._t.on('end', () => {
                console.log(`loaded ${self.tiCount} trust information objects`);
            });

            self._p = new Chain([fs.createReadStream(mdFile), parser(), new StreamArray(), data => {
                let e = data.value;
                e.entity_id = e.entityID;
                e.id = _sha1_id(e.entityID);
                if (e.type == 'idp' && !(e.id in self.mdDb)) {
                    let doc = {
                        "id": e.id,
                        "entityID": e.entityID,
                        "title": [e.title.toLocaleLowerCase(locales)],
                        "registrationAuthority": e.registrationAuthority,
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
                self.mdDb[e.id] = e;
                ++self.mdCount;
            }]);
            self._p.on('data', () => {
            });
            self._p.on('end', () => {
                this.idx.build();
                console.log(`loaded ${self.mdCount} objects`);
                if (self.cb) {
                    self.cb(undefined, self)
                }
            });
        } catch (e) {
            console.log(`Error loading metadata: ${e}`);
            self.cb(e, self)
        }
    }

    lookup(id) {
        return this.mdDb[id];
    }

    search(q, entityID, trustProfileName,  res) {
        let self = this;

        const query = self.idx.newQuery();
        let emptyQuery = true;
        const extraIdPs = [];

        if (entityID && trustProfileName) {
            if (entityID in self.tiDb && trustProfileName in self.tiDb[entityID]['profiles']) {
                // console.log(`Found profile ${trustProfileName}`);

                const trustProfile = self.tiDb[entityID]['profiles'][trustProfileName];
                const extraMetadata = self.tiDb[entityID]['extra_md'];

                trustProfile.entity.forEach((e) => {
                    if (extraMetadata && e.entity_id in extraMetadata) {
                        extraIdPs.push(extraMetadata[e.entity_id]);
                    } else {
                        // console.log(`Adding entity term to query ${e.entity_id}, ${e.include}`);
                        self.idx.addTermToQuery(query, e.entity_id, ['entityID'], e.include);
                        emptyQuery = false;
                    }
                });
                trustProfile.entities.forEach((e) => {
                    // console.log(`Adding entities term to query ${e.select}, ${e.match}, ${e.include}`);
                    self.idx.addTermToQuery(query, e.select, [e.match], e.include);
                    emptyQuery = false;
                });
            }
        }
        if (q) {
            q = q.toLocaleLowerCase(locales);
            let ati = q.indexOf('@');
            if (ati > -1) {
                q = q.substring(ati + 1);
            }
            q = esc_query(q)
            let tokens = q.split(/\s+/);
            let str = [tokens[0]]
            str.push(...sw.removeStopwords(tokens.slice(1), all_stopwords))

            str.forEach((term) => {
                self.idx.addTermToQuery(query, term, ['title', 'tags', 'scope', 'keywords'], true);
            });
            emptyQuery = false;
        }
        let results = [];

        if (!emptyQuery) {
            res.append("Surrogate-Key", `query`);
            // console.log(`Query to execute: ${JSON.stringify(query)}`);
            self.idx.search(query).forEach(function(m) {
                // console.log(`found ${m.ref}`);
                results.push(self.lookup(m.ref));
            });
        }
        else {
            res.append("Surrogate-Key", "entities");
            results = Object.values(self.mdDb);
        }
        results.push(...extraIdPs);

        return results;
    }
}

function load_metadata(metadata_file, trustinfo_file, cb) {
    return new Metadata(metadata_file, trustinfo_file, cb);
}

module.exports = util.promisify(load_metadata);
