# Reference checking

**English** | [한국어](./check.ko.md) · [All guides](./README.md)

`cudoc check` reports every unresolved reference (link, anchor, image or embed) and every table that does not render as written, in one pass.

The build refuses a broken link one at a time: you fix one, rebuild, and learn about the next. The check walks the whole set, prints everything at once and writes no output.

```sh
cudoc check --config cudoc.config.mjs
```

It resolves through the same code the build uses, so a reference the check accepts is a reference the build can resolve. One exception is a link to a `.md` file on Next.js and Eleventy, which the check accepts as the document it names while those hosts leave it as written ([Next.js](./next.md#nextjs-specifics), [Eleventy](./eleventy.md#eleventy-specifics)).

## Add it to your build

Run the check between collection and the site build. It reads the library the last collection published and collects nothing, so its configuration only says where that library is and where the documents live: `outDir` (default `.cudoc/documents`), and `sourceRoot` or `roots`, which locate images and other files on disk. Without them a link that names neither a collected document nor a file is not reported either.

With `cudoc collect` that is the configuration collection already reads. A host that collects with a `collect.mjs` script of its own gives the check a configuration naming the same directories:

```js
// cudoc.config.mjs, read by `cudoc check`; collect.mjs writes the library
export default {
  sourceRoot: "docs",
  outDir: ".cudoc/documents",
  check: { assetDirs: ["static"] },
}
```

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "build": "npm run collect && npm run check && docusaurus build"
  }
}
```

Errors exit `1`. Warnings do not, unless you pass `--strict`. Without a collected library the check fails and asks you to collect first.

An embed that cannot resolve stops `cudoc collect` before the check sees it. Collection resolves every embed before it publishes anything, so a missing source or section, a block that does not parse or a cycle stops it. It names each of them with its file and block number in one message and publishes nothing, and the check then reads the last library that did publish. The embed errors below are what the check reports for a library collected without its embeds, as `buildDocuments` publishes it, and for a library handed to [`checkReferences`](#programmatic-use).

## What it reports

Every issue carries one of these codes and a severity:

| Code                          | Severity | Meaning                                                                                                                         |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `missing-document`            | error    | A local link names no collected document and no file                                                                            |
| `missing-anchor`              | error    | The document exists; that anchor does not                                                                                       |
| `missing-asset`               | error    | An image has no file under any collection root or asset directory                                                               |
| `missing-embed-source`        | error    | An embed names a document that was not collected, or a tree a folder with no document it can list                               |
| `missing-embed-anchor`        | error    | The embed source exists; that section, or any selected, does not                                                                |
| `duplicate-anchor`            | error    | Two headings in one document claim the same anchor                                                                              |
| `empty-anchor`                | error    | An anchor marker with no id, left in the heading text                                                                           |
| `invalid-embed-spec`          | error    | An embed block does not parse, or names a key that does not exist                                                               |
| `cyclic-embed`                | error    | An embed copies content that embeds it again, so it never ends                                                                  |
| `unmatched-embed-replacement` | warning  | A `replace` rule found nothing to change                                                                                        |
| `unreplaceable-embed-section` | error    | A `replace` rule targets a section inside another block whose text, read on its own, is not that section                        |
| `empty-embed-cell`            | warning  | A defined table column found nothing in one of its rows                                                                         |
| `imported-embed-component`    | error    | An embed copies a component its source file imports for itself                                                                  |
| `unstable-anchor-link`        | warning  | A link depends on a generated anchor that document order can move                                                               |
| `unportable-embed-component`  | warning  | An embed copies a component that HTML export cannot render                                                                      |
| `unmatched-tree-order`        | warning  | A tree's `order` names no line of its first level                                                                               |
| `table-column-count`          | error    | A table row has more or fewer cells than its delimiter row, or a header that disagrees makes it no table                        |
| `table-unclosed-code`         | error    | A code span in a table cell never closes, usually because a `\|` inside it split the cell                                       |
| `path-case-mismatch`          | error    | A link or image names a document or file in other letter case, which only a case-insensitive disk finds                         |
| `missing-translation`         | warning  | With `translations`, a document has no counterpart in another language                                                          |
| `translation-anchor-mismatch` | warning  | With `translations`, a document lacks an explicit anchor its translation has                                                    |
| `translation-visibility`      | warning  | With `translations`, a published document's translation is private                                                              |
| `invalid-anchor-format`       | warning  | With `anchorPattern`, an explicit anchor does not match the pattern                                                             |
| `missing-title`               | warning  | With `requireTitle`, a document has neither a `#` heading with text nor a front matter `title`                                  |
| `empty-alt`                   | warning  | With `requireAlt`, an image has no alternative text                                                                             |
| `unused-asset`                | warning  | With `unusedAssets`, a file that no document links to or shows                                                                  |
| `undefined-variable`          | error    | With `variables`, a `(=name)` marker names no variable the collection defines, so it shows as written                           |
| `undefined-link-reference`    | warning  | With `linkReferences`, a full or collapsed reference names a label no one defines, so it shows as text                          |
| `unmatched-table-note`        | warning  | With table notes read, a cell's mark such as `X*` has no note under its table, or a note under a marked table no cell refers to |

