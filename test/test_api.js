
import { fileURLToPath } from 'url'
import path from 'path';

import "regenerator-runtime/runtime.js";
import assert from 'node:assert/strict';
import * as  chaiModule from 'chai';
import chaiHttp from 'chai-http';

//import {chai as chaiModule} from 'chai';
const chai = chaiModule.use(chaiHttp);

import app from '../server.js';
import pkg from '../package.json' with { type: "json" };
import load_metadata from '../metadata.js';
import hex_sha1 from '../sha1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function _sha1_id(s) {
    return "{sha1}" + hex_sha1(s);
}

//chai.use(chaiHttp);
describe('', () => {
    beforeEach((done) => {
        load_metadata(path.join(__dirname,'/disco.json'),path.join(__dirname,'/disco_sp.json'),(err, md) => {
            if (err !== undefined) {
                console.log(`Err: ${err}`);
            }
            app.locals.md = md;
            done();
        })
    });
    describe('GET /', () => {
        it('should return version info', (done) => {
            chai.request(app)
                .get('/')
                .end((err,res) => {
                  if (err) done(err);
                  else {
                    try {
                      chai.expect(res.status).to.equal(200);
                      let status = res.body; //JSON.parse(res.body);
                      chai.expect(status).to.haveOwnProperty('version');
                      chai.expect(status.version).to.equal(pkg.version);
                      done();
                    } catch(err) {
                      done(err);
                    }
                  }
            });
        });
    });
    describe('GET /entities', () => {
        it('should return all entities', (done) => {
            chai.request(app)
                .get('/entities')
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(16);
                    chai.expect(data[0]['title']).to.equal("eduID Sweden");
                done();
            });
        });
        it('should return 12 IdPs', (done) => {
            const q = "edu";
            chai.request(app)
                .get(`/entities?q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                done();
            });
        });
        it('should return the SP for 3D Labs SP with a discovery_responses key', (done) => {
            const sp_id = _sha1_id("https://3d.labs.stonybrook.edu/shibboleth");
            chai.request(app)
                .get(`/entities/${sp_id}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.discovery_responses.length).to.equal(1);
                    chai.expect(data.discovery_responses[0]).to.equal("https://3d.labs.stonybrook.edu/Shibboleth.sso/Login");

                done();
            });
        });
        it('should return uleam IdP and 2 IdPs more with registration authority swamid', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "customer";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(3);
                    let seen = false;
                    data.forEach(idp => {
                        if (idp.title === "Universidad Laica Eloy Alfaro de Manabí - uleam") {
                            seen = true;
                        }
                    });
                    chai.expect(seen).to.equal(true);
                done();
            });
        });
        it('should return usf.edu.br & u-picardie.fr IdPs', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "provider";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(2);
                    const titles = ["Université de Picardie Jules Verne", "USF - Universidade Sao Francisco"];
                    chai.expect(titles).to.include(data[0]['title']);
                    chai.expect(titles).to.include(data[1]['title']);
                done();
            });
        });
        it('should return u-picardie.fr IdP', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "provider";
            const q = "picardie";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    chai.expect(data[0]['title']).to.equal("Université de Picardie Jules Verne");
                done();
            });
        });
        it('should return all IdPs, trusting only eduid', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "other";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(16);
                    data.forEach(idp => {
                        if (idp.title === "eduID Sweden") {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return 12 IdPs, trusting only eduid', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "other";
            const q = "edu";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                    data.forEach(idp => {
                        if (idp.title === "eduID Sweden") {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return 2 IdPs', (done) => {
            const entityID = encodeURIComponent("https://test-edusign.ed-integrations.com/shibboleth");
            const profile = "customer";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(2);
                    data.forEach(idp => {
                        chai.expect(idp.registrationAuthority).to.equal("http://www.swamid.se/");
                        chai.expect(idp).to.not.haveOwnProperty('hint');
                    });
                done();
            });
        });
        it('should return eduID IdP', (done) => {
            const entityID = encodeURIComponent("https://test-edusign.ed-integrations.com/shibboleth");
            const profile = "customer";
            const q = "edu";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    chai.expect(data[0].title).to.equal("eduID Sweden");
                    chai.expect(data[0].registrationAuthority).to.equal("http://www.swamid.se/");
                    chai.expect(data[0]).to.not.haveOwnProperty('hint');
                done();
            });
        });
        it('should return all IdPs, trusting only those registered by swamid', (done) => {
            const entityID = encodeURIComponent("https://test-edusign.ed-integrations.com/shibboleth");
            const profile = "customer2";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(16);
                    data.forEach(idp => {
                        if (idp.registrationAuthority === "http://www.swamid.se/") {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return 12 IdPs, trusting only eduID', (done) => {
            const entityID = encodeURIComponent("https://test-edusign.ed-integrations.com/shibboleth");
            const profile = "customer2";
            const q = "edu";
            chai.request(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                    data.forEach(idp => {
                        if (idp.registrationAuthority === "http://www.swamid.se/") {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
    });
})

