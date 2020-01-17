# manta-picker

The manta-picker is a Manta V2 service that provides an interface for retrieving a cached view of the contents of the `manta_storage` bucket via the /poll REST endpoint.  The Rebalancer is the only current consumer of manta-picker.  Future versions of buckets-api will be modified to consume the manta-picker service.

A draft RFD describing the motivation, requirements and approach for manta-picker is [here](https://github.com/joyent/rfd/tree/master/rfd/0170).  The Picker API is documented [here](https://github.com/joyent/manta-picker/blob/master/docs/index.md)


## Manually Deployment Procedure

Currently, the manta-picker service is not included in a default Manta V2 deployment.

Images built from the master branch of manta-picker are available in the ```dev``` channel as ```mantav2-picker```  To deploy the latest picker bits in your manta test environment, run the following from the GZ of the headnode:

**Install the latest picker service image**

```
# picker_image=$(updates-imgadm -C <channel> list name=mantav2-picker --latest -H -o uuid)
# sdc-imgadm import -S https://updates.joyent.com $picker_image
```

Set `channel` to `dev` to install the most recent image built from master.  Set `channel` to `experimental` to pick up images built from a development branch.

Export the current manta topology to JSON**

```
# manta-adm show -j -s > manta.json
```

**Add the following entry to manta.json**

```
"picker": { "$picker_image": 1 }
```

**Update the manta deployment**

```
# manta-adm update --skip-verify-channel manta.json
```

## Development

The resulting image will be posted to updates.joyent.com. The image will be available on the `experimental` channel when building a development branch, or the `dev` channel when building the `master` branch.

To build picker locally, follow the [standard build instructions for Manta/Triton components](https://github.com/joyent/triton/blob/master/docs/developer-guide/building.md). If you already have a development zone available, run:

`make buildimage`

On success, a new picker image will be created under ```bits/picker```  Copy these files to the headnode in your Manta test environment.

**Install the picker image**

```
# sdc-imgadm import -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
# imgadm install -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
```

Then deploy/update the picker service via ```manta-adm update```

## License

"manta-picker" is licensed under the
[Mozilla Public License version 2.0](http://mozilla.org/MPL/2.0/).
See the file LICENSE.
