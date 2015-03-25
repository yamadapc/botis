'use strict'; /* global describe, it, beforeEach */
var Promise = require('bluebird');
var _ = require('lodash');
var makeStub = require('mocha-make-stub');
var github = require('octonode');
var should = require('should');
var botis = require('..');

describe('botis', function() {
  it('gets exposed', function() {
    should.exist(botis);
  });

  beforeEach(function() {
    this.client = github.client('fake-token');
  });

  describe('.getIssuesWithLabels(repo, targetLabels[, since])', function() {
    makeStub(github.repo.prototype, 'issuesAsync', function() {
      return Promise.resolve([
        [
          { labels: [{ name: 'waiting', }], number: 100, comments: 3, },
          { labels: [{ name: 'something-else', }], number: 100, comments: 2, },
          { labels: [{ name: 'waiting', }], number: 100, comments: 0, },
        ],
        [] // This would be the headers part of the result
      ]);
    });

    it('gets exposed', function() {
      botis.should.have.property('getIssuesWithLabels');
    });

    it('fetches and filters issues matching a set of labels', function() {
      var repo = this.client.repo('yamadapc/some-fake-repo');
      return botis.getIssuesWithLabels(repo, ['waiting'])
        .then(function(issues) {
          _.pluck(issues, 'number').should.containEql(100);
        });
    });

    it('ignores comments which don\'t have comments', function() {
      var repo = this.client.repo('yamadapc/some-fake-repo');
      return botis.getIssuesWithLabels(repo, ['waiting'])
        .then(function(issues) {
          _.pluck(issues, 'number').should.not.containEql(101);
        });
    });
  });

  describe('.parseCommand(issue)', function() {
    it('gets exposed', function() {
      botis.should.have.property('parseCommand');
    });

    it('parses commands out of issues', function() {
      var command = botis.parseCommand('bot', {
        comments: [
          {
            id: 85684700,
            user:
             {
               login: 'yamadapc',
               id: 3923654,
               type: 'User',
               site_admin: false
            },
            body: 'Remind me to do this on March 29th'
          }
        ],
      });
      command.date.getMonth().should.equal(2);
      command.date.getDate().should.equal(29);
    });

    it('ignores if the comment was already awswered', function() {
      var command = botis.parseCommand('bot', {
        comments: [
          {
            id: 85684700,
            user:
             {
               login: 'yamadapc',
               id: 3923654,
               type: 'User',
               site_admin: false
            },
            body: 'Remind me to do this on March 29th'
          },
          { user: { login: 'bot', } }
        ],
      });
      should.not.exist(command);
    });
  });
});
