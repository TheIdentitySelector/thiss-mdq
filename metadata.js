import {lunrIndexer, redisIndexer} from "./search-index";
import {esc_query, touchp} from "./utils";
const fs = require('fs');
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
let all_stopwords = [...sw.eng, ...sw.swe, ...sw.fin, ...sw.nob, ...sw.fra, ...sw.deu, ...institution_words];

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
                for (const eID in e.extra_md) {
                    const idp = e.extra_md[eID];
                    idp.id = _sha1_id(eID);
                    e.extra_md[idp.id] = idp;
                }
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
                    if (e.registrationAuthority) {
                        doc.registrationAuthority = e.registrationAuthority;
                    }
                    if (e.entity_category) {
                        doc.entity_category = e.entity_category;
                    }
                    if (e.entity_category_support) {
                        doc.entity_category_support = e.entity_category_support;
                    }
                    if (e.assurance_certification) {
                        doc.assurance_certification = e.assurance_certification;
                    }
                    if (e.md_source) {
                        doc.md_source = e.md_source;
                    }
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

    lookup_with_profile(id, entityID, trustProfileName) {
        try {
            // here we check that the requested entity fits with the specified trust profile,
            // and add a hint if necessary
            let entity = {...this.mdDb[id]};

            const trustProfile = this.tiDb[entityID]['profiles'][trustProfileName];
            const extraMetadata = this.tiDb[entityID]['extra_md'];
            const strictProfile = trustProfile.strict;

            let fromExtraMd = false;
            // first we check whether the entity comes from external metadata
            if (id in extraMetadata) {
                entity = {...extraMetadata[id]};
                fromExtraMd = true;
            }
            // if the entity is not in the internal or external metadata, return not found.
            if (!entity) {
                return entity;
            }
            let seen = false;

            // check whether the entity is selected by some specific entity clause
            trustProfile.entity.forEach((e) => {
                if (e.include && e.entity_id === entity.entity_id) {
                    seen = true;
                } else if (!e.include && e.entity_id !== entity.entity_id) {
                    seen = true;
                }
            });
            // if the entity comes from external metadata,
            // return it only if it was selectd by the profile,
            // otherwise return not found.
            if (fromExtraMd) {
                if (seen) {
                    return entity;
                } else {
                    return undefined;
                }
            }
            // check whether the entity is selected by some entities clause in the profile
            trustProfile.entities.forEach((e) => {
                if (e.include && entity[e.match] === e.select) {
                    seen = true;
                } else if ((!e.include) && entity[e.match] !== e.select) {
                    seen = true;
                } else {
                    seen = false;
                }
            });
            // if the profile is strict, return the entity if it was selected by the profile,
            // and not found otherwise
            if (strictProfile) {
                if (seen) {
                    return entity;
                } else {
                    return undefined;
                }
            // if the profile is not strict, set the hint if the entity was not selected by the profile,
            // and return the entity.
            } else {
                if (!seen) {
                    entity.hint = trustProfile.display_name;
                }
                return entity;
            }
        } catch (e) {
            // on error return not found
            console.log(`Error looking up entity with id ${id} and trust profile ${entityID} for sp ${trustProfileName}: ${e}`);
            return undefined;
        }
    }

    search(q, entityID, trustProfileName,  res) {
        let self = this;

        const tQuery = self.idx.newQuery();
        const qQuery = self.idx.newQuery();
        let emptyTQuery = true;
        let emptyQQuery = true;
        const extraIdPs = [];
        let trustProfile;
        let strictProfile;
        let extraMetadata;

        // First we build the query terms for the trust profile.
        // If there are any, we set emptyTQuery to false.
        if (entityID && trustProfileName) {
            if (entityID in self.tiDb && trustProfileName in self.tiDb[entityID]['profiles']) {

                trustProfile = self.tiDb[entityID]['profiles'][trustProfileName];
                extraMetadata = self.tiDb[entityID]['extra_md'];
                strictProfile = trustProfile.strict;
                console.log(`Found profile ${trustProfileName}, strict: ${strictProfile}`);

                trustProfile.entity.forEach((e) => {
                    // if the entity is in the external metadata,
                    // keep it in extraIdPs 
                    if (extraMetadata && e.entity_id in extraMetadata) {
                        const extraIdP = {...extraMetadata[e.entity_id]};
                        extraIdP.id = _sha1_id(e.entity_id);
                        extraIdPs.push(extraIdP);
                    } else {
                        emptyTQuery = false;
                        // only add a query term for single entities that are excluded.
                        // If they are included, we need to check them one by one, otherwise
                        // they will negate each other
                        if (!e.include) {
                            self.idx.addTermToQuery(tQuery, e.entity_id, ['entityID'], e.include);
                        }
                    }
                });
                trustProfile.entities.forEach((e) => {
                    self.idx.addTermToQuery(tQuery, e.select, [e.match], e.include);
                    emptyTQuery = false;
                });
            }
        }
        // build the query terms for the full text search.
        // if present set emptyQQuery to false.
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
                self.idx.addFTTermToQuery(qQuery, term, ['title', 'tags', 'scopes', 'keywords'], true);
            });
            emptyQQuery = false;
        }
        let results = [];

        // there is trust profile filtering, we have term queries for the profile.
        if (!emptyTQuery) {
            res.append("Surrogate-Key", `query`);

            // We have full text query and a strict profile,
            // so just mix the queries.
            if (!emptyQQuery && (strictProfile === undefined || strictProfile)) {
                qQuery.forEach(term => {
                    tQuery.push(term);
                });
            }
            let indexResults = [];
            let queryUsed = false;
            trustProfile.entity.forEach(function(e) {
                // we do a query for each of the single entities and accumulate the results.
                if (e.include && (!extraMetadata || !(e.entity_id in extraMetadata))) {
                    queryUsed = true;
                    const newQuery = [...tQuery];
                    self.idx.addTermToQuery(newQuery, e.entity_id, ['entityID'], e.include);
                    const moreResults = self.idx.search(newQuery);
                    if (moreResults) {
                        indexResults.push(...moreResults);
                    }
                }
            });
            // if there were no single entity filterings,
            // we do the single index seaarch here.
            if (!queryUsed) {
                indexResults = self.idx.search(tQuery);
            }
            // if the profile is strict, we just gather the corresponding metadata
            if (strictProfile === undefined || strictProfile) {
                indexResults.forEach(function(m) {
                    results.push(self.lookup(m.ref));
                });
            // if the profile is not strict, we use the index search results
            // to mark all those entities not present in these results with a hint
            } else {
                const indexResultsIDs = indexResults.map(m => self.lookup(m.ref).entityID);
                let qResults;
                if (!emptyQQuery) {
                    qResults = self.idx.search(qQuery);
                    qResults = qResults.map(m => self.lookup(m.ref));
                } else {
                    qResults = Object.values(self.mdDb);
                }
                qResults.forEach(idp => {
                    if (idp.type === 'idp') {
                        let newIdp;
                        if (idp.hint === undefined && ! indexResultsIDs.includes(idp.entityID)) {
                            newIdp = {...idp};
                            newIdp.hint = trustProfile.display_name;
                        } else {
                            newIdp = idp;
                        }
                        results.push(newIdp);
                    }
                });
            }
        }
        // Here we are dealing with just a full text search with no trust profile involved.
        else {
            if (!emptyQQuery) {
                res.append("Surrogate-Key", `query`);
                const qResults = self.idx.search(qQuery);
                qResults.forEach(function(m) {
                    results.push(self.lookup(m.ref));
                });
            } else {
                res.append("Surrogate-Key", "entities");
                results = Object.values(self.mdDb);
            }
        }
        results.push(...extraIdPs);

        return results;
    }
}

function load_metadata(metadata_file, trustinfo_file, cb) {
    return new Metadata(metadata_file, trustinfo_file, cb);
}

module.exports = util.promisify(load_metadata);
