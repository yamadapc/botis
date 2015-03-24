'use strict';
var chalk = require('chalk');
var request = require('octonode/node_modules/request');

var ORIGINAL_ON_REQUEST_RESPONSE = request.Request.prototype.onRequestResponse;

// Expose the monkey-patched module
exports.request = request;

/**
 * Starts logging HTTP requests made with `Request`
 */

exports.start = function() {
  request.Request.prototype.onRequestResponse = exports._onRequestResponse;
};

/**
 * Stops logging HTTP requests made with `Request`
 */

exports.stop = function() {
  request.Request.prototype.onRequestResponse = exports._onRequestResponse;
};

/**
 * Tweaked `Request.prototype.onRequestResponse` method with logging attached.
 */

exports._onRequestResponse =
function onRequestResponse(res) {
  var st = res.statusCode;
  if(st < 300) {
    st = chalk.green(st);
  } else if (st < 400) {
    st = chalk.yellow(st);
  } else {
    st = chalk.red(st);
  }

  console.log(
    chalk.magenta(
      this.uri.protocol.toUpperCase().replace(/[^\w]/g, '')
    ) + ' ' +
    chalk.cyan(this.method) + ' ' +
    st + ' ' +
    chalk.gray(this.uri.href)
  );

  ORIGINAL_ON_REQUEST_RESPONSE.apply(this, arguments);
};
