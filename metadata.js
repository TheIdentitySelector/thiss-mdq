import {lunrIndexer, fuseIndexer, redisIndexer} from "./search-index.js";
import {esc_query, touchp} from "./utils.js";
import fs from 'fs';
import chain from 'stream-chain';
import parser from 'stream-json';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import hex_sha1 from './sha1.js';
import util from 'util';
import sw from 'stopword';
import removeAccents from 'remove-accents';

function _sha1_id(s) {
    return "{sha1}" + hex_sha1(s);
}

let locales = ["sv-SE", "en-US"];
const institution_words = ['university','school','institute','college','institute'];
let all_stopwords = [...sw.eng, ...sw.swe, ...sw.fin, ...sw.nob, ...sw.fra, ...sw.deu, ...institution_words];

const INDEXER = process.env.INDEXER || 'fuse';

class Metadata {

    constructor(mdFile, tiFile, cb) {
        let self = this;
        try {
            this.mdFile = mdFile;
            this.tiFile = tiFile;
            this.cb = cb;
            this.mdDb = {};
            this.idpDb_hinted = {};
            this.idpDb_unhinted = {};
            this.tiDb = {};
            this.mdCount = 0;
            this.mdRepeat = 0;
            this.tiCount = 0;

            if (INDEXER === "redis") {
                this.idx = new redisIndexer();
            } else if (INDEXER == "lunr") {
                this.idx = new lunrIndexer();
            } else if (INDEXER == "fuse") {
                this.idx = new fuseIndexer();
            } else {
                throw `Unknown indexer "${INDEXER}"`;
            }

            self._t = chain([fs.createReadStream(tiFile), parser(), new StreamArray(), data => {
                const e = data.value;
                e.entity_id = e.entityID;
                for (const eID in e.extra_md) {
                    const idp = e.extra_md[eID];
                    idp.id = _sha1_id(eID);
                    e.extra_md[idp.id] = idp;
                }
                if (e.entity_id in self.tiDb) {
                    if ('extra_md' in self.tiDb[e.entity_id]) {
                        if ('extra_md' in e) {
                            Object.assign(self.tiDb[e.entity_id].extra_md, e.extra_md);
                        }
                    } else if ('extra_md' in e) {
                        self.tiDb[e.entity_id].extra_md = e.extra_md;
                    }
                    if ('profiles' in self.tiDb[e.entity_id]) {
                        if ('profiles' in e) {
                            Object.assign(self.tiDb[e.entity_id].profiles, e.profiles);
                        }
                    } else if ('profiles' in e) {
                        self.tiDb[e.entity_id].profiles = e.profiles;
                    }
                } else {
                    self.tiDb[e.entity_id] = e;
                    ++self.tiCount;
                }
            }]);
            self._t.on('data', () => {
            });
            self._t.on('end', () => {
                console.log(`loaded ${self.tiCount} trust information objects`);
            });

            self._p = chain([fs.createReadStream(mdFile), parser(), new StreamArray(), data => {
                let e = data.value;
                e.entity_id = e.entityID;
                e.id = _sha1_id(e.entityID);
                self._fix_entity_regauth(e);
                if (!(e.id in self.mdDb)) {
                    if (e.type === 'idp') {
                        self.idpDb_unhinted[e.id] = e;
                        const hinted = {...e};
                        hinted.hint = true;
                        self.idpDb_hinted[e.id] = hinted;
                    }
                    self.mdDb[e.id] = e;
                    ++self.mdCount;
                } else if (e.type === 'idp') {
                    const old = self.mdDb[e.id];
                    self._update_idp(old, e);
                    ++self.mdRepeat;
                } else if (e.type === 'sp') {
                    const old = self.mdDb[e.id];
                    self._update_sp(old, e);
                    ++self.mdRepeat;
                }
            }]);
            self._p.on('data', () => {
            });
            self._p.on('end', () => {
                for (let id in self.mdDb) {
                    const e = self.mdDb[id];
                    if (e.type === 'idp') {
                        const doc = self._get_indexable_doc(e);
                        this.idx.add(doc);
                    }
                }
                this.idx.build();
                console.log(`loaded ${self.mdCount} objects with ${self.mdRepeat} repetitions`);
                if (self.cb) {
                    self.cb(undefined, self)
                }
            });
        } catch (e) {
            console.log(`Error loading metadata: ${e}`);
            self.cb(e, self)
        }
    }

