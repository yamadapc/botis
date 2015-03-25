'use strict';
var Promise = require('bluebird');
var chrono = require('chrono-node');
var _ = require('lodash');
var github = require('octonode');
var Scheduler = require('redis-scheduler');

// Compatibility to Promises
Promise.promisifyAll(Scheduler.prototype);
_.each(github, function(sub) {
  Promise.promisifyAll(sub.prototype || sub);
});


exports.mainLoop = mainLoop;
function mainLoop(options) {
  var client = github.client(options.token);
  Promise.promisifyAll(client);
  var repo = client.repo(options.repo);
  var since;
  var scheduler = new Scheduler({
    port: options.redisPort,
    host: options.redisHost,
  });

  setInterval(function run() {
    var waitingP = getIssuesWithLabels(repo, options.labels, since);
    waitingP.then(function() {
      since = new Date();
    });

    var commentssP = waitingP
      .map(function(issue) {
        var commentsP = client.issue(options.repo, issue.number)
          .commentsAsync().spread(_.identity); // discard the headers
        return commentsP;
      });

    var toScheduleP = Promise.join(waitingP, commentssP)
      .spread(merge)
      .map(_.partial(parseCommand, options.user))
      .filter(_.identity);

    toScheduleP
      .then(function(commands) {
        return Promise.map(commands, function(command) {
          return scheduleReminder(options, client, scheduler, command)
            .then(_.partial(replyToComment, client, options.repo, command))
            .catch(handleError);
        });
      })
      .catch(function(err) {
        handleError(err);
      });
  }, 10000);

  function handleError(err) {
    console.error(err.stack || err);
  }

  function merge(issues, commentss) {
    return _.map(issues, function(issue, i) {
      var comments = commentss[i];
      issue.comments = comments;
      return issue;
    });
  }
}

exports.getIssuesWithLabels = getIssuesWithLabels;
function getIssuesWithLabels(repo, targetLabels, since) {
  var query = { state: 'all', page: 1, per_page: 3000 };
  if(since) query.since = since.toISOString();

  return repo.issuesAsync(query).spread(filterIssues);

  function filterIssues(issues) {
    return _.filter(issues, function(issue) {
      return hasLabels(issue) && issue.comments;
    });
  }

  function hasLabels(issue) {
    return _.some(issue.labels, function(label) {
      return _.contains(targetLabels, label.name);
    });
  }
}

exports.parseCommand = parseCommand;
function parseCommand(botUser, issue) {
  var commentsDates = _(issue.comments).map(function(comment) {
    return !isMe(comment) && chrono.parseDate(comment.body);
  });
  var commandIdx = commentsDates.findLastIndex(function(date) {
    return !!date;
  });

  if(commandIdx < 0 || alreadyAnswered(commandIdx)) {
    return null;
  }

  return {
    date: commentsDates.value()[commandIdx],
    comment: issue.comments[commandIdx],
    issue: issue,
  };

  function alreadyAnswered(commandIdx) {
    return _.some(issue.comments.slice(commandIdx + 1), isMe);
  }

  function isMe(comment) {
    return comment.user.login === botUser;
  }
}

exports.scheduleReminder = scheduleReminder;
function scheduleReminder(options, client, scheduler, command) {
  var key = options.repo + ':issue:' + command.issue.number;
  return scheduler.cancelAsync(key)
    .catch(function() {})
    .then(function() {
      return scheduler.scheduleAsync({
        key: key,
        expire: command.date,
        handler: _.partial(sendReminder, client, options.repo, command),
      });
    });
}

exports.sendReminder = sendReminder;
function sendReminder(client, name, command) {
  return commentOnIssue(client, name, command.issue.number,
    'Reminding you about this :)');
}

exports.replyToComment = replyToComment;
function replyToComment(client, name, command) {
  return commentOnIssue(client, name, command.issue.number,
    'I\'ve set a reminder for this issue which will expire on:\n' +
    '**' + command.date + '**');
}

function commentOnIssue(client, name, number, message) {
  var url = '/repos/' + name + '/issues/' + number + '/comments';
  var req = client.postAsync(url, { body: message });
  return req;
}
