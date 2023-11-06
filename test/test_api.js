
require("regenerator-runtime/runtime");
const path = require('path');
const assert = require('assert');
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const app = require('../server.js')
const pkg = require('../package.json')
const load_metadata = require('../metadata.js');


chai.use(chaiHttp);
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
                    chai.expect(res.status).to.equal(200);
                    let status = res.body; //JSON.parse(res.body);
                    chai.expect(status).to.haveOwnProperty('version');
                    chai.expect(status.version).to.equal(pkg.version);
                done();
            });
        });
    });
    describe('GET /entities', () => {
        it('should return all IdPs', (done) => {
            chai.request(app)
                .get('/entities')
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(15);
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
                    chai.expect(data.length).to.equal(15);
                    data.forEach(idp => {
                        if (idp.title !== "eduID Sweden") {
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
                        if (idp.title !== "eduID Sweden") {
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
                    chai.expect(data.length).to.equal(15);
                    data.forEach(idp => {
                        if (idp.registrationAuthority !== "http://www.swamid.se/") {
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
                        if (idp.registrationAuthority !== "http://www.swamid.se/") {
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

