
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
            chai.request.execute(app)
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
            chai.request.execute(app)
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
            chai.request.execute(app)
                .get(`/entities?q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                done();
            });
        });
        it('should return IdP with diacritics when searching without diacritics', (done) => {
            const q = "universite";
            chai.request.execute(app)
                .get(`/entities?q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    chai.expect(data[0].entityID).to.equal("https://idp.u-picardie.fr/idp/shibboleth");
                done();
            });
        });
        it('should return IdP with diacritics when searching with matching diacritics', (done) => {
            const q = "université";
            chai.request.execute(app)
                .get(`/entities?q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    chai.expect(data[0].entityID).to.equal("https://idp.u-picardie.fr/idp/shibboleth");
                done();
            });
        });
        it('should not return IdP with diacritics when searching with non-matching diacritics', (done) => {
            const q = "üniversité";
            chai.request.execute(app)
                .get(`/entities?q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(0);
                done();
            });
        });
        it('should return the SP for 3D Labs SP with a discovery_responses key', (done) => {
            const sp_id = _sha1_id("https://3d.labs.stonybrook.edu/shibboleth");
            chai.request.execute(app)
                .get(`/entities/${sp_id}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.discovery_responses.length).to.equal(1);
                    chai.expect(data.discovery_responses[0]).to.equal("https://3d.labs.stonybrook.edu/Shibboleth.sso/Login");

                done();
            });
        });
        it('should return eduID IdP - identified by id and allowed by profile', (done) => {
            const idp_id = _sha1_id("https://login.idp.eduid.se/idp.xml");
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "customer";
            chai.request.execute(app)
                .get(`/entities/${idp_id}?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    const idp = res.body;
                    chai.expect(idp.title).to.equal("eduID Sweden");

                done();
            });
        });
        it('should return a 404 - IdP identified by id but not allowed by profile', (done) => {
            const idp_id = _sha1_id("https://idp.u-picardie.fr/idp/shibboleth");
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "customer";
            chai.request.execute(app)
                .get(`/entities/${idp_id}?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(404);
                done();
            });
        });
        it('should return uleam IdP and 2 IdPs more with registration authority swamid', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "customer";
            chai.request.execute(app)
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
            chai.request.execute(app)
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
            chai.request.execute(app)
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
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(15);
                    data.forEach(idp => {
                        if (idp.title !== "eduID Sweden") {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return 12 IdPs, trusting only eduid', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "other";
            const q = "edu";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                    data.forEach(idp => {
                        if (idp.title !== "eduID Sweden") {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return shanghai dianji university', (done) => {
            const entityID = encodeURIComponent("https://cpauth.icos-cp.eu/saml/cpauth");
            const profile = "incommon-wayfinder";
            const q = "shanghai";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    chai.expect(data[0].title).to.equal("shanghai dianji university");
                done();
            });
        });
        it('should return 2 IdPs', (done) => {
            const entityID = encodeURIComponent("http://fs.liu.se/adfs/services/trust");
            const profile = "customer";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(2);
                    data.forEach(idp => {
                        chai.expect(idp.registrationAuthority).to.include("http://www.swamid.se/");
                        chai.expect(idp.registrationAuthority.length).to.equal(1);
                        chai.expect(idp).to.not.haveOwnProperty('hint');
                    });
                done();
            });
        });
        it('should return eduID IdP', (done) => {
            const entityID = encodeURIComponent("http://fs.liu.se/adfs/services/trust");
            const profile = "customer";
            const q = "edu";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    chai.expect(data[0].title).to.equal("eduID Sweden");
                    chai.expect(data[0].registrationAuthority).to.include("http://www.swamid.se/");
                    chai.expect(data[0].registrationAuthority.length).to.equal(1);
                    chai.expect(data[0]).to.not.haveOwnProperty('hint');
                done();
            });
        });
        it('should return all IdPs, trusting only those registered by swamid', (done) => {
            const entityID = encodeURIComponent("http://fs.liu.se/adfs/services/trust");
            const profile = "customer2";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(15);
                    data.forEach(idp => {
                        if (idp.registrationAuthority.includes("http://www.swamid.se/")) {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return 12 IdPs, trusting only those registered by swamid', (done) => {
            const entityID = encodeURIComponent("http://fs.liu.se/adfs/services/trust");
            const profile = "customer2";
            const q = "edu";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}&q=${q}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                    data.forEach(idp => {
                        if (idp.registrationAuthority.includes("http://www.swamid.se/")) {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return 1 IdP, registered by swamid and different from eduID', (done) => {
            const entityID = encodeURIComponent("https://csucoast.infoready4.com/shibboleth");
            const profile = "customer";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    data.forEach(idp => {
                        chai.expect(idp.registrationAuthority).to.include("http://www.swamid.se/");
                        chai.expect(idp.registrationAuthority.length).to.equal(1);
                        chai.expect(idp.title).to.not.equal("eduID Sweden");
                        chai.expect(idp).to.not.haveOwnProperty('hint');
                    });
                done();
            });
        });
        it('should return all IdPs, trusting only the one registered by swamid and different from eduID', (done) => {
            const entityID = encodeURIComponent("https://csucoast.infoready4.com/shibboleth");
            const profile = "customer2";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(15);
                    data.forEach(idp => {
                        if (idp.registrationAuthority.includes("http://www.swamid.se/") && idp.title !== "eduID Sweden") {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return the one IdPs with CoCv1 and different from eduID', (done) => {
            const entityID = encodeURIComponent("https://csucoast.infoready4.com/shibboleth");
            const profile = "customer3";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    data.forEach(idp => {
                        chai.expect(idp.entity_category).to.include("http://www.geant.net/uri/dataprotection-code-of-conduct/v1");
                        chai.expect(idp.title).to.not.equal("eduID Sweden");
                        chai.expect(idp).to.not.haveOwnProperty('hint');
                    });
                done();
            });
        });
        it('should return all IdPs trusting only the one with CoCv1 and different from eduID', (done) => {
            const entityID = encodeURIComponent("https://csucoast.infoready4.com/shibboleth");
            const profile = "customer4";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(15);
                    data.forEach(idp => {
                        if (!idp.entity_category || !idp.entity_category.includes("http://www.geant.net/uri/dataprotection-code-of-conduct/v1") || idp.title === "eduID Sweden") {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        } else {
                            chai.expect(idp).to.haveOwnProperty('hint');
                        }
                    });
                done();
            });
        });
        it('should return eduID, twice', (done) => {
            const entityID = encodeURIComponent("https://csucoast.infoready4.com/shibboleth");
            const profile = "customer7";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    const idp = data[0];
                    chai.expect(idp.title).to.equal('eduID Sweden');
                    chai.request.execute(app)
                        .get(`/entities/${idp.id}`)
                        .end((err2,res2) => {
                            chai.expect(res2.status).to.equal(200);
                            let idp2 = res2.body;
                            chai.expect(idp2.title).to.equal('eduID Sweden');
                    })
            });
            done();
        });
        it('should return eduID, still twice', (done) => {
            const entityID = encodeURIComponent("https://csucoast.infoready4.com/shibboleth");
            const profile = "customer7";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    const idp = data[0];
                    chai.expect(idp.title).to.equal('eduID Sweden');
                    chai.request.execute(app)
                        .get(`/entities/${idp.id}?entityID=${entityID}&trustProfile=${profile}`)
                        .end((err2,res2) => {
                            chai.expect(res2.status).to.equal(200);
                            let idp2 = res2.body;
                            chai.expect(idp2.title).to.equal('eduID Sweden');
                    })
            });
            done();
        });
        it('should return 2 IdPs', (done) => {
            const entityID = encodeURIComponent("https://box-idp.nordu.net/simplesaml/module.php/saml/sp/metadata.php/default-sp");
            const profile = "customer";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(2);
                    data.forEach(idp => {
                        chai.expect(idp.entity_category).to.include("http://www.geant.net/uri/dataprotection-code-of-conduct/v1");
                        chai.expect(idp.entity_category).to.include("http://refeds.org/category/research-and-scholarship");
                    });
                done();
            });
        });
        it('should return all IdPs, trusting only 2 of them', (done) => {
            const entityID = encodeURIComponent("https://box-idp.nordu.net/simplesaml/module.php/saml/sp/metadata.php/default-sp");
            const profile = "customer2";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(15);
                    let i = 0;
                    data.forEach(idp => {
                        if (idp.entity_category && idp.entity_category.includes("http://www.geant.net/uri/dataprotection-code-of-conduct/v1") && idp.entity_category.includes("http://refeds.org/category/research-and-scholarship") ) {
                            chai.expect(idp).to.haveOwnProperty('hint');
                            i++;
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                chai.expect(i).to.equal(2);
                done();
            });
        });
        it('should return 12 IdPs, trusting only 2 of them', (done) => {
            const q = "edu";
            const entityID = encodeURIComponent("https://box-idp.nordu.net/simplesaml/module.php/saml/sp/metadata.php/default-sp");
            const profile = "customer2";
            chai.request.execute(app)
                .get(`/entities?q=${q}&entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                    let i = 0;
                    data.forEach(idp => {
                        if (idp.entity_category && idp.entity_category.includes("http://www.geant.net/uri/dataprotection-code-of-conduct/v1") && idp.entity_category.includes("http://refeds.org/category/research-and-scholarship") ) {
                            chai.expect(idp).to.haveOwnProperty('hint');
                            i++;
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                chai.expect(i).to.equal(2);
                done();
            });
        });
        it('should also return 12 IdPs, trusting only 2 of them', (done) => {
            const q = "edu";
            const entityID = encodeURIComponent("https://box-idp.nordu.net/simplesaml/module.php/saml/sp/metadata.php/default-sp");
            const profile = "customer25";
            chai.request.execute(app)
                .get(`/entities?q=${q}&entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(12);
                    let i = 0;
                    data.forEach(idp => {
                        if (idp.entity_category && idp.entity_category.includes("http://refeds.org/category/research-and-scholarship") && idp.md_source && idp.md_source.includes("https://mdq.incommon.org/entities") ) {
                            chai.expect(idp).to.haveOwnProperty('hint');
                            i++;
                        } else {
                            chai.expect(idp).to.not.haveOwnProperty('hint');
                        }
                    });
                chai.expect(i).to.equal(2);
                done();
            });
        });
        it('should return nothing', (done) => {
            const entityID = encodeURIComponent("https://csucoast.infoready4.com/shibboleth");
            const profile = "customer7";
            chai.request.execute(app)
                .get(`/entities?entityID=${entityID}&trustProfile=${profile}`)
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    let data = res.body;
                    chai.expect(data.length).to.equal(1);
                    const idp = data[0];
                    chai.expect(idp.title).to.equal('eduID Sweden');
                    const profile2 = "customer4";
                    chai.request.execute(app)
                        .get(`/entities/${idp.id}?entityID=${entityID}&trustProfile=${profile2}`)
                        .end((err2,res2) => {
                            chai.expect(res2.status).to.equal(200);
                            let idp2 = res2.body;
                            chai.expect(idp2.title).to.equal('eduID Sweden');
                    })
            });
            done();
        });
    });
})

