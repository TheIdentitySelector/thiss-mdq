import Fuse from 'fuse.js';
import { promisify } from 'util';


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
