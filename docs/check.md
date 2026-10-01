# Reference checking

**English** | [한국어](./check.ko.md) · [All guides](./README.md)

`cudoc check` reads a collected library and reports every reference that does not resolve — links, anchors, images and embeds — in one pass.

The build already refuses to ship a broken link. That makes it a poor way to _find_ them: you fix one, rebuild, and learn about the next. Checking walks the whole set instead and prints everything at once, without writing any output.

```sh
cudoc check --config cudoc.config.mjs
```

It resolves through the same code the build uses, so a reference this calls fine is a reference the build can resolve.

## Add it to your build

Run it between collection and the site build. It reads the library the last collection published and collects nothing, so its configuration only says where that library is and where the documents live: `outDir` (default `.cudoc/documents`), and `sourceRoot` or `roots`, with which images and other files are checked on disk; without them a link that names neither a collected document nor a file is not reported either. With `cudoc collect` that is the configuration collection already reads. A host that collects with a `collect.mjs` script of its own gives the check a configuration naming the same directories:

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

`cudoc collect` resolves every embed before it publishes anything, so embeds that cannot resolve — a missing source or section, a block that does not parse, a cycle — stop collection, which names each of them with its file and block number in one message and publishes nothing; the check then reads the last library that did publish. The embed errors below are what the check reports for a library collected without its embeds, as `buildDocuments` publishes it, and for a library handed to [`checkReferences`](#programmatic-use).

## What it reports

| Code                          | Severity | Meaning                                                                                                  |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `missing-document`            | error    | A local link names no collected document and no file                                                     |
| `missing-anchor`              | error    | The document exists; that anchor does not                                                                |
| `missing-asset`               | error    | An image has no file under any collection root or asset directory                                        |
| `missing-embed-source`        | error    | An embed names a document that was not collected, or a tree a folder with no document it can list        |
| `missing-embed-anchor`        | error    | The embed source exists; that section, or any selected, does not                                         |
| `duplicate-anchor`            | error    | Two headings in one document claim the same anchor                                                       |
| `empty-anchor`                | error    | An anchor marker with no id, left in the heading text                                                    |
| `invalid-embed-spec`          | error    | An embed block does not parse, or names a key that does not exist                                        |
| `cyclic-embed`                | error    | An embed copies content that embeds it again, so it never ends                                           |
| `unmatched-embed-replacement` | warning  | A `replace` rule found nothing to change                                                                 |
| `unreplaceable-embed-section` | error    | A `replace` rule targets a section inside another block whose text, read on its own, is not that section |
| `empty-embed-cell`            | warning  | A defined table column found nothing in one of its rows                                                  |
| `imported-embed-component`    | error    | An embed copies a component its source file imports for itself                                           |
| `unstable-anchor-link`        | warning  | A link depends on a generated anchor that document order can move                                        |
| `unportable-embed-component`  | warning  | An embed copies a component that standalone HTML cannot render                                           |
| `unmatched-tree-order`        | warning  | A tree's `order` names no line of its first level                                                        |

External URLs are out of scope. Checking whether `https://example.com` is reachable is a network job with different failure modes, and it belongs in a separate tool. A path on your own domain that another application serves, such as `/sdk/js/start` beside a documentation site, is out of scope too once you list its prefix in `externalPaths`; without that it is reported as a missing document, because the checker has no other way to know the page exists.

An anchor is a heading's id or an `id` written on an element in raw HTML, such as `<a id="legacy"></a>`. A fragment written percent-encoded, as hosts write a fragment that is not ASCII, matches the same anchor as the decoded one.

A relative link resolves in library coordinates, not on disk. With a single `sourceRoot` the two are the same; with several [roots](./api-reference/node.md#collection) a link like `../../terms/token.md` crosses from one root into another exactly when the bases mirror the directory names. A root-relative link such as `/terms/token.md` names the document under its base directly and always works.

## Reading the output

```
guide.md
  3:19  error   missing-anchor       reference.md#limit
        reference has no anchor #limit
        available: #reference, #limits, #authentication, #retry (+3 more)
  5:25  warning unstable-anchor-link reference.md#overview-1
        #overview-1 in reference is generated from a repeated heading; inserting another one above it moves this link to a different section. Give the target heading an explicit anchor.

1 error, 1 warning in 1 of 2 documents
```

`available` lists the anchors the target document really has, rather than guessing which one you meant. A guess that is wrong costs more than no guess at all, and a renamed heading — the common case — is exactly where guessing fails.

Coordinates come from the original Markdown. Collection strips positions from the stored tree on purpose, because a persisted AST should not carry coordinates that go stale the moment the file is edited, so the checker finds the reference in the source snapshot instead. A reference repeated in one document reports the first occurrence.

## The unstable-anchor warning

When two headings share a title, the second one's generated anchor gets a suffix:

```md
## Overview → #overview

## Overview → #overview-1
```

Every host does this, and it is fine until something links to `#overview-1`. Insert another `## Overview` above it and the suffixes shift. **The link does not break. It silently points at a different section.** No checker can catch that afterwards, because the link is still valid.

So the warning fires at the only moment it can be caught: when the link is written. It needs the unsuffixed anchor to be there too: `## Version 2` makes `#version-2` from its own text, and nothing can shift it. Give the target heading an explicit anchor and the problem cannot occur.

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

`replace` adapts an embedded copy for the page it lands on. When its `find` matches nothing, nothing fails: the embed quietly shows the source's own wording in a place written to expect something else. Usually the source was reworded and the adaptation was left behind.

```
guide.md
  6:12  warning unmatched-embed-replacement was reworded away
        replacement 1 found no "was reworded away" in what this embed copies from reference, so nothing was changed. The source may have been reworded; literal rules are case-sensitive.
```

A rule list applies to every selected section, so a rule aimed at one section of a `depth: 2` selection finds nothing in the others by design. Only a rule matching **none** of the selected sections is reported. Rules are tested in order, each against what the previous one produced, exactly as the resolver applies them. → [Find and replace](./embedding.md#find-and-replace)

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

Unknown keys are rejected at all three levels — the block, `select` and each `replace` rule — because an ignored key fails quietly: `regexp` for `regex` would turn a pattern into a literal that matches nothing.

## The cyclic-embed error

An embed copies a section. When that section embeds something that copies the first section back, the copy never ends. The checker follows the embeds inside every copied section, as the resolver expands them and after the embed's `replace` rules have rewritten it, and reports the chain at each fence that takes part. `guide.md` embeds `reference.md#limits`, which embeds all of `guide.md`:

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

An MDX host renders an embedded copy through its own component mapping, so a component in an embedded section works there — as long as the host knows the name. A component the source file `import`s for itself is different: the import stays in that file, and the document the copy lands in has no binding for the name, so the page fails to render. It is reported beside the portability warning the same copy raises:

```
guide.md
  4:11  warning unportable-embed-component widget.mdx#live
        this embed copies <Chart> out of widget. Neither this host nor standalone HTML export can render them. Keep embedded sections to Markdown, or pass a renderer for each name.
  4:11  error   imported-embed-component widget.mdx#live
        this embed copies <Chart> out of widget, which imports it in its own file. guide has no such import, so the spliced copy cannot render it. Provide the component through the host's shared components, import it in guide as well, or move it out of the embedded section.
```

Provide the component through the host's shared components (`mdx-components.tsx`, an `MDXProvider`, a theme), import it in the embedding document as well, or move it out of the embedded section. The error is not reported when the embedding document imports the same name.

## The unportable-component warning

A component is fine in the document that owns it: the host that registers it renders it. An embed changes that. The copy lands in another document, and standalone HTML export then has to render a name it was never given.

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

There are two ways out. Keep embedded sections to Markdown, which is what makes a fact reusable in the first place. Or, if both standalone HTML and the component matter, give the exporter a renderer for each name:

```js
renderDocument(tree, { components: { Chart: (node) => "<figure>…</figure>" } })
```

Silence it for a project that never exports standalone HTML:

```js
export default {
  sourceRoot: "docs",
  check: { ignore: ["unportable-embed-component"] },
}
```

## Options

`check` in your collection config:

| Option          | Effect                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `ignore`        | Codes to leave out of the result entirely                                                                 |
| `assetDirs`     | Extra roots for images, matching your host's `public` or `static`                                         |
| `externalPaths` | Root-relative prefixes another app serves on your domain, such as `/sdk`; links into them are not checked |
| `sourceRoot`    | Overrides the library's own root; `roots` does the same for several directories                           |

Command line:

| Flag            | Effect                                     |
| --------------- | ------------------------------------------ |
| `--format json` | Prints the full result for CI or an editor |
| `--strict`      | Warnings exit `1` as well                  |

## Programmatic use

```js
import { checkReferences } from "@cudoment/cudoc/node/check"
import { formatCheckResult } from "@cudoment/cudoc/node/report"

const result = checkReferences(library, { ignore: ["unstable-anchor-link"] })
if (result.issues.length) console.log(formatCheckResult(result))
```

Useful beside a watcher: [`watchDocuments`](./api-reference/node.md#watching), which `cudoc collect --watch` runs, reports every pass through `onPass`, and a site can check the pass's library there. See the [Node API reference](./api-reference/node.md#reference-checking).

## What it does not do

- **External link reachability.** Out of scope, as above.
- **Check on its own schedule.** `cudoc check` runs once; for a check after every change, call `checkReferences` from `onPass`.
- **Fixing anything.** It reports. Edits stay with the author.
