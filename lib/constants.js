/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

'use strict';

module.exports = {
    // Note: Until webapi and buckets-api are updated to use the picker service,
    // these constants must be kept in sync with the matching values in
    // manta-muskie.git and manta-buckets-api.git.
    DEF_MAX_STREAMING_SIZE_MB: 51200,
    DEF_MAX_PERCENT_UTIL: 90,
    DEF_MAX_OPERATOR_PERCENT_UTIL: 92
};
