---
title: Portable documents
---

# Portable documents

This Markdown document needs no component registration. Literal braces such as {value} stay text.

## Callouts (#callouts)

> [!WARNING] Check the request limit
>
> Retry after the current window expires.
>
> - Keep the original request.
> - Wait before retrying.

## Table lists (#lists)

| Field | Description                                         |
| ----- | --------------------------------------------------- |
| token | - Required<br>-- Keep private<br>- Rotate regularly |

## Collected sections (#summary)

```cudoc-embed
sources: [reference.md]
select:
  depth: 2
render:
  type: table
```

## Rewritten source (#rewritten)

```cudoc-embed
sources: [reference.md#limits]
replace:
  - find: "**original**"
    replace: "_adapted_"
```
