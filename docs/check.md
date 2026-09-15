# Reference checking

**English** | [한국어](./check.ko.md) · [All guides](./README.md)

`cudoc check` reads a collected library and reports every reference that does not resolve — links, anchors, images and embeds — in one pass.

The build already refuses to ship a broken link. That makes it a poor way to _find_ them: you fix one, rebuild, and learn about the next. Checking walks the whole set instead and prints everything at once, without writing any output.

```sh
cudoc check --config cudoc.config.mjs
```

It resolves through the same code the build uses, so a reference this calls fine is a reference the build can resolve.

## Add it to your build

Run it between collection and the site build. It reads the collection, so it needs no configuration of its own.

```json
{
  "scripts": {
    "collect": "node collect.mjs",
    "check": "cudoc check --config cudoc.config.mjs",
    "build": "npm run collect && npm run check && docusaurus build"
  }
}
```

Errors exit `1`. Warnings do not, unless you pass `--strict`.

## What it reports

| Code                          | Severity | Meaning                                                           |
| ----------------------------- | -------- | ----------------------------------------------------------------- |
| `missing-document`            | error    | A local link names no collected document and no file              |
| `missing-anchor`              | error    | The document exists; that anchor does not                         |
| `missing-asset`               | error    | An image has no file under `sourceRoot` or any asset directory    |
| `missing-embed-source`        | error    | An embed names a document that was not collected                  |
| `missing-embed-anchor`        | error    | The embed source exists; that section does not                    |
| `duplicate-anchor`            | error    | Two headings in one document claim the same anchor                |
| `empty-anchor`                | error    | An anchor marker with no id, left in the heading text             |
| `invalid-embed-spec`          | error    | An embed block does not parse, or names a key that does not exist |
| `unmatched-embed-replacement` | warning  | A `replace` rule found nothing to change                          |
| `unstable-anchor-link`        | warning  | A link depends on a generated anchor that document order can move |
| `unportable-embed-component`  | warning  | An embed copies a component that standalone HTML cannot render    |

External URLs are out of scope. Checking whether `https://example.com` is reachable is a network job with different failure modes, and it belongs in a separate tool.

## Reading the output

```
docs/guide.md
   4:14  error   missing-anchor       reference.md#limit
         reference has no anchor #limit
         available: #limits, #authentication, #retry, #backoff (+2 more)
   6:12  warning unstable-anchor-link reference.md#overview-1
         #overview-1 in reference is generated from a repeated heading; …

1 error, 1 warning in 1 of 14 documents
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

So the warning fires at the only moment it can be caught: when the link is written. Give the target heading an explicit anchor and the problem cannot occur.

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
   6:12  warning unmatched-embed-replacement was reworded away
         replacement 1 found no "was reworded away" in what this embed copies
         from reference, so nothing was changed. …
```

A rule list applies to every selected section, so a rule aimed at one section of a `depth: 2` selection finds nothing in the others by design. Only a rule matching **none** of the selected sections is reported. Rules are tested in order, each against what the previous one produced, exactly as the resolver applies them. → [Find and replace](./embedding.md#find-and-replace)

## Malformed embed blocks

An embed block is YAML. One that does not parse, or that names a key cudoc does not have, is reported with the line inside your file rather than inside the block:

```
   8:12  error   invalid-embed-spec   embed block 1
         replace[0]: unknown key "regexp". Known keys: find, replace, regex, flags
```

`regexp` instead of `regex` used to be accepted silently, turning a pattern into a literal that matched nothing. Unknown keys are now rejected at all three levels: the block, `select`, and each `replace` rule.

## The unportable-component warning

A component is fine in the document that owns it: the host that registers it renders it. An embed changes that. The copy lands in another document, and standalone HTML export then has to render a name it was never given.

`widget.mdx` holds a component. `guide.md` embeds that section:

````md
```cudoc-embed
sources: [widget.mdx#live]
```
````

Your site renders it, because your site registers `Chart`. `cudoc-html` has no such registry, so it refuses:

```
cudoc: no portable renderer for Chart at line ?
```

The warning moves that failure from export time to check time, and names the component:

```
   4:11  warning unportable-embed-component widget.mdx#live
         this embed copies <Chart> out of widget. …
```

It inspects what the embed would actually copy, not the whole source document. A `select` or `includeChildren: false` that leaves the component out keeps the warning quiet, and a `render: { type: table }` embed is skipped entirely, because only heading text travels.

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

| Option       | Effect                                                            |
| ------------ | ----------------------------------------------------------------- |
| `ignore`     | Codes to leave out of the result entirely                         |
| `assetDirs`  | Extra roots for images, matching your host's `public` or `static` |
| `sourceRoot` | Overrides the library's own source root                           |

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

Useful when your site already has a watcher: cudoc provides no collection watcher of its own, because collection calls the host compiler and is too expensive to run on every keystroke. A site that already watches its sources can call this after each collection. See the [Node API reference](./api-reference/node.md#reference-checking).

## What it does not do

- **External link reachability.** Out of scope, as above.
- **Collection watching.** `checkReferences` is a function; the watching is yours.
- **Fixing anything.** It reports. Edits stay with the author.
