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

## Code title (#code-title)

```js title="retry.js" {2}
const attempts = 3
const delay = 250
```

## Tabs (#tabs)

```sh tab="npm"
npm install @cudoment/cudoc
```

```sh tab="pnpm"
pnpm add @cudoment/cudoc
```

## Merged cells (#cell-spans)

| Plan  | Period        | Price |
| ----- | ------------- | ----- |
| Basic | Monthly       | 10    |
| ^^    | Yearly        | 100   |
| Team  | Contact sales | >>    |

## Table note (#table-note)

| Field | Required |
| ----- | -------- |
| title | Yes\*    |

\* One of title and image is required.

## Shared values (#shared-values)

Install SDK (=sdk.version) and read [the request limits][limits] first.

```sh
npm install sdk@(=sdk.version)
```

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

## Outline (#outline)

```cudoc-embed
sources: [reference.md]
render:
  type: tree
  headings: 2
```
