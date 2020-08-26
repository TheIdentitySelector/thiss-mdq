
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
    app.locals.md = load_metadata(path.join(__dirname,'/edugain.json'));

    it('should return version info', done => {
        chai.request(app)
            .get('/')
            .end((err,res) => {
                res.should.have.status(200);
                let status = JSON.parse(res.body);
                status.should.haveOwnProperty('version');
                chai.expect(status.version).to.equal(pkg.version);
        });
    })
})

