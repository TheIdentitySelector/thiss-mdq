const lunr = require('lunr');
const redis = require('redis');

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
        this.builder.build();
    };
};


// Redisearch indexer

export class redisIndexer {
    constructor() {
        let self = this;
        this.md_index = "md_index";

        const client = redis.createClient(REDIS_PORT, REDIS_HOST);
        ['ft.create', 'ft.add', 'ft.search', 'ft.info', 'ft.drop']
        .forEach(redis.add_command);

        this.ft_create = client.ft_create.bind(client);
        this.ft_add = client.ft_add.bind(client);
        this.ft_search = client.ft_search.bind(client);
        this.ft_drop = client.ft_drop.bind(client);
        this.ft_info = client.ft_info.bind(client);

        if (!this.ft_create) {
            throw new Error('Enable Redisearch on Redis client.');
        };
    };

    create() {
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
                    this.ft_drop(md_index);
                    existing_index = false;
                } else {
                    throw err;
                };
            };
        };
    };

    add(doc) {
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
            this.ft_add(
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
            throw err;
        };
    };

    /*
    search(){
    }
    */
};