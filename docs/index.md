---
title: Manta Storinfo API
apisections: 
markdown2extras: tables, code-friendly
---
<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright 2020 Joyent, Inc.
-->

# Storinfo API




## GetSharks (GET /poll)

Returns a list of storage nodes found in the `manta_storage` bucket, sorted by the ```manta_storage_id``` field.  Because the list of makos
can be quite large, this endpoint enforces pagination to limit the response size.

```poll``` will implement a cursor-based pagination scheme using the mako's ```manta_storage_id``` as the cursor value.

#### Inputs
| Field        | Type    | Description                                      | Optional?
| ------------ | ------- | ------------------------------------------------ |----------|
| after_id     | String  | return results for mako with a storage id greater than "after_id" | Yes (default = "0") |
| only_id     | String  | return result for only the mako specified by the storage id "only_id" | Yes |
| limit        | Number  | max number of results to return | Yes (default/max = 500) |


The response to ```/poll``` will include the following metadata:

| Field | Type | Description |
| ----- | ---- | ----------- |
| last_id | String | The id of the last result returned |
| next_link | String | URL to retrieve the next result set (using limit value from previous request) |

A request where "after_id" is greater than all of the mako will result in an error (404).

A request where "only_id" does not match any mako will result in an error (404).

A request with an unsupported parameter or a bad parameter value will result in an error (400).

Requesting a limit that is greater than the number of available results will succeed, returning whatever number of results are available.

#### Example Usage

Get up to the first 100 results:

```
/poll?limit=100
```

Get up to the next 100 results:

```
/poll?limit=100&after_id=<last_id>
```

## FlushCache (POST /flush)

Forces the storinfo's cached view of the manta_storage bucket to be immediately invalidated and refreshed.  The only intended consumer of this API is the Rebalancer, which will call this API after marking a storage node as read-only, prior to evacuating the objects on it.

This interfaces takes no input parameters.
