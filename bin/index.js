#!/usr/bin/env node
'use strict';
var Promise = require('bluebird');
var program = require('commander');
var chrono = require('chrono-node');
var _ = require('lodash');
var github = require('octonode');
var Scheduler = require('redis-scheduler');

Promise.promisifyAll(Scheduler.prototype);
_.each(github, function(sub) {
  Promise.promisifyAll(sub.prototype || sub);
});

function main(argv) {
  program
    .option('-r, --repo <repo>', 'The repository to watch')
    .option('-u, --user <user>', 'The bot\'s user name')
    .option('-t, --token <token>', 'A GitHub API token')
    .option('-p, --redis-port [port=6379]', 'A RedisDB port')
    .option('-h, --redis-host [host=localhost]', 'A RedisDB host')
    .option('-l, --labels <labels ...>', 'The issue labels to consider')
    .parse(argv);

  if(!program.labels || !program.repo || !program.token || !program.user) {
    console.error(
      'Missing required fields. For more information, try:\n' +
      'botis --help'
    );
    process.exit(1);
  }

  program.labels && (program.labels = program.labels.split(','));
  mainLoop(program);
}

function mainLoop(options) {
  var client = github.client(options.token);
  var repo = client.repo(options.repo);
  var since = new Date();
  var scheduler = new Scheduler({
    port: options.redisPort,
    host: options.redisHost,
  });

  setInterval(function() {
    var waitingP = getIssuesWithLabels(repo, options.labels, since);
    log(waitingP, 'HTTP GET 200 /repos/' + options.repo + '/issues');

    var commentssP = waitingP
      .map(function(issue) {
        var commentsP = client.issue(options.repo, issue.id).commentsAsync();
        log(
          commentsP,
          'HTTP GET 200 /repos/' + options.repo + '/issues/' + issue.id + '/comments'
        );
        return commentsP;
      });

    var toScheduleP = Promise.join(waitingP, commentssP)
      .spread(merge)
      .map(parseCommand)
      .filter(_.identity);

    toScheduleP
      .then(function(commands) {
        since = new Date();
        return Promise.map(commands, function(command) {
          return scheduleReminder(scheduler, command)
            .then(_.partial(replyToComment, command))
            .catch(handleError);
        });
      })
      .catch(function(err) {
        since = new Date();
        handleError(err);
      });
  }, 10000);

  function handleError(err) {
    console.error(err.stack);
  }

  function merge(issues, commentss) {
    return _.map(issues, function(issue, i) {
      var comments = commentss[i];
      issue.ncomments = issue.comments;
      issue.comments = comments;
      return issue;
    });
  }
}

function getIssuesWithLabels(repo, targetLabels, since) {
  var query = { state: 'all', page: 1, per_page: 3000 };
  if(since) query.since = since;

  return repo.issuesAsync().spread(filterIssues);

  function filterIssues(issues ) {
    return _.filter(issues, function(issue) {
      return hasLabels(issue) && issue.comments[0];
    });
  }

  function hasLabels(issue) {
    return _.some(issue.labels, function(label) {
      return _.contains(targetLabels, label.name);
    });
  }
}

function parseCommand(issue) {
  var commentsDates = _(issue.comments).map(function(comment) {
    return !isMe(comment) && chrono.parseDate(comment.body);
  });
  var commandIdx = commentsDates.findLastIndex(function(date) {
    return !!date;
  }).value();

  if(!commandIdx || alreadyAnswered(commandIdx)) {
    return null;
  }

  return {
    date: commentsDates[commandIdx],
    comment: issue.comments[commandIdx],
    issue: issue,
  };

  function alreadyAnswered(commandIdx) {
    return commandIdx < issue.ncomments - 1 &&
      _.some(issue.comments.slice(commandIdx), isMe);
  }

  function isMe(comment) {
    return comment.user.login === 'yamadapc';
  }
}

function scheduleReminder(scheduler, command) {
  return scheduler.scheduleAsync({
    key: 'issue:' + command.issue.id,
    expire: command.date,
    handler: _.partial(sendReminder, command.issue.id),
  });
}

function sendReminder(id) {
  console.log('Sending reminder...');
}

function replyToComment(client, command) {
  console.log('Replying to comment');
}

function log(promise, message) {
  promise.then(function() {
    console.log(message);
  });
  return promise;
}

if(!module.parent) {
  main(process.argv);
}
