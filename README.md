# manta-storinfo

The storinfo service is a Manta V2 service that provides an interface for retrieving a cached view of the contents of the `manta_storage` bucket via the /poll REST endpoint.  The Rebalancer is the only current consumer of storinfo.  Future versions of buckets-api will be modified to consume the storinfo service.

A draft RFD describing the motivation, requirements and approach for manta-storinfo is [here](https://github.com/joyent/rfd/tree/master/rfd/0170).  The Storinfo API is documented [here](https://github.com/joyent/manta-storinfo/blob/master/docs/index.md)


## Manually Deployment Procedure

Currently, the storinfo service is not included in a default Manta V2 deployment.

Images built from the master branch of manta-storinfo are available in the ```dev``` channel as ```mantav2-storinfo```  To deploy the latest storinfo bits in your manta test environment, run the following from the GZ of the headnode:

**Install the latest storinfo service image**

```
# storinfo_image=$(updates-imgadm -C <channel> list name=mantav2-storinfo --latest -H -o uuid)
# sdc-imgadm import -S https://updates.joyent.com $storinfo_image
```

Set `channel` to `dev` to install the most recent image built from master.  Set `channel` to `experimental` to pick up images built from a development branch.

Export the current manta topology to JSON**

```
# manta-adm show -j -s > manta.json
```

**Add the following entry to manta.json**

```
"storinfo": { "$storinfo_image": 1 }
```

**Update the manta deployment**

```
# manta-adm update --skip-verify-channel manta.json
```

## Development

The resulting image will be posted to updates.joyent.com. The image will be available on the `experimental` channel when building a development branch, or the `dev` channel when building the `master` branch.

To build storinfo locally, follow the [standard build instructions for Manta/Triton components](https://github.com/joyent/triton/blob/master/docs/developer-guide/building.md). If you already have a development zone available, run:

`make buildimage`

On success, a new storinfo image will be created under ```bits/storinfo```  Copy these files to the headnode in your Manta test environment.

**Install the storinfo image**

```
# sdc-imgadm import -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
# imgadm install -f <NEW IMG>.zfs.gz -m <NEW IMG>.imgmanifest
```

Then deploy/update the storinfo service via ```manta-adm update```

## License

"manta-storinfo" is licensed under the
[Mozilla Public License version 2.0](http://mozilla.org/MPL/2.0/).
See the file LICENSE.
