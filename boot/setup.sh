#!/bin/bash
# -*- mode: shell-script; fill-column: 80; -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright 2020 Joyent, Inc.
#

set -o xtrace

SOURCE="${BASH_SOURCE[0]}"
if [[ -h $SOURCE ]]; then
    SOURCE="$(readlink "$SOURCE")"
fi
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
PROFILE=/root/.bashrc
SVC_ROOT=/opt/smartdc/storinfo
NODE_BIN=$SVC_ROOT/build/node/bin/node

source ${DIR}/scripts/util.sh
source ${DIR}/scripts/services.sh

export PATH=$SVC_ROOT/build/node/bin:$SVC_ROOT/node_modules/.bin:/opt/local/bin:/usr/sbin:/usr/bin:$PATH

function manta_setup_storinfo {
    #To preserve whitespace in echo commands...
    IFS='%'

    local storinfo_xml_in=$SVC_ROOT/smf/manifests/storinfo.xml.in
    local storinfo_xml_out=$SVC_ROOT/smf/manifests/storinfo.xml
    local storinfo_instance="storinfo"
    sed -e "s#@@NODE@@#${NODE_BIN}#g" \
        -e "s#@@PREFIX@@#${SVC_ROOT}#g" \
        $storinfo_xml_in  > $storinfo_xml_out || \
        fatal "could not process $storinfo_xml_in to $storinfo_xml_out"

    svccfg import $storinfo_xml_out || \
        fatal "unable to import $storinfo_instance: $storinfo_xml_out"
    svcadm enable "$storinfo_instance" || fatal "unable to start $storinfo_instance"

    unset IFS
}


# Mainline

echo "Running common setup scripts"
manta_common_presetup

echo "Adding local manifest directories"
manta_add_manifest_dir "/opt/smartdc/storinfo"

manta_common_setup "storinfo"

manta_ensure_zk

echo "Setting up storinfo"
manta_setup_storinfo

manta_common_setup_end

exit 0

