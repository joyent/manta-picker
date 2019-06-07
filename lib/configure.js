/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */


'use strict';

var assert = require('assert-plus');
var fs = require('fs');


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

module.exports = {
    loadConfig: loadConfig
};
