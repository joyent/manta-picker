/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

'use strict';

var assert = require('assert-plus');
var bunyan = require('bunyan');
var dashdash = require('dashdash');
var dtrace = require('dtrace-provider');
var fs = require('fs');
var restify = require('restify');

var constants = require('./lib/constants');
var storinfo = require('./lib/storinfo');
var server = require('./lib/server');

// --- Internal Functions

function getStorinfoOptions() {
    var options = [
        {
            names: ['file', 'f'],
            type: 'string',
            help: 'Configuration file to use.',
            helpArg: 'FILE'
        },
        {
            names: ['port', 'p'],
            type: 'positiveInteger',
            help: 'Listen for requests on port.',
            helpArg: 'PORT'
        },
        {
            names: ['verbose', 'v'],
            type: 'arrayOfBool',
            help: 'Verbose output. Use multiple times for more verbose.'
        }
    ];

    return (options);
}


/**
 * Command line option parsing and checking.
 *
 * @returns {Object} A object representing the command line options.
 */
function parseOptions() {
    var opts;
    var parser = new dashdash.Parser({options: getStorinfoOptions()});

    try {
        opts = parser.parse(process.argv);
        assert.object(opts, 'options');
    } catch (e) {
        usage(parser, e.message);
    }

    if (!opts.file) {
        usage(parser, '-f option is required');
    }

    return (opts);
}

function usage(parser, message) {
    console.error('storinfo: %s', message);
    console.error('usage: node main.js OPTIONS\n');
    console.error(parser.help());
    process.exit(2);
}

function createStorinfoClient(cfg, log, onConnect) {
    var opts = {
        interval: cfg.interval,
        lag: cfg.lag,
        moray: cfg.moray,
        log: log.child({component: 'storinfo'}, true),
        multiDC: cfg.multiDC,
        defaultMaxStreamingSizeMB: cfg.defaultMaxStreamingSizeMB ||
            constants.DEF_MAX_STREAMING_SIZE_MB,
        maxUtilizationPct: cfg.maxUtilizationPct ||
            constants.DEF_MAX_PERCENT_UTIL,
        maxOperatorUtilizationPct: cfg.maxOperatorUtilizationPct ||
            constants.DEF_MAX_OPERATOR_PERCENT_UTIL,
        testMorayData: cfg.testMorayData
    };

    var client = storinfo.createClient(opts);

    client.once('connect', function _onConnect() {
        log.info('storinfo connected %s', client.toString());
        onConnect(client);
    });
}


/*
 * Loads and parse the configuration file at "configFilePath".
 * Returns the content of the configuration file as a JavaScript
 * object. Throws an exception if configFilePath is not valid JSON,
 * or cannot be read.
 */
function loadConfig(configFilePath) {
    assert.string(configFilePath, 'configFilePath');

    return JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
}



// --- Mainline

(function main() {
    // DTrace probe setup
    var dtp = dtrace.createDTraceProvider('storinfo');
    var client_close = dtp.addProbe('client_close', 'json');
    var socket_timeout = dtp.addProbe('socket_timeout', 'json');

    client_close.dtp = dtp;
    socket_timeout.dtp = dtp;
    dtp.enable();

    const opts = parseOptions();
    const cfg = loadConfig(opts.file);
    const log = bunyan.createLogger({
        name: 'vmapi',
        level: cfg.bunyan.level,
        serializers: restify.bunyan.serializers
    });

    createStorinfoClient(cfg, log, function _onStorinfoConnect(storinfoClient) {
        var s;

        log.info('Moray client connections established, '
        + 'starting storinfo REST servers');

        s = server.createServer(storinfoClient, log);
        s.on('error', function (err) {
            log.fatal(err, 'createServer error');
            process.exit(1);
        });
        s.listen(cfg.port, function () {
            log.info('storinfo REST service listening on %s', s.url);
        });
    });

    process.on('SIGHUP', process.exit.bind(process, 0));

})();
