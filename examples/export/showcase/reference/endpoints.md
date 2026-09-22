---
title: Endpoint reference
lang: en
---

# Endpoint reference (#reference)

Each section describes one endpoint. The first table of a section is its basic
information, which the overview page reads into a summary table; the tables that
follow describe parameters and the response. Error responses are listed
separately under [Error codes](errors.md#errors).

## Current conditions (#weather-current)

Returns the latest observation from one station.

| Method | Path                  | Auth   |
| ------ | --------------------- | ------ |
| GET    | `/v1/weather/current` | Bearer |

| Parameter | Type   | Required | Description                                                  |
| --------- | ------ | -------- | ------------------------------------------------------------ |
| `station` | string | yes      | The station code, such as `OSL-01`. One station per request. |
| `units`   | string | no       | `metric` (default) or `imperial`.                            |

The response is one observation object. Readings older than fifteen minutes
carry `stale: true`.

## Hourly forecast (#forecast-hourly)

Returns up to 48 hourly forecast points for one station.

| Method | Path                  | Auth   |
| ------ | --------------------- | ------ |
| GET    | `/v1/forecast/hourly` | Bearer |

| Parameter | Type    | Required | Description                                                                         |
| --------- | ------- | -------- | ----------------------------------------------------------------------------------- |
| `station` | string  | yes      | The station code.                                                                   |
| `hours`   | integer | no       | 1 to 48, default 24. Values above 48 are clamped, not rejected.                     |
| `fields`  | list    | no       | - `temperature`<br />- `wind`<br />- `precipitation`<br />-- Probability and amount |

## Station directory (#stations)

Lists the stations a key may read, with their location and status.

| Method | Path           | Auth   |
| ------ | -------------- | ------ |
| GET    | `/v1/stations` | Bearer |

| Parameter | Type   | Required | Description                            |
| --------- | ------ | -------- | -------------------------------------- |
| `region`  | string | no       | An ISO 3166-2 code to narrow the list. |
| `status`  | string | no       | `active`, `maintenance` or `retired`.  |
