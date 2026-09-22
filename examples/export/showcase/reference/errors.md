---
title: Error codes
lang: en
---

# Error codes (#errors)

Every error response carries a `code` from this table and a human-readable
`message` that may change between releases; branch on the code, never on the
message.

| Code               | HTTP | Meaning                                       | Retry               |
| ------------------ | ---- | --------------------------------------------- | ------------------- |
| `station_unknown`  | 404  | No station has that code.                     | No                  |
| `station_retired`  | 410  | The station stopped reporting permanently.    | No                  |
| `key_scope`        | 403  | The key's project does not cover the station. | No                  |
| `rate_limited`     | 429  | The window is exhausted.                      | After `Retry-After` |
| `upstream_delayed` | 503  | The station has not reported in time.         | With backoff        |

> [!NOTE] Retrying
> The backoff rule for `rate_limited` and `upstream_delayed` is in
> [Rate limits](limits.md#backoff).
