# Markdown syntax

**English** | [한국어](./syntax.ko.md) · [All guides](./README.md)

This page describes the Markdown features cudoc adds. A site turns each one off, or chooses its form: cudoc syntax, the host's own syntax or both.

## Choose syntax per feature

Each feature in `syntax` takes one of four modes, and the options go to your host adapter. Set `host` with the generic compiler or the remark plugin; the Docusaurus, Nextra, VitePress, Eleventy and HTML adapters choose their own host.

```js
const options = {
  host: "docusaurus",
  syntax: {
    headingAnchor: "both",
    badge: "cudoc",
    tableCellList: "cudoc",
    callout: "both",
    link: "host",
    tableCellSpan: "cudoc",
    tableNote: "host",
    codeMeta: "cudoc",
    tabs: "cudoc",
  },
}
```

| Mode    | What cudoc normalizes                          |
| ------- | ---------------------------------------------- |
| `cudoc` | cudoc's representative syntax for that feature |
| `host`  | Supported native syntax of the selected host   |
| `both`  | Both forms into the same document semantics    |
| `off`   | Neither: the feature's text stays as written   |

The mode is a normalization policy, not a switch that disables a host parser. A host may still render its native syntax under `cudoc` or `off`, standard Markdown links always work, and where a host has no special syntax for a feature, `host` does not invent one. `off` turns a feature off in cudoc: with `tableCellList: "off"`, `- one<br>- two` in a cell stays the text it is written as.

Defaults are `cudoc` for `headingAnchor`, `badge`, `tableCellList`, `callout`, `tableCellSpan`, `codeMeta` and `tabs`, and `host` for `link` and `tableNote`. `syntax: {}` selects every default explicitly. → [Document APIs](./api-reference/document.md)

## Anchors and badges

`(#id)` after a heading sets its anchor, and `(@Badge)` shows a badge beside a heading or in running text without becoming part of the text:

```md
## Rate limits (#rate-limits) (@New)

This endpoint is (@Beta).

[Read the limits](#rate-limits)
```

`(#rate-limits)` supplies the heading ID, and `(@New)` displays a badge without becoming part of its title. Badge markers inside links and code remain text; to show the syntax literally, use an inline code span or a fenced code block.

Anchors must be unique in a document. A repeated ID is reported as a diagnostic during collection and as `duplicate-anchor` by [`cudoc check`](./check.md), and two different explicit IDs on one heading are an error.

Without an explicit anchor, the host generates its usual ID, and standalone compilation generates one from the title with the badge excluded. A host that slugs a heading before cudoc reads it may fold the badge marker into that generated ID, so give a badged heading an explicit `(#id)` when its anchor has to be stable across hosts.

The host heading forms cudoc supports are:

| Host                | Explicit ID                                  |
| ------------------- | -------------------------------------------- |
| Docusaurus Markdown | `## Title {#id}`                             |
| Docusaurus MDX      | `## Title {/* #id */}`                       |
| Nextra              | `## Title [#id]`                             |
| VitePress           | `## Title {#id}`                             |
| Eleventy            | `## Title {#id}` through `markdown-it-attrs` |

`headingAnchor: "both"` accepts them alongside `(#id)`, which works in both Markdown and MDX without expression escaping.

The ID cudoc settles is the one the page carries, spelled as written, on every host but Nextra. An ID made of lowercase letters, digits and hyphens, such as `v1-2`, reads the same everywhere.

Docusaurus keeps the ID too. One its slugger would change is handed over as `{#id}` at the end of the heading text, which it keeps verbatim, punctuation included, and any other ID passes through its slugger unchanged. Only the page's `#` heading always goes through the slugger, so give it a slug-shaped ID.

Nextra runs every heading ID through its slugger, its own `[#id]` included, so `(#v1.2)` becomes `v12` there and a link to `#v1.2` misses.

## Callouts

A blockquote that opens with `[!TYPE]` is a callout of that type, with an optional title on the same line:

```md
> [!WARNING] Check the request limit
> Exceeding the limit can reject requests.
>
> - Wait before retrying.
> - Review the response status.
```

Write `[!TYPE]` at the start of the first quoted line, followed by the title if there is one. The title is displayed in bold, so the marker needs no `**` wrapper. Body paragraphs, lists and inline Markdown are supported, and an ordinary blockquote without a marker remains a quote.

