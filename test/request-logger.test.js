'use strict'; /* global describe, it, before */
var http = require('http');
var _ = require('lodash');
var makeStub = require('mocha-make-stub');
var should = require('should');

var logger = require('../lib/request-logger');

describe('request-logger', function() {
  before(function(done) {
    mockServer(done);
  });

  describe('.start()', function() {
    before(function() {
      logger.start();
    });

    it('gets exposed', function() {
      should.exist(logger.start);
      logger.start.should.instanceof(Function);
    });

    it('logs HTTP requests made with octonode\'s `request`', function(done) {
      var _this = this;
      logger.request('http://localhost:3000', function(err/*, res*/) {
        if(err) return done(err);
        done();
      });
    });
  });
});

var mockServer = _.once(function(cb) {
  var server = http.createServer(function(req, res) {
    res.end('Hello World');
  });
  server.listen(3000, cb);
});