External URLs are out of scope. Whether `https://example.com` is reachable is a network job with different failure modes, and it belongs in a separate tool.

A link to your own site written as an absolute URL is not external: list the site's origin in `siteOrigins`, and `https://docs.example.com/guide#setup` is checked as `/guide#setup`, document, anchor and file alike.

A path on your own domain that another application serves, such as `/sdk/js/start` beside a documentation site, is out of scope once you list its prefix in `externalPaths`. Without that it is reported as a missing document, because the checker has no other way to know the page exists.

An anchor is a heading's id or an `id` written on an element in raw HTML, such as `<a id="legacy"></a>`. A fragment written percent-encoded, as hosts write a fragment that is not ASCII, matches the same anchor as the decoded one.

A relative link resolves in library coordinates, not on disk. With a single `sourceRoot` the two are the same; with several [roots](./api-reference/node.md#collection) a link like `../../terms/token.md` crosses from one root into another exactly when the bases mirror the directory names. A root-relative link such as `/terms/token.md` names the document under its base directly and always works.

## Reading the output

The report groups issues by document, each with its position, severity, code and the reference as written, followed by an explanation and the checker's suggestions:

```
guide.md
  3:14  error   missing-anchor       reference.md#limit
        reference has no anchor #limit
        available: #reference, #limits, #authentication, #retry
        did you mean: reference.md#limits
  3:46  error   path-case-mismatch   Reference.md#retry
        Reference.md#retry names reference in different letter case. It resolves on a case-insensitive disk such as macOS's and fails on a case-sensitive one, as most servers are.
        did you mean: reference.md#retry
   7:1  error   table-column-count   | `id|key` | string |
        this row has 3 cells where the table has 2, so the last one is dropped. Remove the extra cells, add the column to every row, or escape a | that belongs to the text as \|.
   7:3  error   table-unclosed-code  `id
        a | inside this code span splits the cell, as it does anywhere in a table row, so the span never closes and its backticks show. Write the pipe as \|.

4 errors in 1 of 2 documents
```

`available` lists every anchor the target document really has. `did you mean` adds what the reference most likely meant, written the way you wrote the link, but only when something is spelled close enough. A typo or a change of case has an answer, while a renamed heading usually does not, and then the full list is what you read. A missing document or image gets the same suggestion from the documents and image files that exist. A file name with a space is suggested escaped, as `start%20here.md`, so the suggestion works as a link destination as it stands.

Each document's issues are listed in the order they appear in the file, with coordinates from the original Markdown. Collection strips positions from the stored tree on purpose, because a persisted AST should not carry coordinates that go stale the moment the file is edited, so the checker finds the reference in the source snapshot instead. A reference repeated in one document reports the first occurrence outside code.

## Tables

A table that is wrong never fails a build. The parser keeps as many cells as the delimiter row has, fills a short row with empty cells, and turns a table whose header disagrees with the delimiter row into a paragraph. The checker parses the source with the host's own Markdown parser, micromark or the site's markdown-it. It therefore reads a table in a quote, a list item or a container as the page does, and sees what the page has already absorbed. → [How tables are read](./api-reference/node.md#reference-checking)

Every host splits a row on every `|` that is not escaped as `\|`, inside a code span as much as outside it, so `` `a|b` `` in a cell is two cells, each with a backtick that never closes:

```md
| Field | Type |
| ----- | ---- |
| `id   | key` | string |
```

That row is reported twice, as a row with three cells and as a code span the pipe split, which is one mistake: write `` `id\|key` ``. Text inside a fenced code block and in front matter is not a table.

## Letter case

`Guide.md` and `guide.md` are the same file on macOS and Windows and different files on the servers most sites run on. A link that differs from its target only in letter case therefore works while you write and breaks once deployed. `path-case-mismatch` reports such a link to a document, an image or a file on every disk, with the target's own spelling as the suggestion.

## Translations

List the languages your documents are written in, each by the library path prefix or the id suffix its documents carry, and the checker compares the documents that are the same once those are taken away:

```js
export default {
  sourceRoot: "docs",
  check: {
    translations: [
      { code: "ko", prefix: "ko/" },
      { code: "en", prefix: "en/" },
    ],
  },
}
```

For `guide.md` beside `guide.ko.md`, write `[{ code: "en" }, { code: "ko", suffix: ".ko" }]`: at most one language may have neither, and it takes every document the others do not.

The comparison reports three things. A document without a counterpart is `missing-translation`. An explicit anchor one has and its counterpart lacks is `translation-anchor-mismatch`, reported on the one that lacks it, since a link or a language switch that carries `#setup` across lands at the top of a page without it. A published document whose counterpart is private is `translation-visibility`. A translation in progress is normal, so all three are warnings, and `--strict` or `ignore` decides how much of it a build tolerates.

## The unstable-anchor warning

When two headings share a title, the second one's generated anchor gets a suffix:

```md
## Overview → #overview

## Overview → #overview-1
```

**A link to `#overview-1` does not break when another `## Overview` is inserted above it. It silently points at a different section,** because the suffixes shift. Every host does this, and no checker can catch it afterwards, because the link is still valid.

The warning fires at the only moment the problem can be caught, when the link is written, and only when the unsuffixed anchor is there too: `## Version 2` makes `#version-2` from its own text, and nothing can shift it. An explicit anchor on the target heading removes the problem:

```md
## Overview (#deployment-overview)
```

Silence it for a project that accepts the risk:

```js
export default {
  sourceRoot: "docs",
  check: { ignore: ["unstable-anchor-link"] },
}
```

## The unmatched-replacement warning

A `replace` rule whose `find` matches nothing fails nothing: `replace` adapts an embedded copy for the page it lands on, and the embed quietly shows the source's own wording in a place written to expect something else. Usually the source was reworded and the adaptation was left behind:

```
guide.md
  6:12  warning unmatched-embed-replacement was reworded away
        replacement 1 found no "was reworded away" in what this embed copies from reference, so nothing was changed. The source may have been reworded; literal rules are case-sensitive.
```

Only a rule matching **none** of the selected sections is reported. A rule list applies to every selected section, so a rule aimed at one section of a `depth: 2` selection finds nothing in the others by design. Rules are tested in order, each against what the previous one produced, exactly as the resolver applies them. → [Find and replace](./embedding.md#find-and-replace)

## The empty-cell warning

A table embed with [defined columns](./embedding.md#define-the-columns-yourself) states what every row must have: a table at a coordinate, a first paragraph, a heading above. When a section lacks it, the resolver renders an empty cell and nothing fails, so the checker says which column, which row and why:

```
guide.md
  4:11  warning empty-embed-cell     /docs/rest-api.md
        column 2 "Method" is empty for the row from docs/rest-api#charge: expected table 0 in docs/rest-api#charge, found 0 tables after skipping those headed "Requirements"
```

Only columns written as mappings are reported. The shorthand `summary` of a section that opens with a table is legitimately blank. A column naming an extractor the configuration does not register is an `invalid-embed-spec` error instead.

## The unmatched-order warning

A [tree](./embedding.md#draw-a-tree-of-documents)'s `order` puts the names it lists first. An entry that names no line of the first level moves nothing, and the tree silently stays in title order, so the checker names the entry and the titles it could have meant:

```
guides/index.md
  9:11  warning unmatched-tree-order Overveiw
        order names "Overveiw", which is not on the tree's first level, so it moves nothing. An entry matches a document's file name or a line's title.
        available: "Install", "Overview"
```

An entry matches a document's file name without the extension, or a line's title, compared in Unicode NFC. `...` is never reported.

## Malformed embed blocks

An embed block is YAML. One that does not parse, or that names a key cudoc does not have, is reported with the line inside your file rather than inside the block:

```
guide.md
  3:1  error   invalid-embed-spec   embed block 1
       replace[0]: unknown key "regexp". Known keys: find, replace, regex, flags
```

Unknown keys are rejected at all three levels, the block, `select` and each `replace` rule, because an ignored key fails quietly: `regexp` for `regex` would turn a pattern into a literal that matches nothing.

## The cyclic-embed error

An embed whose copied section embeds something that copies the first section back never ends. The checker follows the embeds inside every copied section, as the resolver expands them and after the embed's `replace` rules have rewritten it, and reports the chain at each fence that takes part. Here `guide.md` embeds `reference.md#limits`, which embeds all of `guide.md`:

```
guide.md
  3:1  error   cyclic-embed         embed block 1
       embed block 1 never finishes: reference#limits -> guide#* -> reference#limits. Each embed copies content that embeds the next, back to the first.

reference.md
  5:1  error   cyclic-embed         embed block 1
       embed block 1 never finishes: guide#* -> reference#limits -> guide#*. Each embed copies content that embeds the next, back to the first.

2 errors in 2 of 2 documents
```

`#*` is a whole document. Break the chain by embedding a narrower section, or by moving the shared text into a document that neither embeds.

## The imported-component error

A component the source file `import`s for itself cannot render where the copy lands: the import stays in that file, and the embedding document has no binding for the name, so the page fails to render. A component the host knows by name is fine in an embedded section, because an MDX host renders the copy through its own component mapping. The error is reported beside the portability warning the same copy raises:

```
guide.md
  4:11  warning unportable-embed-component widget.mdx#live
        this embed copies <Chart> out of widget. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.
  4:11  error   imported-embed-component widget.mdx#live
        this embed copies <Chart> out of widget, which imports it in its own file. guide has no such import, so the spliced copy cannot render it. Provide the component through the host's shared components, import it in guide as well, or move it out of the embedded section.
```

Provide the component through the host's shared components (`mdx-components.tsx`, an `MDXProvider`, a theme), import it in the embedding document as well, or move it out of the embedded section. The error is not reported when the embedding document imports the same name.

## The unportable-component warning

An embed carries a component into a document where HTML export has to render a name it was never given. The component is fine in the document that owns it, because the host that registers it renders it there.

`widget.mdx` holds a component. `guide.md` embeds that section:

````md
```cudoc-embed
sources: [widget.mdx#live]
```
````

Your site renders it, because your site registers `Chart`. `cudoc-export` has no such registry, so it refuses:

```
cudoc: no portable renderer for Chart at line ?
```

The warning moves that failure from export time to check time, and names the component:

```
guide.md
  4:11  warning unportable-embed-component widget.mdx#live
        this embed copies <Chart> out of widget. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.
```

It inspects what the embed would actually copy, not the whole source document. A `select` or `includeChildren: false` that leaves the component out keeps the warning quiet, so does a `replace` rule that rewrites the component into prose, and a `render: { type: table }` embed is skipped entirely, because only heading text travels. The checker compiles a rewritten copy with the standalone compiler, and one it cannot compile, such as Docusaurus MDX with a `{#id}` heading, is left unchecked rather than guessed at.

There are two ways out. Keep embedded sections to Markdown, which is what makes a fact reusable in the first place. Or, if both HTML export and the component matter, give the exporter a renderer for each name:

```js
renderDocument(tree, { components: { Chart: (node) => "<figure>…</figure>" } })
```

Silence it for a project that never exports HTML:

```js
export default {
  sourceRoot: "docs",
  check: { ignore: ["unportable-embed-component"] },
}
```

## Options

`check` in your collection configuration takes these options:

| Option          | Effect                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `ignore`        | Codes to leave out of the result entirely                                                                    |
| `assetDirs`     | Extra roots for images, matching your host's `public` or `static`                                            |
| `externalPaths` | Root-relative prefixes another app serves on your domain, such as `/sdk`; links into them are not checked    |
| `siteOrigins`   | Origins your site is served from, such as `https://docs.example.com`; absolute URLs on them are checked      |
| `translations`  | Languages as `{ code, prefix?, suffix? }`; translations are compared, as [above](#translations)              |
| `anchorPattern` | A regular expression every explicit anchor must match whole, such as `[a-z0-9]+(?:-[a-z0-9]+)*`              |
| `requireTitle`  | Reports a document with neither a `#` heading with text nor a front matter `title`                           |
| `requireAlt`    | Reports an image without alternative text                                                                    |
| `unusedAssets`  | Glob patterns from the working directory, such as `public/img/**`; files nothing references are reported     |
| `withoutBase`   | A function removing your deployment base from a root-relative path, so only an `.mjs` configuration gives it |
| `sourceRoot`    | Overrides the library's own root; `roots` does the same for several directories                              |

The command line adds two flags:

| Flag            | Effect                                     |
| --------------- | ------------------------------------------ |
| `--format json` | Prints the full result for CI or an editor |
| `--strict`      | Warnings exit `1` as well                  |

## Programmatic use

`checkReferences` runs the same check on a library you pass it, and `formatCheckResult` writes the result as the command line prints it:

```js
import { checkReferences } from "@cudoment/cudoc/node/check"
import { formatCheckResult } from "@cudoment/cudoc/node/report"

const result = checkReferences(library, { ignore: ["unstable-anchor-link"] })
if (result.issues.length) console.log(formatCheckResult(result))
```

It is useful beside a watcher: [`watchDocuments`](./api-reference/node.md#watching), which `cudoc collect --watch` runs, reports every pass through `onPass`, and a site can check the pass's library there. → [Node API reference](./api-reference/node.md#reference-checking)

## In your editor

`cudoc lsp` is the same check as a language server over stdin and stdout, for any editor that runs one:

```sh
cudoc lsp --config cudoc.config.mjs
```

When the editor connects, and after every save, it collects the library incrementally from the configuration `cudoc collect` reads, as `cudoc collect --watch` does, and checks it with the configuration's `check` options. Each issue appears on its line in its file, and a correction the check suggests, a near document name, variable or letter case, is offered as a quick fix that replaces just the reference. With `translations` configured, the request `cudoc/counterpart` returns the other languages' versions of a document, for a command that opens the translation beside it.

Give it the configuration the site collects with, compiler included. On Next.js that is the guide's `cudoc.config.mjs`. On Docusaurus, Nextra, VitePress and Eleventy the guide's `cudoc.config.mjs` only configures the check, so give `cudoc lsp` an `.mjs` module whose default export is the collector's whole configuration, `compiler` and `compilerId` included, with the `check` options beside them.

The server writes the library to `outDir` as collection always does, so a site's build reads what the editor last checked. Given the check-only file, whose compiler differs from the one the library was collected with, it collects nothing and logs an error naming both, rather than replace the library the site reads. The refusal needs that library in `outDir`: in a fresh clone, or after `.cudoc` is deleted, the server collects with the file it is given, so build the site once first.

## What it does not do

Three things stay outside the check:

- **External link reachability.** Out of scope, as above.
- **Checking unsaved text.** The check reads files from disk, so it runs on save, in the editor as well as in `cudoc check`. For a check after every change outside an editor, call `checkReferences` from `onPass`.
- **Fixing anything on its own.** It reports, with a likely correction where one is close, which the editor offers as a quick fix. Applying it stays with the author.
