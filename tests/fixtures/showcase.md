---
title: Syntax showcase
lang: en
---

# Syntax showcase (@Stable)

Every configurable cudoc feature appears below in its portable form. Literal braces such as {value} stay text in `.md`, and `(@NotABadge)` inside code stays text too.

## Anchors and badges (#anchors)

### Nested heading (#nested) (@Beta)

A badge in a heading is displayed but excluded from the title and the generated ID.

This paragraph carries an inline (@New) badge. A [link with (@Marker) inside](#anchors) keeps the marker as text.

Jump to [limits](reference.md#limits), [the glossary](reference.md#glossary), [this document](#nested) and [an external page](https://example.com/docs?q=1#frag). Mail goes to [the docs team](mailto:docs@example.com).

## Callouts (#callouts)

> [!NOTE] Titled note
> A note body with **bold**, `code` and a [link](#callouts).

> [!TIP]
> A tip with no title.

> [!IMPORTANT] Multi-part
>
> First paragraph.
>
> - Ordered steps follow.
> - Second item.
>
> Closing paragraph.

> [!WARNING] Check the request limit
> Retry after the current window expires.

> [!CAUTION] Destructive
> This removes stored data.

> [!SUCCESS] Registered type
> `SUCCESS` is supplied through `calloutTypes`.

> **[WARNING] Not a callout**
> An emphasized quote stays an ordinary blockquote.

## Lists inside table cells (#cells)

| Field    | Detail                                                    |
| -------- | --------------------------------------------------------- |
| dash     | - First<br>-- Nested<br>- Second                          |
| asterisk | * Star first<br>** Star nested                            |
| ordered  | 1. One<br>1.. One and a half<br>1... Deeper<br>2. Two     |
| mixed    | - Text with `code`<br>-- And a [link](reference.md#retry) |
| literal  | -no space so this stays text                              |

##### Requirements (#requirements)

A column holding many items reads badly in one narrow cell, so a layout rule splits it and spans the header to keep the grid rectangular.

| Method | Prerequisites                                                                     |
| ------ | --------------------------------------------------------------------------------- |
| GET    | - Account<br>- Verified email<br>- Access token<br>- Registered scope<br>- Client |
| POST   | - Account<br>- Verified email                                                     |

## Ordinary Markdown (#markdown)

1. Ordered item
   1. Nested ordered
2. Second item
   - Mixed nesting

- Unordered item
  - Nested unordered

**Strong**, _emphasis_, ~~struck~~ and `inline code`.

```js
const value = { key: "literal braces stay literal" }
```

```
No language on this fence.
```

> A plain blockquote with no marker.

---

| Left | Center | Right |
| :--- | :----: | ----: |
| a    |   b    |     c |

## Variables (#variables)

Version (=sdk.version) loads from [the CDN](<https://(=sdk.host)/js/(=sdk.version)/sdk.js>), as `sdk-(=sdk.version).js`.

```html
<script src="https://(=sdk.host)/js/(=sdk.version)/sdk.js"></script>
```

## Shared link references (#link-references)

The [retry rules][retry-rules] and the [Retry-Rules][] come from one definition every page shares.

## Merged cells (#merged-cells)

| Code | Status | Message           |
| ---- | :----: | ----------------- |
| E400 |  400   | Missing parameter |
| ^^   |   ^^   | Invalid value     |
| Note |   >>   | >>                |

## Table notes (#table-notes)

| Field | Required |
| ----- | -------- |
| title | X\*      |
| image | O\*\*    |

\* One of `title` and `image` is required.

\*\* Up to 5 MB.

## Code titles (#code-titles)

```js title="retry.js" {2,4-5}
const attempts = 3
const delay = 250 // changed
export function backoff(attempt) {
  return delay * 2 ** attempt
}
```

## Tabs (#tabs)

```kotlin tab="Kotlin" group=sdk
val profile = TalkApi.profile()
```

```java tab="Java"
Profile profile = TalkApi.profile();
```

> [!TAB] Notes
>
> Both calls need the `profile` scope.

## Whole document embed (#whole)

```cudoc-embed
sources: [reference.md]
select:
  anchors: [glossary]
render: section
```

## Section with children (#with-children)

```cudoc-embed
sources: [reference.md#limits]
```

## Section without children (#without-children)

```cudoc-embed
sources: [reference.md]
select:
  anchors: [authentication]
  includeChildren: false
render: section
```

## Selected by title (#by-title)

```cudoc-embed
sources: [reference.md]
select:
  titles: [Backoff]
render: section
```

## Summary table (#summary)

```cudoc-embed
sources: [reference.md]
select:
  depth: 2
render:
  type: table
```

## Summary table with columns (#summary-columns)

```cudoc-embed
sources: [reference.md]
select:
  depth: 3
render:
  type: table
  columns: [title, link]
```

## Extracted table (#extracted)

```cudoc-embed
sources: [reference.md]
select:
  titles: [Limits, Scopes]
render:
  type: table
  columns:
    - { header: Section, value: title, link: section, minWidth: 10rem }
    - { header: Part of, value: parent, link: parent }
    - { header: First field, value: { row: 1, column: 0 } }
```

## Heading tree (#heading-tree)

```cudoc-embed
sources: [reference.md]
render:
  type: tree
  headings: 2
  print: 2
```

## Literal replacement (#literal-replace)

```cudoc-embed
sources: [reference.md#limits]
replace:
  - find: "**original**"
    replace: "_adapted_"
```

## Regex replacement (#regex-replace)

```cudoc-embed
sources: [reference.md#backoff]
replace:
  - find: "up to `\\d+s`"
    replace: "up to the configured ceiling"
    regex: true
```

## Root-relative source (#root-relative)

```cudoc-embed
sources: [/reference.md#scopes]
render: section
```

```cudoc-pagebreak

```

## After a page break (#after-break)

Paginated output starts a new page here; the HTML site shows nothing.
