/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

'use strict';

/*
 * The minnow service, which runs on each manta storage node, periodically
 * updates a per-storage-node record in the manta_storage bucket with storage
 * utilization information.  This bucket is stored in shard 1 in each
 * region.   Services, such as the rebalancer and muskie require frequent
 * access to this storage utilization information as part of normal operations.
 *
 * To avoid hot-shard issues caused by all of the rebalancer and muskie service
 * instances hitting shard 1 to get storage utilization data, the manta-picker
 * (soon to be renamed to manta-storage-utilization) provides an interface for
 * retrieving a cached view of the contents of the manta_storage bucket via the
 * /poll REST endpoint.
 *
 * This cached view of the manta_storage bucket is refreshed at a rate
 * determined by the "storageInterval" config parameter.
 */
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var assert = require('assert-plus');
var fs = require('fs');
var jsprim = require('jsprim');
var moray = require('moray');
var once = require('once');

// --- Globals

var sprintf = util.format;


// --- Private Functions

// Refreshes the local cache from moray

function fetchMoray(opts, cb) {
    assert.object(opts, 'options');
    assert.number(opts.lag, 'options.lag');
    assert.object(opts.moray, 'options.moray');
    assert.number(opts.utilization, 'options.utilization');
    assert.optionalNumber(opts.limit, 'options.limit');
    assert.optionalNumber(opts.marker, 'options.marker');
    assert.optionalArrayOfObject(opts.values, 'options.values');
    assert.func(cb, 'callback');

    cb = once(cb);

    var count = 0;
    var recs = 0;
    var f = sprintf('(&(percentUsed<=%d)(timestamp>=%d)%s)',
                    opts.utilization,
                    Date.now() - opts.lag,
                    opts.marker ? '(_id>=' + opts.marker + ')' : '');
    var marker = opts.marker;
    var _opts = {
        limit: opts.limit || 100,
        sort: {
            attribute: '_id',
            order: 'ASC'
        }
    };
    var req = opts.moray.findObjects('manta_storage', f, _opts);
    var values = opts.values || [];

    req.once('error', cb);

    req.on('record', function onRecord(data) {
        values.push(data.value);
        count = data._count;
        marker = data._id;
        recs++;
    });

    req.once('end', function () {
        /*
         * We only fetch "limit" records, but there may be many more storage
         * nodes than that.  If we saw fewer records than the number that Moray
         * reported matched our query, that means there are more to fetch, so
         * we take another lap.
         */
        if (recs < count) {
            var next = {
                lag: opts.lag,
                limit: opts.limit,
                marker: ++marker,
                moray: opts.moray,
                utilization: opts.utilization,
                values: values
            };
            fetchMoray(next, cb);
        } else {
            cb(null, values);
        }
    });
}


/*
 * A comparison function used to order storage zones based on their
 * manta_storage_id.
 *
 * @param {object} a               - a storage zone object
 * @param {object} b               - a storage zone object
 * @throws {TypeError} on bad input.
 */
function storageZoneComparator(a, b) {
    assert.object(a, 'a');
    assert.object(b, 'b');
    assert.string(a.manta_storage_id, 'a.manta_storage_id');
    assert.string(b.manta_storage_id, 'b.manta_storage_id');

    /*
     * The value for manta_storage_id has the following format:
     *
     * <inst>.stor.<region>.<dns domain>
     *
     * We want to numerically sort based on the inst
     */
    var inst_a = parseInt(a.manta_storage_id.split('.')[0], 10);
    var inst_b = parseInt(b.manta_storage_id.split('.')[0], 10);

    if (inst_a < inst_b) {
        return (-1);
    } else if (inst_a > inst_b) {
        return (1);
    }

    return (0);
}


/*
 * A function to sort the storage zones available for normal requests and those
 * available only for operator requests within each datacenter by available
 * storage.
 *
 * @param {object} dcObj   - an array of storage zones, filtered by
 *                           MUSKIE_MAX_UTILIZATION_PCT
 *
 * @param {object} opDcObj - an unfiltered array of storage zones
 *
 * @throws {TypeError} on bad input.
 */