This marker, not `> **[TYPE] Title**`, is the callout syntax: it distinguishes a callout from ordinary emphasized quote text and uses the familiar [GitHub alert marker](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts), also recognized by [VitePress](https://vitepress.dev/guide/markdown#github-flavored-alerts). `> **[WARNING] Title**` remains an ordinary quote, not a second callout syntax. The optional same-line title and custom type registration are cudoc features, not a promise of identical rendering in every Markdown viewer.

Built-in types are `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION`, case-insensitive, and the spelling is `WARNING`, not `WARING`. Register additional types through `calloutTypes: ["success"]`, then write `[!SUCCESS]`. An unknown type stays as written and produces a diagnostic. `[!TAB]` is the marker of tabs instead: while `tabs` does not take cudoc syntax, it stays a quote and is not reported.

With `callout: "host"` or `"both"`, cudoc also recognizes these native forms:

| Host           | Form                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| Docusaurus     | `:::warning[Title]` followed by body and a closing `:::`                                  |
| VitePress      | `::: warning Title` followed by body and a closing `:::`; GitHub-style alerts             |
| Eleventy       | `::: warning Title` followed by body and a closing `:::`, through `markdown-it-container` |
| Nextra MDX     | `<Callout type="warning">Body</Callout>`                                                  |
| `docs` profile | `<Infobox type="warning" title="Title">Body</Infobox>`                                    |

Host types `info`/`default`, `danger`/`error` and `warn` map to `note`, `caution` and `warning`, and a `details` container remains expandable content on both markdown-it hosts. Eleventy has no built-in native forms, so `host` mode there normalizes only what the site's own markdown-it plugins produce. The [Docusaurus](./docusaurus.md), [Nextra](./nextra.md), [VitePress](./vitepress.md) and [Eleventy](./eleventy.md) guides give each parser's requirements.

### Replacing an `Infobox` component

The blockquote above replaces an imported `Infobox`. While documents still contain the component, configure `host: "docs"` and `syntax: { callout: "both", headingAnchor: "both", link: "both" }` in the site's rendering and collection pipelines alike, which accepts static `Infobox`, `Link` and `IconLink` forms alongside Markdown. The profile is a normalization preset, not an integration: the site still needs its own compiler wiring and stylesheet. Verify existing types and titles, dynamic props and custom component mappings on representative pages before removing the imports.

## Lists inside table cells

A table cell holds a list, nested or ordered, when `<br>` separates its lines and a line starts with a list marker:

```md
| Item   | Details                                   |
| ------ | ----------------------------------------- |
| Access | - Account<br>-- Verified email<br>- Token |
| Steps  | 1. Open settings<br>2. Create a key       |
```

`<br>` and `<br />` separate lines in `.md`; in `.mdx`, use the self-closing `<br />` form the MDX parser requires. `-` or `*` starts a list, and `--` or `**` nests an item. Ordered nesting uses `1.`, `1..`, `1...`, and indentation is also supported. Invalid list fragments stay as written. This syntax creates lists **inside existing table cells**, not tables from an ordinary document list.

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

Within the matching section, qualifying list cells are split across columns with aligned spans. Standard HTML table mappings are used, so no table components are needed, and layout rules are separate from the `syntax` mode settings.

A column that must not shrink below a width gets a width rule instead of a `<div style>` in every cell:

```js
const options = {
  syntax: {},
  tableColumnWidths: [
    { widths: { Description: "20rem" } },
    {
      section: { depth: 5, titles: ["Basic information"] },
      widths: { Method: "6ch", URL: "120px" },
    },
  ],
}
```

The header text selects the column, the CSS length becomes `min-width` on that header cell, and a rule without `section` applies to every table. Width and layout rules combine on the same column. → [Document options](./api-reference/document.md#document-options)

## Merged table cells

A cell holding only `^^` or `>>` merges into the cell above it or on its left, so one value spans several rows or columns:

```md
| Code | Status | Message           |
| ---- | :----: | ----------------- |
| E400 |  400   | Missing parameter |
| ^^   |   ^^   | Invalid value     |
| Note |   >>   | >>                |
```

A cell holding only `^^` joins the cell above it, and one holding only `>>` joins the cell on its left: above, `E400` and `400` span two rows and `Note` spans the whole last row. A block that spans both ways is marked with `>>` across its first row and `^^` under each of its cells, and a merged block that is not a rectangle is reported as `UNEVEN_CELL_SPAN`.

The header row can merge across columns but nothing merges into it, so `^^` in the first body row stays text, as does `>>` in the first column. To show either mark as text, escape it (`\^\^`) or put it in code, and set `tableCellSpan: "host"` to turn the marks off.

A table with merged cells moves its column alignment onto each cell, and Word and the paginated exports merge the same cells.

## Table notes

With `tableNote: "cudoc"`, the paragraphs right after a table that start with a mark become that table's note, explaining the cells that carry the same mark:

```md
| Field | Required |
| ----- | -------- |
| title | X\*      |
| image | O\*\*    |

\* One of `title` and `image` is required.

\*\* Up to 5 MB.
```

A mark is a run of `*`, `†` or `‡`, or superscript digits such as `¹⁾`. The note is set in small type under the table, kept with the table on a printed page, and written in Word's `CudocTableNote` style. Escape `*` as `\*`, or a line starting with it becomes a list.

The default is `host`, so plain paragraphs after a table stay paragraphs until a site turns this on. The `docs` profile reads its `<Footnote>` component as the same note under `tableNote: "host"` or `"both"`, joins the ones that follow a table into its note, and draws each line with `Footnote` again on the page. A `Footnote` numbered `1)` explains the cells marked `¹⁾`.

[`cudoc check`](./check.md) then pairs the marks: a cell marked `X*` needs a note starting `*` under its table, and under a table whose cells carry a mark, every note needs a cell that refers to it. Either failure is reported as `unmatched-table-note`.

## Code block titles and highlighted lines

A fence's meta names the code block with `title="…"` and highlights lines with `{…}`, so a sample shows which file it belongs in and which lines matter:

````md
```js title="retry.js" {2,4-5}
const attempts = 3
const delay = 250
export function backoff(attempt) {
  return delay * 2 ** attempt
}
```
````

`title="…"` names a code block, usually after the file it belongs in, and `{…}` lists the lines to highlight as numbers and ranges. Both go in the fence's meta after the language, in either order, beside anything else the meta holds.

Each host draws them its own way. Docusaurus is handed `title=` and Nextra and the `docs` profile `filename=`, so the title appears in their own code block. Everywhere else the block is framed under a title line styled by `@cudoment/cudoc/styles.css`, and so is a Nextra `.md` page, because Nextra drops a code block's meta there. Highlighted lines go to the host's highlighter, so a page marks them where the host highlights lines (Docusaurus, Nextra `.mdx`, VitePress); the HTML, PDF and Word exports always mark them. VitePress's own `js{4}`, written without a space, works too.

With `codeMeta: "host"` or `"both"`, a host's own title form names the block as well: `filename="…"` on Nextra and the `docs` profile, and `[name]` on VitePress, except inside a `::: code-group`, where `[name]` is the tab's label. Docusaurus's own form is already `title=`. The `docs` profile also reads a meta with commas between its entries and a value running to the next comma, as `filename=My File.swift,showLineNumbers`, and hands every page its meta that way.

## Tabs

Fences labelled `tab="…"` and `> [!TAB] Label` blockquotes that follow each other form one group of tabs, so alternatives such as the same call in two languages take the space of one:

````md
```kotlin tab="Kotlin" group=sdk
val profile = TalkApi.profile()
```

```java tab="Java"
Profile profile = TalkApi.profile();
```

> [!TAB] Notes
>
> Both calls need the `profile` scope.
````

A fence tab holds its code block; a blockquote tab holds anything a blockquote can, prose and lists included. `group=key` on the first fence, or `> [!TAB key] Label`, names the group. A site that keeps groups in step can switch every group with the same key together. A tab naming a different key starts another group right there. A `[!TAB]` without a label is reported as `UNLABELED_TAB` and stays a blockquote.

With `tabs: "host"` or `"both"`, each host's own components form the same group: Docusaurus's `<Tabs groupId>` and `<TabItem value label default>`, Nextra's `<Tabs items={[…]} defaultIndex>` and `<Tabs.Tab>`, the `docs` profile's `<Tabs>` and `<TabsContent id label default>`, and VitePress's `::: code-group`, whose fences' `[name]` are the labels. The labels and values have to be written out; a group that reads them from a variable stays the component it was, reported as `DYNAMIC_COMPONENT`.

A page shows the group as tabs with no script: a radio button and its label for each tab, styled by `@cudoment/cudoc/styles.css`, with the first tab, or the one marked default, shown until the reader picks another. A browser without CSS `:has()` shows every tab in turn, and printing, the PDF and Word write every tab under its label in turn.

On the `docs` host the group is drawn with the site's own `Tabs` and `TabsContent` components instead, which receive `id`, `label`, `default` and `group`. The remark adapters' `tabElements` option names other components and their props, as a Docusaurus site that registers `Tabs` and `TabItem` globally would with `{ tabs: { name: "Tabs", group: "groupId" }, tab: { name: "TabItem", value: "value" } }`. A Nextra `.md` page always gets the radio tabs, because Nextra lowercases component names there.

## Variables

`(=name)` is replaced wherever it is written with the value defined once in `variables`, so a version or an address changes in one place:

```md
Load SDK (=sdk.version) with `npm install sdk@(=sdk.version)`.

<script src="https://(=sdk.cdn)/(=sdk.version)/sdk.js"></script>
```

Define each value once, in the options the site and collection share:

```js
const options = {
  variables: { "sdk.version": "2.8.3", "sdk.cdn": "cdn.example.com" },
}
```

Every `(=name)` that names a variable is replaced in text, inline code and code blocks, raw HTML, link and image addresses, titles and alternative text, and static component attributes. So the version in an install command, a script tag and a sentence is one value. A name starts with a letter or `_` and may hold letters, digits, `_`, `.` and `-`. The marker is not `${…}`, `{…}` or `{{…}}`, because code samples, MDX and VitePress already give those a meaning. A `(@…)` badge ends at its first `)`, so it cannot hold a marker.

A marker that names no variable stays on the page as written. Collection reports it as `UNDEFINED_VARIABLE`, and [`cudoc check`](./check.md) as `undefined-variable` with the closest defined name. Without `variables` nothing is replaced, so a site that does not use them can write the marker as text; with them a marker has no escape, and one in a code span is replaced too. An embed block, a page-break fence and an MDX expression, import or export are code and keep their text. VitePress and Eleventy give a heading its id before cudoc replaces a marker in it, so give a heading that holds a variable an explicit `(#id)`.

## Shared link references

A link that several documents share is defined once in `linkReferences` and written as a Markdown reference link in each of them:

```md
Requests need a [business token][business-token]. Open the [app console][] first.
```

```js
const options = {
  linkReferences: {
    "business-token": "../auth/common.md#business-token",
    "app console": { url: "https://console.example.com/app", title: "Console" },
  },
}
```

A link written hundreds of times across a site, to the same page and the same anchor, is defined once in `linkReferences`. It is used as a Markdown reference link in every document: `[text][label]`, `[label][]` or `[label]`. `![alt][label]` shows an image the same way, inside a link's text too, as in `[![Logo][logo]](./index.md)`. Labels match the way CommonMark matches them, ignoring case and repeated spaces.

A relative address is read from the document that uses it, exactly as if that document had written the link, so `../auth/common.md#business-token` works from every document one folder below the root, in each language folder alike. A definition the document writes itself wins over a shared one, and a variable in a shared address is replaced.

The links are ordinary links: each host rewrites their addresses as it rewrites any other, and [`cudoc check`](./check.md) checks them, placing a problem at the `[label]` it came from. A full or collapsed reference whose label nobody defines stays text, and the check reports it as `undefined-link-reference` with the closest label. Avoid labels that match bracketed words your documents use as text, such as a menu path written `[Settings] > [Apps]`: a shortcut reference `[label]` links them.

## Page breaks

A fence with the info string `cudoc-pagebreak` forces a page break in the paginated outputs and renders nothing on a documentation site:

````markdown
Content that ends the page.

```cudoc-pagebreak

```

Content that starts the next page.
````

The fence is the one block form that parses identically through every host's compiler without a parser extension. An HTML comment fails to compile in MDX, and a link-definition trick is silently dropped by markdown-it, which would make an author's break disappear on half the hosts with no diagnostic.

**It is not a `syntax` feature.** That axis (`host`, `cudoc`, `both`, `off`) chooses between a cudoc spelling and a host's own spelling of the same meaning. No host has a page-break spelling, so `pageBreak: "host"` would mean "recognise nothing" and leave a visible empty code block on the page. Whether an output honours the mark is the output's concern, not the syntax's: the paginated exports do unless their `page.authoredBreaks` is `false`, and a site never shows it. Fenced embeds sit outside `SyntaxOptions` for the same reason.

The paginated formats also break pages on their own: before a document in a bound file, never right after a heading, which would leave it stranded at the foot of a page, and never inside a table row. Authoring a break is for the places those rules cannot know about.

## Links and authored components

Content shared between hosts uses Markdown links and images. Static native link components can be normalized when `link` accepts host syntax: the `docs` profile recognizes `Link` and `IconLink`, and explicit mappings for other names belong in site configuration.

`.md` is parsed as Markdown, so `{value}` stays literal, and `.mdx` supports your own components on MDX hosts. Static mapped components can be converted to common semantics; dynamic props and expressions are not executed by cudoc. A component that renders in its original host may still need an explicit renderer when embedded as portable HTML. → [Components and rendering](./api-reference/document.md#components-and-rendering)
