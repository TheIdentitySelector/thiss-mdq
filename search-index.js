import lunr from 'lunr';
import Fuse from 'fuse.js';
import redis from 'redis';
import { promisify } from 'util';

const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_HOST = process.env.REDIS_HOST || "0.0.0.0";
// TODO: Add more configuration options for redis


// lunrjs indexer
export class lunrIndexer {
    constructor() {
        this.builder = new lunr.Builder();
        this.builder.pipeline.remove(lunr.trimmer);
        lunr.Pipeline.registerFunction(lunr.tokenizer);
        this.builder.pipeline.add(lunr.tokenizer);
        this.builder.field('title');
        this.builder.field('tags');
        this.builder.field('scopes');
        this.builder.field('keywords');
        this.builder.field('entityID');
        this.builder.field('registrationAuthority');
        this.builder.field('entity_category');
        this.builder.field('md_source');
        this.builder.field('entity_category_support');
        this.builder.field('assurance_certification');

        lunr.tokenizer.separator = /\s+/;
    };

    add(doc) {
        this.builder.add(doc);
    };

    build() {
        this.idx = this.builder.build();
    };

    search(q) {
        const queryBuilder = (query) => {
            q.forEach((clause) => {
                query.clause(clause);
            });
        };
        return this.idx.query(queryBuilder);
    }

    newQuery() {
        return [];
    }

    addTermToQuery(query, term, fields, include) {
        let presence = lunr.Query.presence.PROHIBITED;
        if (include) {
            presence = lunr.Query.presence.REQUIRED;
        }
        query.push({
            term: term,
            fields: fields,
            presence: presence,
        });
    }

    addFTTermToQuery(query, term, fields, include) {
        let presence = lunr.Query.presence.PROHIBITED;
        if (include) {
            presence = lunr.Query.presence.REQUIRED;
        }
        query.push({
            term: term,
            fields: fields,
            presence: presence,
            wildcard: lunr.Query.wildcard.LEADING | lunr.Query.wildcard.TRAILING,
        });
    }

    getResults(db, indexResults, results) {
        indexResults.forEach((e) => {
            results[e.ref] = db[e.ref];
        });
    }
};
// Fuse indexer
export class fuseIndexer {
    constructor() {

        const options = {
            includeScore: true,
            useExtendedSearch: true,
            threshold: 0.6,
            ignoreLocation: true,
            ignoreFieldNorm: true,
            keys: ['title', 'tags', 'scopes', 'keywords', 'entityID', 'registrationAuthority',
                   'entity_category', 'md_source', 'entity_category_support', 'assurance_certification'],
        };
        this.fuse = new Fuse([], options);
        this.query_operator = '$and';
        this.op_query_operator = '$or';
    };

    add(doc) {
        for (const key of Object.keys(doc)) {
            if (!doc[key]) {
                delete doc[key];
            }
        }
        this.fuse.add(doc);
    };

    build() {
        this.count = this.fuse.getIndex().size();
    };

    search(q) {
        let query = {};
        if (q.length > 1) {
            query[this.query_operator] = q;
        } else if (q.length === 1) {
            query = q[0];
        }
        const options = {'limit': this.count};
        const results = this.fuse.search(query, options);
        return results;
    }

    search_op(q, q_ft) {
        let query = {};
        let query_op = {};
        let has_query_op = false;
        let query_ft = {};
        let has_query_ft = false;
        if (q.length > 1) {
            const clean_q = [];
            q.forEach(c => { if (Object.keys(c).length > 0) clean_q.push(c); });
            if (clean_q.length > 0) {
                query_op[this.op_query_operator] = clean_q;
                has_query_op = true;
            }
        } else if (q.length === 1) {
            if (Object.keys(q[0]).length > 0) {
                query_op = q[0];
                has_query_op = true;
            }
        }
        if (q_ft.length === 1) {
            if (Object.keys(q_ft[0]).length > 0) {
                query_ft = q_ft[0];
                has_query_ft = true;
            }
        }
        if (has_query_op && has_query_ft) {
            query['$and'] = [query_op, query_ft];
        } else if (has_query_op) {
            query = query_op;
        } else if (has_query_ft) {
            query = query_ft;
        }
        const options = {'limit': this.count};
        const results = this.fuse.search(query, options);
        return results;
    }

    newQuery() {
        return [];
    }

    addTermToQuery(query, term, fields, include) {
        if (include) {
            term = `'${term}`
        } else {
            term = `!${term}`
        }
        const subquery = [];
        fields.forEach(field => {
            const clause = {};
            clause[field] = term;
            subquery.push(clause);
        });
        if (subquery.length > 1) {
            query.push({$or: subquery});
        } else if (subquery.length === 1) {
            query.push(subquery[0]);
        }
    }

    addFTTermToQuery(query, term, fields, include) {
        const subquery = [];
        fields.forEach(field => {
            const clause = {};
            clause[field] = `'${term}`;
            subquery.push(clause);
        });
        query.push({$or: subquery});
    }

    getResults(db, indexResults, results) {
        indexResults.forEach((e) => {
            const ref = e.item.id;
            results[ref] = db[ref];
        });
    }
};


// Redisearch indexer
export class redisIndexer {
    constructor() {
        let self = this;
        this.md_index = "md_index";

        const client = redis.createClient(REDIS_PORT, REDIS_HOST);
        ['ft.create', 'ft.add', 'ft.search', 'ft.drop', 'ft.info']
        .forEach(redis.add_command);

        this.ft_create = promisify(client.ft_create).bind(client);
        this.ft_add = promisify(client.ft_add).bind(client);
        this.ft_search = promisify(client.ft_search).bind(client);
        this.ft_drop = promisify(client.ft_drop).bind(client);
        this.ft_info = promisify(client.ft_info).bind(client);

        this.client_check = (async() => {
            try {
                await this.ft_info(this.md_index);
            } catch (err) {
                if (String(err).includes('ERR unknown command `ft.info`')) {
                    console.error('Enable RediSearch on Redis client.');
                    process.exitCode = 9;
                };
            };
        })();

        this.create = (async() => {
            let existing_index = false;
            while (existing_index == false) {
                try {
                    this.ft_create(
                        this.md_index,
                        'SCHEMA',
                        'title', 'TEXT',
                        'tags', 'TEXT',
                        'scopes', 'TEXT'
                    );
                    existing_index = true;
                } catch (err) {
                    if (String(err).includes('Index already exists')) {
                        try {
                            await this.ft_drop(this.md_index);
                            existing_index = false;
                        } catch (err) {
                            console.error(err);
                        }
                    } else if (String(err).includes('ERR unknown command `ft.create`')) {
                        process.exitCode = 9;
                    } else {
                        console.error(err);
                    };
                };
            };
        })();
    };

    async add(doc) {
        if (typeof(doc.tags) === "undefined") {
            doc.tags = "";
        } else {
            doc.tags = doc.tags.toString();
        };
        if (typeof(doc.scopes) === "undefined") {
            doc.scopes = "";
        } else {
            doc.scopes = doc.scopes.toString();
        };
        try {
            await this.ft_add(
                this.md_index,
                doc.id,
                1,
                'REPLACE',
                'FIELDS',
                'title', doc.title,
                'tags', doc.tags,
                'scopes', doc.scopes
            );
        } catch (err) {
            if (String(err).includes('ERR unknown command `ft.add`')) {
                process.exitCode = 9;
            } else {
                throw new Error(err);
            };
        };
    };

    build() {
        () => {};
    };

    /*
    search(){
    }
    */
};