    _get_indexable_doc(e) {
        let doc = {
            "id": e.id,
            "entityID": e.entityID,
            "title": [
                e.title.toLocaleLowerCase(locales), 
                removeAccents(e.title.toLocaleLowerCase(locales))
            ],
        };
        doc.keywords = [];
        if (e.keywords) {
            doc.keywords = e.keywords.toLocaleLowerCase(locales).split(",").map(e=>e.trim())
        }
        if (e.title_langs) {
            doc.title.push(...Object.entries(e.title_langs).map((kv,i) => {
                return kv[1].toLocaleLowerCase(locales).trim();
            }))
        }
        doc.tags = '';
        doc.scopes = [];
        if (e.scope) {
            doc.tags = e.scope.split(",").map(function (scope) {
                let parts = scope.split('.');
                return parts.slice(0, -1);
            }).join(',');
            doc.scopes = e.scope.split(",");
        }
        doc.title = [...new Set(doc.title)].sort()
        doc.scopes = [...new Set(doc.scopes)].sort()
        doc.registrationAuthority = '.';
        if (doc.registrationAuthority && (Array.isArray(e.registrationAuthority) && e.registrationAuthority.length > 0)) {
            doc.registrationAuthority = e.registrationAuthority.join(' ');
        }
        doc.entity_category = '.';
        if (doc.entity_category && (Array.isArray(e.entity_category) && e.entity_category.length > 0)) {
            doc.entity_category = e.entity_category.join(' ');
        }
        doc.entity_category_support = '.';
        if (doc.entity_category_support && (Array.isArray(e.entity_category_support) && e.entity_category_support.length > 0)) {
            doc.entity_category_support = e.entity_category_support.join(' ');
        }
        doc.assurance_certification = '.';
        if (doc.assurance_certification && (Array.isArray(e.assurance_certification) && e.assurance_certification.length > 0)) {
            doc.assurance_certification = e.assurance_certification.join(' ');
        }
        doc.md_source = '.';
        if (doc.md_source && (Array.isArray(e.md_source) && e.md_source.length > 0)) {
            doc.md_source = e.md_source.join(' ');
        }
        return doc;
    }

    _fix_entity_regauth(e) {
        const regauth = e.registrationAuthority;
        if (regauth && !Array.isArray(regauth)) {
            e.registrationAuthority = [regauth];
        }
    }

    _update_idp(old, e) {
        const attrs = [
            "registrationAuthority",
            "entity_category",
            "entity_category_support",
            "assurance_certification",
        ];
        attrs.forEach(attr => {
            this._update_multivalued_attr(old, e, attr);
        });
    }

    _update_sp(old, e) {
        const attrs = [
            "discovery_responses",
        ];
        attrs.forEach(attr => {
            this._update_multivalued_attr(old, e, attr);
        });
    }

    _update_multivalued_attr(old, e, attr_name) {
        if (old[attr_name] === undefined) {
            old[attr_name] = [];
        }
        const attr_array = old[attr_name];
        const new_attr_array = e[attr_name];
        if (Array.isArray(new_attr_array)) {
            new_attr_array.forEach((val) => {
                if (val && !attr_array.includes(val)) {
                    attr_array.push(val);
                }
            });
        }
    }

    lookup(id) {
        let entity = this.mdDb[id];
        if (entity && entity.type === "sp") {
            if (entity.entityID in this.tiDb) {
                entity = {...entity};
                entity.tinfo = this.tiDb[entity.entityID];
            }
        }
        return entity;
    }

