# manta-picker

This repo contains an under-development, early prototype of a standalone service that implements functionality similar to the mpicker tool in manta-muskie.  A draft RFD describing the motivation, requirements and approach for manta-picker is [here](https://github.com/joyent/rfd/tree/master/rfd/0170)




## Manually Deployment Procedure

Normally the picker SAPI service would be created by ```manta-init``` and service instances would be created by ```manta-deploy``` or ```manta-adm```.  However, the [joyent/sdc-manta](https://github.com/joyent/sdc-manta) repo has not yet been modified to do this.  Follow the steps below to manually deploy picker:

**Build a picker image**

`make buildimage`

**Install picker image**

```
headnode# sdc-imgadm import -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
headnode# imgadm install -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
```

**Create the picker SAPI service**

```
headnode# sdc-sapi /services -X POST -d '
{
      "name": "picker",
      "application_uuid": "<MANTA APPLICATION UUID>",
      "params": {
        "networks": [
          "manta",
          "admin"
        ],
        "ram": 256,
        "image_uuid": "<PICKER IMAGE UUID>"
      },
      "metadata": {},
      "master": true
}'
```

**Create an instance of the picker service**

```
headnode# sdc-sapi /instances -X POST -d '
{
      "service_uuid": "<PICKER SERVICE UUID>",
      "params": {
        "brand": "joyent-minimal",
        "alias": "picker0",
        "hostname": "picker0"
      },
     "metadata": {
        "SERVICE_NAME": "picker.<DATACENTER>.<REGION>.joyent.us",
        "MUSKIE_DEFAULT_MAX_STREAMING_SIZE_MB": 5120,
        "MUSKIE_MAX_UTILIZATION_PCT": 90,
        "MUSKIE_MAX_OPERATOR_UTILIZATION_PCT": 92,
        "DATACENTER": "<DC NAME>",
        "SDC_NAMESERVERS": [
        {
          "host": "<TRITON BINDER IP>",
          "port": 2181,
          "num": 1,
          "last": true
        }],
       "SAPI_URL": "<SAPI_URL>",
       "user-script": "#!/usr/bin/bash\n#\n# This Source Code Form is subject to the terms of the Mozilla Public\n# License, v. 2.0. If a copy of the MPL was not distributed with this\n# file, You can obtain one at http://mozilla.org/MPL/2.0/.\n#\n\n#\n# Copyright (c) 2014, Joyent, Inc.\n#\n\nset -o xtrace\nset -o errexit\nset -o pipefail\n\n#\n# To use the same convention as SDC instances, the presence of the\n# /var/svc/.ran-user-script file indicates that the instance has already been\n# setup (i.e. the instance has booted previously).\n#\n# Upon first boot, run the setup.sh script if present.  On all boots including\n# the first one, run the configure.sh script if present.\n#\nSENTINEL=/var/svc/.ran-user-script\n\nDIR=/opt/smartdc/boot\n\n\nif [[ ! -e ${SENTINEL} ]]; then\n\tif [[ -f ${DIR}/setup.sh ]]; then\n\t\t${DIR}/setup.sh\n\tfi\n\n\ttouch ${SENTINEL}\nfi\n\nif [[ -f ${DIR}/configure.sh ]]; then\n\t${DIR}/configure.sh\nfi\n"
      }
}'
```

## Updating the Image

The following steps can be used to update the image for an existing picker SAPI service

**Delete the existing picker service instances**

```
headnode# sdc-sapi /instances/<PICKER_INSTANCE_UUID> -X DELETE

```

**Remove the old image**

```
headnode# oldimg=$(sdc-sapi /services?name=picker | json -H [0].params.image_uuid)
headnode# sdc-imgadm delete $oldimg
headnode# imgadm delete $oldimg
```

**Install new image**

```
headnode# sdc-imgadm import -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
headnode# imgadm install -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
```

**Update the picker SAPI service to use the new image**

```
headnode# svcuuid=$(sdc-sapi /services?name=picker | json -H [0].uuid)
headnode# sdc-sapi /services/$svcuuid -X PUT -d '
{
  "action": "update",
  "params": {
      "image_uuid": "<NEW IMG UUID>"
  }
}'
```

## To DO
A rough list to-do list of development tasks is being maintained in the gist [here](https://gist.github.com/rejohnst/b25bb83c607bc9ed2cf474adfa9f2544)

## License

"manta-picker" is licensed under the
[Mozilla Public License version 2.0](http://mozilla.org/MPL/2.0/).
See the file LICENSE.
