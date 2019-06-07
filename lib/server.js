/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

'use strict';
var fs = require('fs');
var assert = require('assert-plus');
var restify = require('restify');



/*
 * Force JSON for all accept headers
 */
function formatJSON(req, res, body, callback) {
    var formattedJson;

    if (body instanceof Error) {
        // snoop for RestError or HttpError, but don't rely on
        // instanceof
        res.statusCode = body.statusCode || 500;

        if (body.body) {
            body = body.body;
        } else {
            body = { message: body.message };
        }
    } else if (Buffer.isBuffer(body)) {
        body = body.toString('base64');
    }

    var data = JSON.stringify(body);

    res.setHeader('Content-Length', Buffer.byteLength(data));
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'HEAD') {
        // In case of a successful response to a HEAD request, the formatter is
        // used to properly set the Content-Length header, but no data should
        // actually be sent as part of the response's body. This is all
        // according to RFC 2616.
        formattedJson = '';
    } else {
        formattedJson = data;
    }

    callback(null, formattedJson);
}

function getVersion() {
    var pkg = fs.readFileSync(__dirname + '/../package.json', 'utf8');
    var ver = JSON.parse(pkg).version;
    assert.string(ver, 'version');
    return ver;
}

function createServer(picker, log) {
    var server = restify.createServer({
        name: 'PICKER/' + getVersion(),
        log: log.child({ component: 'api' }, true),
        formatters: {
                   'application/json': formatJSON,
                   'text/plain': formatJSON,
                   'application/octet-stream': formatJSON,
                   'application/x-json-stream': formatJSON,
                   '*/*': formatJSON },
        handleUncaughtExceptions: false
    });

    server.use(function _setPicker(req, res, next) {
        req.picker = picker;
        next();
        return;
    });

    server.get({ path: '/poll', name: 'GetSharks' }, poll);

    return server;
}

function poll(req, res, next) {
    res.send(200, req.picker.dcSharkMap);
    next();
    return;
}

module.exports = {
    createServer: createServer
};