function sortAndStoreDcs(dcObj, opDcObj) {
    assert.arrayOfObject(dcObj, 'dcObj');
    assert.arrayOfObject(opDcObj, 'opDcObj');

    dcObj.sort(storageZoneComparator);
    opDcObj.sort(storageZoneComparator);

    if (dcObj.length === 0) {
        this.log.warn('Picker.sortAndStoreDcs: could not find any minnow ' +
            'instances');
    }

    if (opDcObj.length === 0) {
        this.log.warn('Picker.sortAndStoreDcs: could not find any minnow ' +
            'instances for operator requests');
        this.operatorDatacenters = [];
    }

    this.dcSharkMap = dcObj;
    this.operatorDcSharkMap = opDcObj;
    this.emit('topology', [this.dcSharkMap, this.operatorDcSharkMap]);

    this.log.trace('Picker.sortAndStoreDcs: done');
}

/**
 * Callback function invoked to process the storage zone query results from
 * moray. The results are sorted based on the datacenter of each storage zone.
 * This function requires that "this" be bound to an instance of Picker.
 */
function handleStorageResults(err, storageZoneResults) {
    clearTimeout(this._storageTimer);
    this._storageTimer =
        setTimeout(pollStorage.bind(this), this.storageInterval);

    if (err) {
        /*
         * Most errors here would be operational errors, including cases
         * where we cannot reach Moray or Moray cannot reach PostgreSQL or
         * the like.  In these cases, we want to log an error (which will
         * likely fire an alarm), but do nothing else.  We'll retry again on
         * our normal interval.  We'll only run into trouble if this doesn't
         * succeed for long enough that minnow records expire, and in that
         * case there's nothing we can really do about it anyway.
         *
         * It's conceivable that we hit a persistent error here like Moray
         * being unable to parse our query.  That's essentially a programmer
         * error in that we'd never expect this to happen in a functioning
         * system.  It's not easy to identify these errors, and there
         * wouldn't be much we could do to handle them anyway, so we treat
         * all errors the same way: log (which fires the alarm) and wait for
         * a retry.
         */
        this.log.error(err, 'Picker.handleStorageResults: unexpected error ' +
            '(will retry)');
        return;
    }

    var dcObj = [];
    var opDcObj = [];

    if (this.testSharkMap !== null) {
        storageZoneResults = this.testSharkMap;
    }

    function sortByOpType(maxUtilization, v) {

        opDcObj.push(v);

        /*
         * Moray is queried for the sharks whose utilization is less than or
         * equal to the maximum utilization percentage at which operator writes
         * are still accepted. Find the set of sharks whose utilization is less
         * than or equal to the utilization threshold for all requests.
         */
        if (v.percentUsed <= maxUtilization) {
            dcObj.push(v);
        }
    }

    storageZoneResults.forEach(sortByOpType.bind(this, this.utilization));

    /*
     * If flushPending is true then we've been notified that our current cache
     * is stale and shouldn't be handed out anymore.  In that case we finish
     * building the cache now so that we're ensured the next /poll request we
     * receive will hand out the new data.
     *
     * Otherwise, we defer to the next tick so we're not tying up the event
     * loop to sort a lot if the list is large.
     */
    if (this.flushPending) {
        sortAndStoreDcs.call(this, dcObj, opDcObj);
        this.flushPending = false;
    } else {
        setImmediate(sortAndStoreDcs.bind(this, dcObj, opDcObj));
    }
}


/**
 * Function to manage the process of periodically querying Moray for available
 * storage zones under the maximum utilization threshold. This function
 * requires that "this" be bound to an instance of Picker. This period is
 * determined by the value of storageInterval established when the Picker
 * instance is created.
 */
function pollStorage() {
    assert.object(this.client, 'no client connected');
    assert.ok(!this.standalone, 'polling not available in standalone mode');

    var opts = {
        lag: this.lag,
        moray: this.client,
        utilization: this.operatorUtilization
    };

    this.log.trace('Picker.pollStorage: entered');
    clearTimeout(this._storageTimer);
    fetchMoray(opts, handleStorageResults.bind(this));
}

