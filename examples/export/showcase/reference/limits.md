---
title: Rate limits
lang: en
---

# Rate limits (#rate-limits)

Limits protect the stations, which report on fixed schedules, from being asked
the same question thousands of times a minute. They are generous for any client
that respects the cache.

## Windows (#windows)

Every plan shares one rule: a key may make 60 requests per rolling minute to
`/v1/weather/current` and 600 per rolling hour across all endpoints. Both
counters are reported on every response.

| Header           | Meaning                                     |
| ---------------- | ------------------------------------------- |
| `X-Limit-Minute` | Requests left in the current minute window. |
| `X-Limit-Hour`   | Requests left in the current hour window.   |
| `Retry-After`    | Seconds to wait, present only on a `429`.   |

### Backoff (#backoff)

On a `429` or a `503`, wait for `Retry-After` when present, otherwise double the
delay from one second up to thirty, and stop after five attempts.

## Plans compared (#plans)

The table has seven columns, so the paginated outputs put it on a landscape page
of its own.

| Plan       | Stations | Minute window | Hour window | Forecast hours | History | Support       |
| ---------- | -------- | ------------- | ----------- | -------------- | ------- | ------------- |
| Community  | 3        | 60            | 600         | 24             | 7 days  | Forum         |
| Team       | 25       | 120           | 6,000       | 48             | 90 days | Email, 2 days |
| Business   | 250      | 600           | 60,000      | 48             | 1 year  | Email, 1 day  |
| Enterprise | Custom   | Custom        | Custom      | 48             | Custom  | Named contact |

```cudoc-pagebreak

```

## Appendix: measuring your own usage (#measuring)

Log the two limit headers with every response and chart the minimum per minute.
A flat line near zero means a client is polling faster than the sixty-second
cache refreshes; slow it down rather than raising the plan.

> [!CAUTION] Retired keys keep counting
> Requests made with a retired key are rejected but still counted against the
> project for one hour, so rotate keys during a quiet period.
