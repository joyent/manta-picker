/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

'use strict';
var fs = require('fs');
var assert = require('assert-plus');
var restify = require('restify');
var errors = require('restify-errors');

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

function createServer(storinfo, log) {
    var server = restify.createServer({
        name: 'STORINFO/' + getVersion(),
        log: log.child({ component: 'api' }, true),
        formatters: {
                   'application/json': formatJSON,
                   'text/plain': formatJSON,
                   'application/octet-stream': formatJSON,
                   'application/x-json-stream': formatJSON,
                   '*/*': formatJSON },
        handleUncaughtExceptions: false
    });

    server.use(function _setStorinfo(req, res, next) {
        req.storinfo = storinfo;
        next();
        return;
    });

    server.use(restify.plugins.queryParser());

    server.get({ path: '/storagenodes', name: 'GetStorageNodes' },
        getStorageNodes);
    server.get({ path: '/storagenodes/:storageid', name: 'GetStorageNode' },
        getStorageNode);
    server.post({ path: '/flush', name: 'FlushCache' }, flush);

    return server;
}

function getStorageNodes(req, res, next) {
    var limit = req.storinfo.defPageSz;
    var after_id = null;
    var start_idx = 0;
    var end_idx;
    var idx;

    var sharkMap = req.storinfo.operatorDcSharkMap;
    var nSharks = sharkMap.length;

    for (const param of Object.keys(req.params)) {
        var err;

        switch (String(param)) {
            case 'limit':
                limit = parseInt(req.params.limit, 10);
                if (isNaN(limit) || limit < 1 ||
                    limit > req.storinfo.maxPageSz) {

                    err = new errors.BadRequestError({
                        statusCode: 400
                    }, 'Invalid value for limit parameter: ' + limit);
                    return (next(err));
                }
                break;
            case 'after_id':
                after_id = req.params.after_id;
                break;
            default:
                err = new errors.BadRequestError({
                    statusCode: 400
                    }, 'Invalid parameter: ' + param);
                return (next(err));
        }
    }

    /*
     * The fast path.  If after_id was not specified AND the limit is greater
     * than or equal to the total number of results, then just return the
     * entire shark map.
     */
    if (after_id === null && limit >= nSharks) {
        res.send(200, sharkMap);
        return (next());
    }

    if (after_id !== null) {
        var last_idx =
            /* JSSTYLED */
           sharkMap.findIndex(obj => obj.manta_storage_id === after_id);

        if (last_idx === -1) {
            /*
             * The shark referenced by after_id isn't in the map - possibly
             * because it was removed.  We need to figure out where to set the
             * cursor now.  Basically we want to find the index N in the
             * sharkMap array where:
             *
             * Map[N-1].manta_storage_id < after_id < Map[N].manta_storage_id
             */
            var still_looking = true;

            /*
             * Before we search, let's check the obvious edge cases:
             */
            if (sharkMap[0].manta_storage_id > after_id) {
                start_idx = 0;
                still_looking = false;
            } else if (sharkMap[nSharks - 1].manta_storage_id < after_id) {
                return (next(new errors.NotFoundError()));
            }

            /*
             * Ok, do a binary search through the array to find index N.
             */
            idx = Math.floor(nSharks / 2);
            while (still_looking) {
                if (sharkMap[idx].manta_storage_id > after_id) {
                    if (idx === 0 ||
                        sharkMap[idx - 1].manta_storage_id < after_id) {

                        start_idx = idx;
                        still_looking = false;
                    } else {
                        idx = Math.floor(idx / 2);
                    }
                } else {
                    idx += Math.floor((nSharks - idx) / 2);
                }
            }
        } else {
            start_idx = last_idx + 1;
        }
    }

    /*
     * Create a page-sized slice of the shark map.
     */
    end_idx = Math.min((start_idx + limit), nSharks);
    var sharkMapSlice = sharkMap.slice(start_idx, end_idx);

    /*
     * If there are more sharks left, construct the next link in the response
     * header.
     */
    if (end_idx < nSharks) {
        let last_id = sharkMap[end_idx - 1].manta_storage_id;
        let next_link = req.path() + '?after_id=' + last_id + '&limit=' + limit;
        res.link(next_link, 'next');
    }

    /*
     * Send out the result.
     */
    res.send(200, sharkMapSlice);
    return (next());
}

function getStorageNode(req, res, next) {
    var storageid = req.params.storageid;
    var sharkMap = req.storinfo.operatorDcSharkMap;

    /* JSSTYLED */
    var idx = sharkMap.findIndex(obj => obj.manta_storage_id === storageid);

    if (idx === -1) {
        return (next(new errors.NotFoundError()));
    }
    res.send(200, sharkMap[idx]);
    return (next());
}

function flush(req, res, next) {
    req.storinfo.log.info('flush requested by ' + req.connection.remoteAddress);
    req.storinfo.flush();
    res.send(200);
    return (next());
}

module.exports = {
    createServer: createServer
};