// --- API

/**
 * Creates an instance of picker, and an underlying moray client.
 *
 * You can pass in all the usual moray-client options, and additionally pass in
 * a `storageInterval` field, which indicates how often to go poll Moray
 * for minnow updates.  The default is 30s.  Additionally, you can pass in a
 * `lag` field, which indicates how much "staleness" to allow in Moray records.
 *  The default for `lag` is 60s.
 */
function Picker(opts) {
    assert.object(opts, 'options');
    assert.number(opts.defaultMaxStreamingSizeMB,
        'options.defaultMaxStreamingSizeMB');
    assert.object(opts.log, 'options.log');
    assert.number(opts.maxUtilizationPct, 'options.maxUtilizationPct');
    assert.optionalObject(opts.moray, 'options.moray');
    assert.optionalBool(opts.multiDC, 'options.multiDC');
    assert.optionalNumber(opts.storageInterval, 'options.storageInterval');
    assert.optionalNumber(opts.lag, 'options.lag');
    assert.optionalBool(opts.standalone, 'options.standalone');

    EventEmitter.call(this);

    /*
     * The dcSharkMap is an object that maps datacenter names to an array of
     * sharks sorted by available storage capacity that are all at or below the
     * storage utilization threshold for normal manta requests.
     */
    this.dcSharkMap = null;
    /*
     * The operatorDcSharkMap is an object that maps datacenter names to an
     * array of sharks sorted by available storage capacity that are all at or
     * below the storage utilization threshold for operator manta requests.
     */
    this.operatorDcSharkMap = null;
    this.dcIndex = -1;
    this.storageInterval = parseInt(opts.storageInterval || 30000, 10);
    this.lag = parseInt(opts.lag || (60 * 60 * 1000), 10);
    this.log = opts.log.child({component: 'picker'}, true);
    this.multiDC = opts.multiDC === undefined ? true : opts.multiDC;
    this.url = opts.url;
    this.defMaxSizeMB = opts.defaultMaxStreamingSizeMB;
    this.utilization = opts.maxUtilizationPct;
    this.operatorUtilization = opts.maxOperatorUtilizationPct;

    this.client = null;

    // XXX - these values should come from config-agent
    this.defPageSz = 100;
    this.maxPageSz = 500;

    this.flushPending = false;

    this.testSharkMap = null;
    if (opts.testMorayData !== undefined) {
        this.log.info('Using test shark data: ' + opts.testMorayData);
        var testMapJSON = fs.readFileSync(opts.testMorayData, 'utf8');
        this.testSharkMap = JSON.parse(testMapJSON);
    }

    /*
     * `Standalone` mode is used only when an instance of the Picker is needed
     * without having to connect to a Moray first (e.g., for testing).
     */
    if (!opts.standalone) {
        assert.object(opts.moray, 'options.moray');

        var morayOptions = jsprim.deepCopy(opts.moray);
        morayOptions.log = opts.log;

        this.client = moray.createClient(morayOptions);
        this.client.once('connect', pollStorage.bind(this));
        this.once('topology', this.emit.bind(this, 'connect'));
    }
}
util.inherits(Picker, EventEmitter);


Picker.prototype.close = function close() {
    clearTimeout(this._storageTimer);
    if (this.client)
        this.client.close();
};


Picker.prototype.toString = function toString() {
    var str = '[object Picker <';
    str += 'storageInterval=' + this.storageInterval + ', ';
    str += 'lag=' + this.lag + ', ';
    if (this.client) {
        // i.e. NOT initialised in `standalone` mode
        str += 'moray=' + this.client.toString();
    }
    str += '>]';

    return (str);
};

Picker.prototype.flush = function flush() {
    this.flushPending = true;
    pollStorage.call(this);
};

// --- Exports

module.exports = {
    createClient: function createClient(options) {
        return (new Picker(options));
    },

    sortAndStoreDcs: sortAndStoreDcs

};
