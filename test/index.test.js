'use strict'; /* global describe, it */
var botis = require('..');
var should = require('should');

describe('botis', function() {
  it('gets exposed', function() {
    should.exist(botis);
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
