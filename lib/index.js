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

/**
 * The main entry point for the bot. Keeps looping every 10 seconds for new
 * issues with GitHub and dealing `reminder` requests when they appear. Appart
 * from its basic interval, it uses RedisDB's support for expiring values and
 * subscribing to when they expire to back the actual reminder logic. This means
 * that it could be made reasonably fault-tolerant (though it isn't). It's, on
 * the plus-side, ready to be distributed.
 *
 * It'll ignore issues without the labels it's told explicitly to watch. This is
 * because the software isn't well tested enough and I don't want to flood
 * people's e-mails.
 *
 * @param {Object} options
 * @param {String} options.token A GitHub API token
 * @param {String} options.repo The repository name to watch
 * @param {String} options.user The bot's username (necessary for knowing who to
 * answer; the bot will loop forever if this is wrong)
 * @param {Array.<String>} options.labels An array of labels to watch
 * @param {Number} [options.redisPort] The port of our Redis Backend
 * @param {String} [options.redisHost] The host of our Redis Backend
 */

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

/**
 * Fetches issues which have any of the `targetLabels` and more than 0 comments.
 *
 * @param {Repo} repo
 * @param {Array.<String>} targetLabels
 * @param {Date} [since] (optional) Date when the last request was made; this
 * way we don't keep getting the same results over and over again
 * @return {Promise} A promise to the issue objects
 */

exports.getIssuesWithLabels = getIssuesWithLabels;
function getIssuesWithLabels(repo, targetLabels, since) {
  var query = { state: 'all', page: 1, per_page: 200 };
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

/**
 * Parses a command out of a GitHub issue. Skips commands which were already
 * dealt with.
 *
 * @param {String} botUser The `options.user` setting
 * @param {Object} issue
 * @return {Promise} Either null or a command with `date`, `issue` and `comment`
 * properties.
 */

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

/**
 * Schedules the reminder relative to a certain command in RedisDB using
 * `redis-scheduler. Will cancel other existing reminders for this issue.
 *
 * @param {Object} options See `mainLoop`
 * @param {Client} client The `octonode` Client instance
 * @param {Scheduler} scheduler From `redis-scheduler`
 * @param {Object} command The command generated with `parseCommand`
 * @return {Promise} A promise to the scheduling
 */

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

/**
 * Sends the reminder as a comment. This should be expanded to make a better
 * reminder (mentions, gcal, emails, etc).
 */

exports.sendReminder = sendReminder;
function sendReminder(client, name, command) {
  return commentOnIssue(client, name, command.issue.number,
    'Reminding you about this :)');
}

/**
 * Pings the user, assuring the command was correctly parsed and scheduled.
 */

exports.replyToComment = replyToComment;
function replyToComment(client, name, command) {
  return commentOnIssue(client, name, command.issue.number,
    'I\'ve set a reminder for this issue which will expire on:\n' +
    '**' + command.date + '**');
}

/**
 * Helper for commenting on a GitHub issue. For some reason `octonode` doesn't
 * wrap this endpoint.
 */

function commentOnIssue(client, name, number, message) {
  var url = '/repos/' + name + '/issues/' + number + '/comments';
  var req = client.postAsync(url, { body: message });
  return req;
}
