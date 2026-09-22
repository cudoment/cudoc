---
title: Release notes
lang: en
---

# Release notes (#release-notes)

Changes to the API, newest first. Dates are the day a change reached every
region.

## 2026-09-15 (#r-2026-09-15) (@Latest)

- `fields` on the hourly forecast accepts `precipitation`, returning
  probability and expected amount. → [Hourly forecast](reference/endpoints.md#forecast-hourly)
- `X-Limit-Hour` is now sent on every response, not only when the minute
  window is low.

## 2026-07-02 (#r-2026-07-02)

- Readings older than fifteen minutes carry `stale: true` instead of being
  withheld.
- The `station_retired` error replaces a generic `404` for stations that
  stopped reporting permanently.

## 2026-04-10 (#r-2026-04-10)

- First public release of `/v1`.

> [!SUCCESS] Deprecation policy
> A field or endpoint is announced here at least ninety days before it changes
> shape, and the previous behaviour stays available for that period.
