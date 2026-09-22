---
title: Release notes
lang: en
---

# Release notes (#release-notes)

Changes to the API, newest first. Dates are the day a change reached every
region. Additive changes are listed for information; changes that alter an
existing shape are announced under [Upcoming changes](#upcoming) at least
ninety days before they take effect.

## Upcoming changes (#upcoming)

| Change                                                                                                         | Announced  | Effective  | Affects                     |
| -------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | --------------------------- |
| The `windMs` and `temperatureC` aliases leave current conditions; read `windSpeed`, `temperature` and `units`. | 2026-09-15 | 2026-12-15 | Current conditions, history |
| Weather alerts leave beta; `headline` becomes an object with one entry per language.                           | 2026-09-15 | 2026-10-15 | Weather alerts              |
| Cursor expiry shortens from one hour to ten minutes.                                                           | 2026-07-02 | 2026-10-01 | Station directory, history  |

## 2026-09-15 (#r-2026-09-15) (@Latest)

- `fields` on the hourly forecast accepts `precipitation`, returning
  probability and expected amount, and `cloudCover`.
  → [Hourly forecast](reference/endpoints.md#forecast-hourly)
- `X-Limit-Hour` is now sent on every response, not only when the minute
  window is low.
- The hour window is charged in cost units; existing budgets were converted so
  that no client pays more than before.
  → [Request costs](reference/limits.md#costs)
- The weather alerts endpoint opens in beta for the Business and Enterprise
  plans. → [Weather alerts](reference/endpoints.md#alerts)
- The synthetic station `TEST-01` accepts `simulate` to reproduce any error
  code. → [Error codes](reference/errors.md#errors)

## 2026-07-02 (#r-2026-07-02)

- Readings older than fifteen minutes carry `stale: true` instead of being
  withheld.
- The `station_retired` error replaces a generic `404` for stations that
  stopped reporting permanently.
- Observation history accepts `step=1d`, returning daily means with the
  minimum and maximum temperature.
- Station detail returns `timezone`, `sensors` and `since`.

## 2026-05-20 (#r-2026-05-20)

- Daily forecast endpoint added, up to seven days ahead.
  → [Daily forecast](reference/endpoints.md#forecast-daily)
- Every cached response carries an `ETag`, and a `304` answer counts against
  no window. → [Caching](reference/limits.md#caching)
- The station directory paginates with `limit` up to 200 rows and a
  `page.next` cursor.

## 2026-04-10 (#r-2026-04-10)

- First public release of `/v1`: current conditions, hourly forecast,
  observation history and the station directory.
- Community, Team and Business plans; Enterprise by arrangement.
- Test keys and the synthetic station `TEST-01`.

> [!SUCCESS] Deprecation policy
> A field or endpoint is announced here at least ninety days before it changes
> shape, and the previous behaviour stays available for that period. Beta
> endpoints carry a thirty-day notice instead and say so on their reference
> page.
