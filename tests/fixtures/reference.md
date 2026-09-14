---
title: Deep reference
lang: en
---

# Deep reference

Sections here exist to be selected, summarized and rewritten by the showcase document.

## Limits (#limits)

This **original** paragraph is reused verbatim by another document.

| Field  | Description                                            |
| ------ | ------------------------------------------------------ |
| window | - Rolling<br>-- Sixty seconds<br>- Reset on first call |
| burst  | 1. Allowed once<br>1.. Then throttled                  |

### Retry (#retry)

Retry after the window expires. See [limits](#limits) and the [glossary](#glossary).

### Backoff (#backoff)

Double the delay on each attempt, up to `30s`.

## Authentication (#authentication)

Send an access token on every call.

### Scopes (#scopes)

| Scope       | Grants                                  |
| ----------- | --------------------------------------- |
| `read:doc`  | - Read documents<br>-- Including drafts |
| `write:doc` | Create and update documents             |

## Glossary (#glossary)

A term list with no child sections.
