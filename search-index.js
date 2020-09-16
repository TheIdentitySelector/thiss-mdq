const lunr = require('lunr');
const redis = require('redis');
const { promisify } = require('util');

const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_HOST = process.env.REDIS_HOST || "0.0.0.0";
// TODO: Add more configuration options for redis


// lunrjs indexer
export class lunrIndexer {
    constructor() {
        this.builder = new lunr.Builder();
        this.builder.pipeline.remove(lunr.trimmer);
        this.builder.field('title');
        this.builder.field('tags');
        this.builder.field('scopes');
    };

    add(doc) {
        this.builder.add(doc);
    };

    build() {
        this.idx = this.builder.build();
    };

    search(q) {
        return this.idx.search(q);
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