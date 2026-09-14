# Markdown syntax

**English** | [한국어](./syntax.ko.md) · [All guides](./README.md)

## Choose syntax per feature

Pass these options to your host adapter. Set `host` when using the generic compiler or remark plugin; the Docusaurus, Nextra, VitePress, Eleventy and HTML adapters choose their own host.

```js
const options = {
  host: "docusaurus",
  syntax: {
    headingAnchor: "both",
    badge: "cudoc",
    tableCellList: "cudoc",
    callout: "both",
    link: "host",
  },
}
```

| Mode    | What cudoc normalizes                          |
| ------- | ---------------------------------------------- |
| `cudoc` | cudoc's representative syntax for that feature |
| `host`  | Supported native syntax of the selected host   |
| `both`  | Both forms into the same document semantics    |

This is a normalization policy, not a switch that disables a host parser. A host may still render its native syntax under `cudoc`. Standard Markdown links always work. If a host has no special syntax for a feature, `host` does not invent one.

Defaults are `cudoc` for `headingAnchor`, `badge`, `tableCellList` and `callout`, and `host` for `link`. There is no `off` value. Write `syntax: {}` to select all defaults explicitly. Full option definitions are in the [API reference](./api-reference/document.md).

## Anchors and badges

```md
## Rate limits (#rate-limits) (@New)

This endpoint is (@Beta).

[Read the limits](#rate-limits)
```

`(#rate-limits)` supplies the heading ID. `(@New)` displays a badge without becoming part of its title. Anchors must be unique in a document. Conflicting explicit IDs are an error. Without an explicit anchor, the host generates its usual ID; standalone compilation generates one from the title with the badge excluded. A host that slugs a heading before cudoc reads it may fold the badge marker into that generated ID, so give a badged heading an explicit `(#id)` when its anchor has to be stable across hosts.

Badge markers inside links and code remain text. To show syntax literally, use an inline code span or a fenced code block.

Supported host heading forms include:

| Host                | Explicit ID                                  |
| ------------------- | -------------------------------------------- |
| Docusaurus Markdown | `## Title {#id}`                             |
| Docusaurus MDX      | `## Title {/* #id */}`                       |
| Nextra              | `## Title [#id]`                             |
| VitePress           | `## Title {#id}`                             |
| Eleventy            | `## Title {#id}` through `markdown-it-attrs` |

Select `headingAnchor: "both"` to accept these alongside `(#id)`. cudoc's `(#id)` works in both Markdown and MDX without expression escaping.

## Callouts

```md
> [!WARNING] Check the request limit
> Exceeding the limit can reject requests.
>
> - Wait before retrying.
> - Review the response status.
```

Write `[!TYPE]` at the start of the first quoted line, followed by an optional title. The title is displayed in bold, so the marker itself needs no `**` wrapper. Body paragraphs, lists and inline Markdown are supported. An ordinary blockquote without a marker remains a quote.

Prefer this marker to `> **[TYPE] Title**`: it distinguishes a callout from ordinary emphasized quote text and uses the familiar [GitHub alert marker](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts), also recognized by [VitePress](https://vitepress.dev/guide/markdown#github-flavored-alerts). The optional same-line title and custom type registration are cudoc features, not a promise of identical rendering in every Markdown viewer. `> **[WARNING] Title**` remains an ordinary quote, not a second callout syntax.

Built-in types are `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION`, case-insensitive. Use `WARNING`, not `WARING`. Register additional types through `calloutTypes: ["success"]`, then write `[!SUCCESS]`. An unknown type stays as written and produces a diagnostic.

With `callout: "host"` or `"both"`, cudoc also recognizes these native forms:

| Host             | Form                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Docusaurus       | `:::warning[Title]` followed by body and a closing `:::`                                  |
| VitePress        | `::: warning Title` followed by body and a closing `:::`; GitHub-style alerts             |
| Eleventy         | `::: warning Title` followed by body and a closing `:::`, through `markdown-it-container` |
| Nextra MDX       | `<Callout type="warning">Body</Callout>`                                                  |
| Docs MDX profile | `<Infobox type="warning" title="Title">Body</Infobox>`                                    |

Host types `info`/`default`, `danger`/`error`, and `warn` map to `note`, `caution`, and `warning`. A `details` container remains expandable content on both markdown-it hosts. Eleventy has no built-in native forms, so `host` mode there normalizes only what the site's own markdown-it plugins produce. See the [Docusaurus](./docusaurus.md), [Nextra](./nextra.md), [VitePress](./vitepress.md) and [Eleventy](./eleventy.md) integration notes for parser requirements.

### Replacing an Infobox in Docs

Use the same blockquote example above instead of importing `Infobox`. During migration, configure `host: "docs"` and `syntax: { callout: "both", headingAnchor: "both", link: "both" }` in the actual Docs rendering and collection pipelines. This accepts static `Infobox`/`Link`/`IconLink` forms alongside Markdown. The profile is a normalization preset, not an installed Docs integration: the Docs project still needs its compiler wiring and stylesheet changes. Verify existing types/titles, dynamic props and custom component mappings on representative Docs pages before removing their imports.

## Lists inside table cells

```md
| Item   | Details                                   |
| ------ | ----------------------------------------- |
| Access | - Account<br>-- Verified email<br>- Token |
| Steps  | 1. Open settings<br>2. Create a key       |
```

`<br>` and `<br />` separate lines in `.md`. In `.mdx`, use the self-closing `<br />` form required by the MDX parser. `-` or `*` starts a list; `--` or `**` nests an item. Ordered nesting uses `1.`, `1..`, `1...`; indentation is also supported. Invalid list fragments stay as written. This syntax creates lists **inside existing table cells**, not tables from an ordinary document list.

For a wide list column, configure a layout rule:

```js
const options = {
  syntax: {},
  tableColumnLayout: [
    {
      section: { depth: 2, titles: ["Requirements"] },
      columnHeaders: ["Prerequisites"],
      split: { minItems: 4, columns: 2 },
    },
  ],
}
```

Within the matching section, qualifying list cells are split across columns with aligned spans. Standard HTML table mappings are used; no table components are needed. Layout rules are separate from the five syntax-mode settings.

## Links and authored components

Use Markdown links and images for content shared between hosts. Static native link components can be normalized when `link` accepts host syntax. The `docs` profile recognizes `Link` and `IconLink`; explicit mappings for other names belong in site configuration.

`.md` is parsed as Markdown, so `{value}` stays literal. `.mdx` supports your own components on MDX hosts. Static mapped components can be converted to common semantics; dynamic props and expressions are not executed by cudoc. A component that renders in its original host may still need an explicit renderer when embedded as portable HTML. See [component mapping and rendering](./api-reference/document.md#components-and-rendering).
