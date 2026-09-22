---
title: Endpoint reference
lang: en
---

# Endpoint reference (#reference)

Each second-level section describes one endpoint. The first table of a section
is its basic information, which the overview page reads into a summary table;
the tables that follow describe parameters and the response. Error responses
share one shape and are listed separately under [Error codes](errors.md#errors).

All endpoints are served from `https://api.northlight.example` and answer `GET`
only. Requests carry these headers:

| Header          | Required | Description                                                                          |
| --------------- | -------- | ------------------------------------------------------------------------------------ |
| `Authorization` | yes      | `Bearer` followed by a live or test key.                                             |
| `Accept`        | no       | `application/json`, the only representation; any other value is answered with `406`. |
| `If-None-Match` | no       | The `ETag` of an earlier response; a `304` means it is still current.                |
| `X-Request-Id`  | no       | Your own correlation id, echoed back; one is generated when absent.                  |

List endpoints paginate with a cursor: a response that has more rows carries
`page.next`, and passing it as `cursor` returns the next page. Cursors are
opaque and expire after ten minutes.

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
carry `stale: true`; a station that has not reported for six hours is answered
with `503 upstream_delayed` instead.

| Field           | Type    | Description                                                                      |
| --------------- | ------- | -------------------------------------------------------------------------------- |
| `station`       | string  | The station code as requested.                                                   |
| `observedAt`    | string  | The reading's instant, ISO 8601 in UTC.                                          |
| `temperature`   | number  | Air temperature two metres above ground.                                         |
| `windSpeed`     | number  | Ten-minute mean wind speed.                                                      |
| `windGust`      | number  | Highest three-second gust in the same ten minutes; absent without a gust sensor. |
| `windDirection` | integer | Degrees clockwise from north.                                                    |
| `humidity`      | integer | Relative humidity in percent.                                                    |
| `pressure`      | number  | Pressure reduced to sea level.                                                   |
| `precipitation` | number  | Precipitation in the last ten minutes.                                           |
| `conditions`    | string  | A summary word; see [Read the response](../getting-started.md#response).         |
| `stale`         | boolean | `true` when `observedAt` is more than fifteen minutes old.                       |
| `units`         | object  | The unit of every numeric field.                                                 |

Responses are cached at the edge for sixty seconds and carry an `ETag`.

## Hourly forecast (#forecast-hourly)

Returns up to 48 hourly forecast points for one station.

| Method | Path                  | Auth   |
| ------ | --------------------- | ------ |
| GET    | `/v1/forecast/hourly` | Bearer |

| Parameter | Type    | Required | Description                                                                                             |
| --------- | ------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `station` | string  | yes      | The station code.                                                                                       |
| `hours`   | integer | no       | 1 to 48, default 24. Values above 48 are clamped, not rejected.                                         |
| `units`   | string  | no       | `metric` (default) or `imperial`.                                                                       |
| `fields`  | list    | no       | - `temperature`<br />- `wind`<br />- `precipitation`<br />-- Probability and amount<br />- `cloudCover` |

`fields` narrows the response to the named groups; without it every group is
returned. The response carries the model run that produced the points and the
points themselves:

```json
{
  "station": "OSL-01",
  "issuedAt": "2026-09-22T05:05:00Z",
  "points": [
    {
      "validAt": "2026-09-22T07:00:00Z",
      "temperature": 12.1,
      "windSpeed": 4.0,
      "windDirection": 250,
      "precipitationProbability": 0.15,
      "precipitationAmount": 0.0,
      "cloudCover": 0.9
    }
  ],
  "units": {
    "temperature": "C",
    "windSpeed": "m/s",
    "precipitationAmount": "mm"
  }
}
```

Beyond 24 hours the Community plan receives no points; the other plans receive
up to 48. See [Plans compared](limits.md#plans).

## Daily forecast (#forecast-daily)

Returns one forecast summary per calendar day, up to seven days ahead.

| Method | Path                 | Auth   |
| ------ | -------------------- | ------ |
| GET    | `/v1/forecast/daily` | Bearer |

| Parameter | Type    | Required | Description                                                           |
| --------- | ------- | -------- | --------------------------------------------------------------------- |
| `station` | string  | yes      | The station code.                                                     |
| `days`    | integer | no       | 1 to 7, default 5. Days are calendar days in the station's time zone. |
| `units`   | string  | no       | `metric` (default) or `imperial`.                                     |

Each day carries `temperatureMin`, `temperatureMax`, `precipitationTotal`,
`precipitationProbability`, the dominant `conditions` word, and `sunrise` and
`sunset` in UTC. The first day is today in the station's local time, which may
already be partly in the past; its minimum and maximum cover the whole day.

> [!NOTE] Daily summaries are derived
> A day's summary is computed from the hourly points of the same model run, so
> the two forecast endpoints never disagree about the same run. They can differ
> when a new run has landed between two requests; compare `issuedAt`.

## Observation history (#weather-history)

Returns past observations from one station in a time range, oldest first.

| Method | Path                  | Auth   |
| ------ | --------------------- | ------ |
| GET    | `/v1/weather/history` | Bearer |

| Parameter | Type    | Required | Description                                                                                  |
| --------- | ------- | -------- | -------------------------------------------------------------------------------------------- |
| `station` | string  | yes      | The station code.                                                                            |
| `from`    | string  | yes      | Start of the range, ISO 8601, inclusive.                                                     |
| `to`      | string  | no       | End of the range, exclusive; defaults to now.                                                |
| `step`    | string  | no       | `10m` (default), `1h` or `1d`. Coarser steps return means, with min and max for temperature. |
| `limit`   | integer | no       | Rows per page, 1 to 1,000, default 500.                                                      |
| `cursor`  | string  | no       | `page.next` from the previous page.                                                          |

How far back `from` may reach depends on the plan's history retention; a range
that starts earlier is answered with `400 range_too_wide` rather than being
silently clipped. A range that spans more than 31 days at the `10m` step is
rejected the same way; use `1h` or `1d` for long ranges.

```json
{
  "station": "OSL-01",
  "step": "1h",
  "rows": [
    {
      "observedAt": "2026-09-21T00:00:00Z",
      "temperature": 9.8,
      "temperatureMin": 9.1,
      "temperatureMax": 10.4,
      "windSpeed": 2.1,
      "precipitation": 0.0
    }
  ],
  "page": { "next": "eyJvIjoiMjAyNi0wOS0yMVQwMTowMDowMFoifQ" },
  "units": { "temperature": "C", "windSpeed": "m/s", "precipitation": "mm" }
}
```

## Station directory (#stations)

Lists the stations a key may read, with their location and status.

| Method | Path           | Auth   |
| ------ | -------------- | ------ |
| GET    | `/v1/stations` | Bearer |

| Parameter | Type    | Required | Description                                             |
| --------- | ------- | -------- | ------------------------------------------------------- |
| `region`  | string  | no       | An ISO 3166-2 code to narrow the list, such as `NO-03`. |
| `status`  | string  | no       | `active`, `maintenance` or `retired`.                   |
| `limit`   | integer | no       | Rows per page, 1 to 200, default 50.                    |
| `cursor`  | string  | no       | `page.next` from the previous page.                     |

Each row carries the code, the site name, coordinates, elevation, status and
the instant of the last observation. Retired stations are included only when
`status=retired` is asked for, so a client that lists stations sees them
disappear rather than fail.

```json
{
  "stations": [
    {
      "code": "OSL-01",
      "site": "Oslo",
      "latitude": 59.9423,
      "longitude": 10.7203,
      "elevation": 94,
      "status": "active",
      "lastObservedAt": "2026-09-22T06:00:00Z"
    },
    {
      "code": "BGO-02",
      "site": "Bergen",
      "latitude": 60.3982,
      "longitude": 5.3241,
      "elevation": 320,
      "status": "maintenance",
      "lastObservedAt": "2026-09-19T14:10:00Z"
    }
  ],
  "page": { "next": null }
}
```

## Station detail (#station-detail)

Returns one station's metadata, including its sensors and time zone.

| Method | Path                  | Auth   |
| ------ | --------------------- | ------ |
| GET    | `/v1/stations/{code}` | Bearer |

| Parameter | Type   | Required | Description                    |
| --------- | ------ | -------- | ------------------------------ |
| `code`    | string | yes      | The station code, in the path. |

The detail adds to the directory row the station's IANA time zone, its sensor
list with the make and the installation date of each, the date it first
reported and, for a retired station, the date it stopped. Metadata changes
rarely; cache it for a day.

| Field       | Type   | Description                                                                              |
| ----------- | ------ | ---------------------------------------------------------------------------------------- |
| `timezone`  | string | IANA zone name, such as `Europe/Oslo`.                                                   |
| `sensors`   | list   | - `temperature`<br />- `wind`<br />- `humidity`<br />- `pressure`<br />- `precipitation` |
| `since`     | string | The date the station first reported.                                                     |
| `retiredAt` | string | Present only for a retired station.                                                      |

## Weather alerts (#alerts) (@Beta)

Lists active severe-weather alerts for a region, relayed from the national
service.

| Method | Path         | Auth   |
| ------ | ------------ | ------ |
| GET    | `/v1/alerts` | Bearer |

| Parameter  | Type   | Required | Description                                             |
| ---------- | ------ | -------- | ------------------------------------------------------- |
| `region`   | string | yes      | An ISO 3166-2 code.                                     |
| `severity` | string | no       | `yellow`, `orange` or `red`; lower levels are excluded. |

Each alert carries `event` (`wind`, `rain`, `snow`, `ice` or `flood`),
`severity`, `onset`, `expires` and a `headline` in the region's language. The
endpoint is in beta: its shape may change with thirty days' notice rather than
ninety, and it is available on the Business and Enterprise plans.

> [!CAUTION] Not a warning service
> Alerts are relayed with a delay of up to five minutes and may be withdrawn.
> Use them to annotate a forecast, not to trigger safety-critical actions.
