
require("regenerator-runtime/runtime");
const path = require('path');
const assert = require('assert');
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);
const app = require('../server.js')
const pkg = require('../package.json')
const load_metadata = require('../metadata.js');

describe('GET /', () => {
    it('should return version info', (done) => {
        load_metadata(path.join(__dirname,'/edugain.json'),false).then((md) => {
            app.locals.md = md;
            chai.request(app)
                .get('/')
                .end((err,res) => {
                    chai.expect(res.status).to.equal(200);
                    console.log(res.body);
                    let status = res.body; //JSON.parse(res.body);
                    chai.expect(status).to.haveOwnProperty('version');
                    chai.expect(status.version).to.equal(pkg.version);
            });
        }).then(done);
    });
})

