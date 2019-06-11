#!/bin/bash
# -*- mode: shell-script; fill-column: 80; -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2017, Joyent, Inc.
#

set -o xtrace

SOURCE="${BASH_SOURCE[0]}"
if [[ -h $SOURCE ]]; then
    SOURCE="$(readlink "$SOURCE")"
fi
DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
PROFILE=/root/.bashrc
SVC_ROOT=/opt/smartdc/picker
NODE_BIN=$SVC_ROOT/build/node/bin/node

source ${DIR}/scripts/util.sh
source ${DIR}/scripts/services.sh


export PATH=$SVC_ROOT/build/node/bin:$SVC_ROOT/node_modules/.bin:/opt/local/bin:/usr/sbin:/usr/bin:$PATH


function wait_for_resolv_conf {
    local attempt=0
    local isok=0
    local num_ns

    while [[ $attempt -lt 30 ]]
    do
        num_ns=$(grep nameserver /etc/resolv.conf | wc -l)
        if [ $num_ns -gt 1 ]
        then
                    isok=1
                    break
        fi
            let attempt=attempt+1
            sleep 1
    done
    [[ $isok -eq 1 ]] || fatal "manatee is not up"
}


function manta_setup_picker {
    #To preserve whitespace in echo commands...
    IFS='%'

    local picker_xml_in=$SVC_ROOT/smf/manifests/picker.xml.in
    local picker_xml_out=$SVC_ROOT/smf/manifests/picker.xml
    local picker_instance="picker"
    sed -e "s#@@NODE@@#${NODE_BIN}#g" \
        -e "s#@@PREFIX@@#${SVC_ROOT}#g" \
        $picker_xml_in  > $picker_xml_out || \
        fatal "could not process $picker_xml_in to $picker_xml_out"

    svccfg import $picker_xml_out || \
        fatal "unable to import $picker_instance: $picker_xml_out"
    svcadm enable "$picker_instance" || fatal "unable to start $picker_instance"

    unset IFS
}




# Mainline

echo "Running common setup scripts"
manta_common_presetup

echo "Adding local manifest directories"
manta_add_manifest_dir "/opt/smartdc/picker"

manta_common_setup "picker"

manta_ensure_zk

echo "Setting up picker"

# MANTA-1827
# Sometimes muskies come up before DNS resolvers are in /etc/resolv.conf
# TODO: [RUI] this shouldn't happen.
wait_for_resolv_conf
manta_setup_picker

manta_common_setup_end

exit 0

