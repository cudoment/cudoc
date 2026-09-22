---
title: Northlight Weather API
lang: en
---

# Northlight Weather API (@v1)

Northlight serves current conditions, short-range forecasts and observation
history for a network of weather stations along the Nordic coast. This handbook
is one set of Markdown documents that cudoc publishes three ways: as the site
you may be reading, as a bound PDF with a cover and a contents page, and as a
Word file with real styles. Every figure below is drawn from the reference
pages, so a correction there reaches this page too.

> [!NOTE] How this handbook is built
> The site, the PDF and the Word file come from one `cudoc-export build` run
> and one set of design tokens. The configuration is a single file,
> `showcase.config.mjs`, beside the documents, and the summary table further
> down is assembled from the endpoint reference at build time.

## What the API provides (#provides)

Every station reports temperature, wind, humidity, pressure and precipitation
on a fixed schedule, and the forecast model runs once an hour for every
station. The API exposes that data as four data sets, each behind one or two
endpoints.

| Data set            | Cadence          | Retention                 | Endpoints                                                                                                          |
| ------------------- | ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Current conditions  | Every 10 minutes | Latest reading only       | [Current conditions](reference/endpoints.md#weather-current)                                                       |
| Forecasts           | Hourly model run | 48 hours and 7 days ahead | [Hourly forecast](reference/endpoints.md#forecast-hourly), [Daily forecast](reference/endpoints.md#forecast-daily) |
| Observation history | Every 10 minutes | Depends on the plan       | [Observation history](reference/endpoints.md#weather-history)                                                      |
| Station metadata    | On change        | Indefinite                | [Station directory](reference/endpoints.md#stations), [Station detail](reference/endpoints.md#station-detail)      |

Forecast horizons and history retention depend on the plan; see
[Plans compared](reference/limits.md#plans).

## Endpoints at a glance (#endpoints)

Each row is one section of the endpoint reference. The method and the path are
read from the table at the top of that section, and the description is its
first paragraph, so this table cannot drift from the reference.

```cudoc-embed
sources: [reference/endpoints.md]
select:
  depth: 2
render:
  type: table
  columns:
    - { header: Endpoint, value: title, link: section, minWidth: 10rem }
    - { header: Method, value: { row: 1, column: 0 }, minWidth: 5rem }
    - { header: Path, value: { row: 1, column: 1 }, minWidth: 13rem }
    - { header: What it returns, value: summary }
```

## Concepts (#concepts)

### Stations and station codes (#stations)

A station is one physical site with a fixed set of sensors. Every station has a
code of the form `SITE-NN`: a three-letter site code and a two-digit sequence
number, so a site with several masts has `BGO-01`, `BGO-02` and so on. Codes
never change and are never reused; a station that stops reporting for good is
marked `retired` and keeps its code.

| Code     | Site      | Elevation | Status        |
| -------- | --------- | --------- | ------------- |
| `OSL-01` | Oslo      | 94 m      | `active`      |
| `BGO-01` | Bergen    | 12 m      | `active`      |
| `BGO-02` | Bergen    | 320 m     | `maintenance` |
| `TRD-01` | Trondheim | 8 m       | `active`      |
| `TOS-01` | Tromsø    | 100 m     | `active`      |
| `SVG-01` | Stavanger | 4 m       | `retired`     |

The list above is illustrative; the
[station directory](reference/endpoints.md#stations) is the source of truth for
the stations a key may read.

### Observations and forecasts (#observations)

An observation is a reading a station actually made, stamped with the instant
it was made. A forecast point is the model's expectation for a future instant,
stamped with that instant and with the model run that produced it. The two are
never mixed in one response: the current-conditions and history endpoints
return observations, and the forecast endpoints return forecast points.

### Units (#units)

Every numeric field is returned in metric units unless the request asks for
`units=imperial`. Field names do not change with the unit system; only the
values and the `units` object in the response do, so a client can always read
the unit next to the value instead of assuming it.

| Field           | Metric | Imperial |
| --------------- | ------ | -------- |
| `temperature`   | °C     | °F       |
| `windSpeed`     | m/s    | mph      |
| `pressure`      | hPa    | inHg     |
| `precipitation` | mm     | in       |
| `visibility`    | km     | mi       |

### Timestamps (#timestamps)

Every instant is ISO 8601 in UTC with a `Z` suffix: `observedAt` on an
observation, `validAt` and `issuedAt` on a forecast, `lastObservedAt` on a
station. Converting to local time is the client's job; a station's IANA time
zone is in its [detail record](reference/endpoints.md#station-detail) so the
conversion can be exact.

### Versioning (#versioning)

The path prefix `/v1` names the version. Additive changes, such as a new field,
a new optional parameter or a new endpoint, ship within `/v1` without notice,
so a client must ignore fields it does not know. Any change to an existing
shape is announced in the [release notes](release-notes.md#upcoming) at least
ninety days before it takes effect, and the previous behaviour stays available
for that period.

## Conventions (#conventions)

The handbook uses a small set of marks, and each means the same thing in the
site, the PDF and the Word file.

| Mark                                              | Meaning                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A `New`, `Beta` or `Latest` badge after a heading | The section was added in the latest release, is in beta and may change on thirty days' notice, or describes the newest release. |
| A **Note** or **Tip** box                         | Background or a shortcut; skipping it costs nothing.                                                                            |
| An **Important**, **Warning** or **Caution** box  | Something that costs a key, a quota or data if ignored.                                                                         |
| A **Ready** box                                   | A checkpoint listing what a client needs before it moves on.                                                                    |
| `code` in running text                            | A literal parameter, field, header or value.                                                                                    |

Request and response samples are given as `curl`, Node.js and Python, and
every JSON sample is a real response for the station `OSL-01`.

## Where to start (#start)

1. Read [Getting started](getting-started.md#getting-started) for a key, a
   first request and a polling schedule.
2. Keep [Rate limits](reference/limits.md#windows) open while you design that
   schedule; the request costs table tells you what each call weighs.
3. Handle every code in [Error codes](reference/errors.md#errors) before you
   switch to a live key.
4. Check the [release notes](release-notes.md#release-notes) before upgrading
   a client.

> [!TIP] Reading this on paper?
> External links print their address after the text, and links between
> documents jump inside the bound file. The contents page at the front lists
> the page each document starts on.
