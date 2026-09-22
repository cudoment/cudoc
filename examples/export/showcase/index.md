---
title: Northlight Weather API
lang: en
---

# Northlight Weather API (@v1)

Northlight serves current conditions and short-range forecasts for a network of
weather stations. This handbook is one set of Markdown documents that cudoc
publishes three ways: as the site you are reading, as a bound PDF with a cover
and contents page, and as a Word file with real styles. Every figure below is
drawn from the reference pages, so a correction there reaches this page too.

> [!NOTE] How this handbook is built
> The site, the PDF and the Word file come from one `cudoc-export build` run
> and one set of design tokens. The configuration is a single file,
> `showcase.config.mjs`, beside the documents.

## Endpoints at a glance (#endpoints)

Each row is one section of the endpoint reference. The method and the path are
read from the table at the top of that section, and the description is its
first paragraph.

```cudoc-embed
sources: [reference/endpoints.md]
select:
  depth: 2
render:
  type: table
  columns:
    - { header: Endpoint, value: title, link: section }
    - { header: Method, value: { row: 1, column: 0 }, minWidth: 5rem }
    - { header: Path, value: { row: 1, column: 1 }, minWidth: 14rem }
    - { header: What it returns, value: summary }
```

## Where to start (#start)

1. Read [Getting started](getting-started.md#getting-started) for a key and a
   first request.
2. Keep [Rate limits](reference/limits.md#windows) open while you design a
   polling schedule.
3. Check the [release notes](release-notes.md#release-notes) before upgrading
   a client.

> [!TIP] Reading this on paper?
> External links print their address after the text, and links between
> documents jump inside the bound file.