    lookup_with_profile(id, entityID, trustProfileName) {
        try {
            // If the profile is unknown, ignore it
            if (!this.tiDb[entityID] || !this.tiDb[entityID]['profiles'][trustProfileName]) {
                return this.lookup(id);
            }
            // here we check that the requested entity fits with the specified trust profile,
            // and add a hint if necessary
            let entity = {...this.mdDb[id]};

            if (entity && entity.type === "sp") {
                if (entity.entityID in this.tiDb) {
                    entity = {...entity};
                    entity.tinfo = this.tiDb[entity.entityID];
                }
                return entity;
            }

            const extraMetadata = this.tiDb[entityID]['extra_md'];
            const trustProfile = this.tiDb[entityID]['profiles'][trustProfileName];
            const strictProfile = trustProfile.strict;

            let fromExtraMd = false;
            // first we check whether the entity comes from external metadata
            if (extraMetadata && id in extraMetadata) {
                entity = {...extraMetadata[id]};
                fromExtraMd = true;
            }
            // if the entity is not in the internal or external metadata, return not found.
            if (!entity || Object.keys(entity).length === 0) {
                return undefined;
            }
            let seen = null;

            // check whether the entity is selected by some specific entity clause
            if (trustProfile.entity) {
                trustProfile.entity.forEach((e) => {
                    if (e.include && e.entity_id === entity.entity_id) {
                        seen = true;
                    } else if (e.include && e.entity_id !== entity.entity_id) {
                        seen = false;
                    } else if (!e.include) {
                        if (e.entity_id === entity.entity_id) {
                            seen = false;
                        } else {
                            seen = true;
                        }
                    }
                });
            }
            // if the entity comes from external metadata,
            // return it only if it was selectd by the entity clauses in the profile,
            // otherwise return not found.
            if (fromExtraMd) {
                if (seen !== false) {
                    entity.hint = true;
                    return entity;
                } else {
                    return undefined;
                }
            }
            // check whether the entity is selected by some entities clause in the profile
            let passed = 0;
            let to_pass = 0;
            if (seen !== false && trustProfile.entities && Array.isArray(trustProfile.entities)) {
                to_pass = trustProfile.entities.length;
                trustProfile.entities.forEach((e) => {
                    if (Array.isArray(entity[e.match])) {
                        if (e.include && entity[e.match].includes(e.select)) {
                            passed += 1;
                        } else if ((!e.include) && !entity[e.match].includes(e.select)) {
                            passed += 1;
                        }
                    } else {
                        if (e.include && entity[e.match] === e.select) {
                            passed += 1;
                        } else if ((!e.include) && entity[e.match] !== e.select) {
                            passed += 1;
                        }
                    }
                });
            }
            const selected = (seen !== false && passed === to_pass);
            // if the profile is strict, return the entity if it was selected by the profile,
            // and not found otherwise
            if (strictProfile) {
                if (selected) {
                    return entity;
                } else {
                    return undefined;
                }
            // if the profile is not strict, set the hint if the entity was not selected by the profile,
            // and return the entity.
            } else {
                if (selected) {
                    entity.hint = true;
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
        const tQuery_op = self.idx.newQuery();
        const qQuery = self.idx.newQuery();
        let emptyTQuery = true;
        let emptyQQuery = true;
        const extraIdPs = {};
        let trustProfile;
        let strictProfile;
        let extraMetadata;

        const unhinted = {};

        // First we build the query terms for the trust profile.
        // If there are any, we set emptyTQuery to false.
        if (entityID && trustProfileName) {
            if (entityID in self.tiDb && trustProfileName in self.tiDb[entityID]['profiles']) {

                trustProfile = self.tiDb[entityID]['profiles'][trustProfileName];
                extraMetadata = self.tiDb[entityID]['extra_md'];
                strictProfile = trustProfile.strict;

                if (trustProfile.entity) {
                    trustProfile.entity.forEach((e) => {
                        // if the entity is in the external metadata,
                        // keep it in extraIdPs 
                        if (extraMetadata && e.entity_id in extraMetadata) {
                            const extraIdP = {...extraMetadata[e.entity_id]};
                            extraIdP.id = _sha1_id(e.entity_id);
                            extraIdPs[extraIdP.id] = extraIdP;
                        } else {
                            emptyTQuery = false;
                            // only add a query term for single entities that are excluded.
                            // If they are included, we need to check them one by one, otherwise
                            // they will negate each other
                            if (!e.include) {
                                self.idx.addTermToQuery(tQuery, e.entity_id, ['entityID'], e.include);
                                if (strictProfile === false) {
                                    const id = _sha1_id(e.entity_id);
                                    unhinted[id] = self.idpDb_unhinted[id];
                                }
                            }
                        }
                    });
                }
                if (trustProfile.entities) {
                    trustProfile.entities.forEach((e) => {
                        self.idx.addTermToQuery(tQuery, e.select, [e.match], e.include);
                        self.idx.addTermToQuery(tQuery_op, e.select, [e.match], !e.include);
                        emptyTQuery = false;
                    });
                }
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
            let tokens = q.split(/\s+/);
            tokens = tokens.map(token => esc_query(token));
            let str = [tokens[0]]
            str.push(...sw.removeStopwords(tokens.slice(1), all_stopwords))

            str.forEach((term) => {
                self.idx.addFTTermToQuery(qQuery, term, ['title', 'tags', 'scopes', 'keywords'], true);
            });
            emptyQQuery = false;
        }
        let results = {};

        // there is trust profile filtering, we have term queries for the profile.
        if (!emptyTQuery) {
            res.append("Surrogate-Key", `query`);

            let indexResults = [];
            let queryUsed = false;
            if (trustProfile.entity) {
                trustProfile.entity.forEach(function(e) {
                    // we do a query for each of the single entities and accumulate the results.
                    if (e.include && (!extraMetadata || !(e.entity_id in extraMetadata))) {
                        queryUsed = true;
                        const newQuery = [...tQuery];
                        self.idx.addTermToQuery(newQuery, e.entity_id, ['entityID'], e.include);
                        if (!emptyQQuery) {
                            qQuery.forEach(term => {
                                newQuery.push(term);
                            });
                        }
                        const moreResults = self.idx.search(newQuery);
                        if (moreResults) {
                            indexResults.push(...moreResults);
                        }
                        self.idx.addTermToQuery(tQuery_op, e.entity_id, ['entityID'], !e.include);
                    }
                });
            }
            // if there were no single entity filterings,
            // we do the full text index search here.
            if (!queryUsed) {
                if (!emptyQQuery) {
                    qQuery.forEach(term => {
                        tQuery.push(term);
                    });
                }
                indexResults = self.idx.search(tQuery);
            }
            // if the profile is strict, we just gather the corresponding metadata
            if (strictProfile === undefined || strictProfile) {
                self.idx.getResults(self.idpDb_unhinted, indexResults, results);
            // if the profile is not strict, we use the index search results
            // to mark all those entities not present in these results with a hint
            } else {
                self.idx.getResults(self.idpDb_hinted, indexResults, results);
                Object.assign(results, unhinted);
                const badResults = self.idx.search_op(tQuery_op, qQuery);
                self.idx.getResults(self.idpDb_unhinted, badResults, results);
            }
        }
        // Here we are dealing with just a full text search with no trust profile involved.
        else {
            if (!emptyQQuery) {
                res.append("Surrogate-Key", `query`);
                const indexResults = self.idx.search(qQuery);
                self.idx.getResults(self.idpDb_unhinted, indexResults, results);
            } else {
                res.append("Surrogate-Key", "entities");
                results = Object.values(self.idpDb_unhinted);
            }
        }
        Object.assign(results, extraIdPs);

        return Object.values(results);
    }
}

function load_metadata(metadata_file, trustinfo_file, cb) {
    return new Metadata(metadata_file, trustinfo_file, cb);
}

export default util.promisify(load_metadata);
