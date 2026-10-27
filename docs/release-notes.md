# Release notes

**English** | [한국어](./release-notes.ko.md) · [All guides](./README.md)

This page lists each version's changes, newest first. All eight packages share one version; [Supported versions](./README.md#supported-versions) says what each kind of release may change.

## 1.1.0

The HTML export takes scripts of your own and lays a site out for a phone, and a tree embed is easier to tap on a host site.

- `scripts` names local JavaScript files an exported page loads after cudoc's own: a site copies them under `cudoc-js/` and loads each with `<script defer>` at the end of `<body>`, and a single page carries their text. Such a page gets the same Content-Security-Policy as `themeSwitch` and names its document in `data-cudoc-document`; the default output stays script-free. → [Scripts of your own](./export.md#look), [Consumer scripts](./api-reference/adapters.md#consumer-scripts)
- On a screen 768px wide or narrower an exported site folds the sidebar behind a menu button in the header, a label for a checkbox that opens it without a script. On a touch screen a folding line and a group's summary are at least 2.75rem tall, and a checkbox in a list takes 2.75rem of its line. → [Look](./export.md#look)
- `@cudoment/cudoc/styles.css` gives a tree embed's folding lines the same touch height on a touch screen, and wraps a long line instead of letting it overflow.
- An authored `data-*` attribute inside a list item reaches the exported page as written, and a test now holds the export to it, so a consumer's hooks cannot be dropped in silence.

## 1.0.0

The first stable release. The public imports, options, syntax, commands, diagnostic codes and stored formats the [API reference](./api-reference/README.md) documents now change only in a major release; a minor release adds to them and a patch release fixes defects ([Supported versions](./README.md#supported-versions)).

- Tabs: fences labelled `tab="…"` and `> [!TAB] Label` blockquotes that follow each other form one group, and with `syntax.tabs` taking host syntax so do Docusaurus's `Tabs`/`TabItem`, Nextra's `Tabs`/`Tabs.Tab`, the `docs` profile's `Tabs`/`TabsContent` and VitePress's `::: code-group`. A page shows them as tabs with no script; the `docs` host draws them with its own `Tabs` and `TabsContent`, `tabElements` names other components, and print, PDF and Word write every tab under its label. → [Tabs](./syntax.md#tabs)
- Code blocks take a title and highlighted lines, `title="retry.js" {2,4-5}`: Docusaurus, Nextra's `.mdx` pages and the `docs` profile are handed their own title attribute, and every other renderer frames the block under the title. The export marks the lines in HTML, PDF and Word, and `syntax.codeMeta` reads each host's own form too. → [Code block titles](./syntax.md#code-block-titles-and-highlighted-lines)
- `variables` replaces `(=name)` everywhere an author writes it, from one table of values, and `linkReferences` defines link labels once for every document. → [Variables](./syntax.md#variables), [Shared link references](./syntax.md#shared-link-references)
- A table cell holding only `^^` or `>>` joins the cell above it or on its left, and `syntax.tableNote` gathers the marked paragraphs after a table into its note, as the `docs` profile's `Footnote` does. The `docs` host draws the note with its `Footnote` again. → [Merged table cells](./syntax.md#merged-table-cells), [Table notes](./syntax.md#table-notes)
- `cudoc check` reads tables from the source (`table-column-count`, `table-unclosed-code`), links that only a case-insensitive disk resolves (`path-case-mismatch`), variables, shared references, table notes and absolute links to your own site once `siteOrigins` lists it. It names the closest real target under `did you mean`, its text report orders each document's issues by position, and on request it reads translations, anchor format, titles, alternative text and unused files. → [Reference checking](./check.md)
- `cudoc lsp` runs that check as a language server in an editor: on every save, with the suggested corrections as quick fixes and `cudoc/counterpart` for a document's translations. → [In your editor](./check.md#in-your-editor)
- Collection writes `pages.json`, each page's title and description, and with `imageSizes` `images.json`, the size of each local image a page shows. An exported site page carries a `<meta name="description">`, and with `siteUrl` (`--site-url`) a canonical address, its translations under `hreflang` and a `sitemap.xml`. → [Library files](./api-reference/node.md#library-files), [Share or deploy](./export.md#share-or-deploy)
- Every `syntax` feature takes `off`, which leaves its syntax as the text it is written as and normalizes no host form of it, so a site turns off what it does not use, such as lists in table cells. → [Choose syntax per feature](./syntax.md#choose-syntax-per-feature)
- A pipeline that draws headings with its own components (`headingMetadata`, `badge` or `tableCellList` in `cudoc-remark`) may now give `syntax` for every other feature, which its Markdown pages take; only the same feature named both ways is refused. → [cudoc-remark](./api-reference/adapters.md#remark)
- `@cudoment/cudoc/present` holds what a page draws for the screen and nothing stored keeps, and `@cudoment/cudoc/node/image-size` and `@cudoment/cudoc/node/lsp` are new entry points. `documentTitle`, `documentDescription` and `frontmatterOf` join `@cudoment/cudoc/query` and `decodeCharacterReferences`, `referencedCharacter`, `readableText`, `normalizeLabel`, `parseCodeMeta`, `resolveVariables`, `replaceVariables` and `resolveLinkReferences` `@cudoment/cudoc/document`, `visibleHeadingText` takes an optional reader, and `RenderOptions.highlight` receives the code node.
- The documentation site publishes every host example as its own host builds it, under `demos/`: the same two Markdown files rendered by Next.js, Docusaurus, Nextra, VitePress and Eleventy. Each page names the host release and links the Markdown it was built from, its guide and its code, and the guides and the package READMEs link their host's demo. → [Host demos](./README.md#host-demos)
- Supported versions also gives what a new project installed on the date shown was checked with, and names what stays outside support whatever the declared ranges allow: Nextra 4.6.1 beside zod 4.4 or later, Nextra under Turbopack, and markdown-it 15. The Nextra guide says which Nextra release to stay on and how to build on Next.js 16, and the Next.js and Eleventy guides that a link to a `.md` file stays as written there. → [Supported versions](./README.md#supported-versions)
- An exported page wraps a long inline code span inside its column, where it ran under the contents beside it and widened a phone's page.
- On VitePress a character reference such as `&copy;` or `&nbsp;` shows the character again, as VitePress alone draws it, in prose and in a callout's title, where it showed as written before.
- On VitePress a brace written as a reference, `&#123;`, stays one, so Vue does not read `{{` as an interpolation, in a list inside a table cell too. A page title, a description, the export's contents and Word body text read it as the brace. A string cudoc writes into a page, such as a `[[toc]]` label, an embed table's title or a tab label, keeps the reference as VitePress's own `[[toc]]` does, and shows it spelled out.
- A Word file made from a VitePress library leaves out each heading's permalink, which it wrote as an empty link with a `dropped-html` warning, or as code under `rawHtml: "text"`.
- A heading records the badge it shows in `data.cudoc.badge` whether a `(@…)` marker, an `Anchor`'s `badge`, a `Badge` component or a VitePress `<Badge>` wrote it, so `getHeadingBadge` reads every form.
- `cudoc dataset` reads the library its `inputDir` belongs to when no `library` is given, so a dataset made straight from a collection leaves out private documents and takes the root bases for scopes. → [AST datasets](./dataset.md#choose-content)
- `invalid-anchor-format` is placed on the heading rather than on a code example that spells the same marker earlier, and an empty `exclude`, `private` or `unusedAssets` pattern names its option.
- An exported page's contents link within the page under every link policy that keeps links. Under `host` they named the deployed page, so a single page sent offline sent its reader to the site.
- A PDF links a sibling file relatively, as `reference/limits.pdf`. The browser wrote each such link as an absolute `file:` URL into the staging directory of the machine that printed it, so the link broke once the output was published and showed that machine's path.

To act on when upgrading:

- cudoc needs Node.js 22 or later. Node.js 20 reached its end of life on 2026-04-30, and continuous integration now runs on Node.js 22, 24 and 26.
- Merged cells, code titles and tabs are on by default. A table cell that is only `^^` or `>>` merges, so write it as `\^\^` or in code to keep it as text. A fence's `title="…"` now draws a title, so a site that reads that meta itself sets `syntax.codeMeta: "host"`, and a blockquote opening with `[!TAB]`, reported as an unknown callout before, is a tab.
- The check reports more. `table-column-count`, `table-unclosed-code`, `path-case-mismatch` and, once `variables` is set, `undefined-variable` are errors, so a build that runs `cudoc check` can fail on a table or a link that rendered wrongly but quietly before. A reference-style link or image is now checked through its definition on every host, as only the markdown-it hosts checked it before.
- An issue's `reference`, and so `cudoc check --format json`, gives a link as the source spells it, `./guide.md` where a host stored `guide`, rather than the form the host stored. A tool that matches issues by that text reads the source's spelling now.
- A site stylesheet that restyles cudoc's classes may want to cover `cudoc-code`, `cudoc-code-title`, `cudoc-table-note` and the `cudoc-tab*` classes, which `@cudoment/cudoc/styles.css` and the export style. A Word file gains the paragraph styles `CudocCodeTitle`, `CudocCodeHighlighted`, `CudocTabLabel` and `CudocTableNote`, which a restyled template may want to cover too.
- Front matter stays in the tree for the remark plugins after cudoc's. A Nextra page lost it before, so Nextra titled the page from its first heading and ignored settings such as `sidebarTitle`, and remark-mdx-frontmatter placed after cudoc found none.
- The Docusaurus and Nextra libraries stored no front matter before, so an export's titles and descriptions read the page as if it had none. Every library collected before is collected again in full, since the cudoc version is part of its configuration.
- Custom `transforms` now meet the page's `yaml` node, and an exported AST (`@cudoment/cudoc/embed`) drops `yaml` and `toml` nodes by default (`DEFAULT_DROPPED_NODE_TYPES`).
- Nextra is supported on the releases that build, 4.6.0 and, with zod pinned below 4.4, 4.6.1, rather than on every later 4.x. A Nextra site stays on 4.6.0, or on 4.6.1 adds `"zod": "4.3.6"` to its `overrides`, and on Next.js 16 runs `next dev --webpack` and `next build --webpack`.
- On a Docusaurus or Nextra page cudoc normalizes, `promoteAnchorIds` no longer gives a heading the id of an `<Anchor>` written in it. Normalization reads that id while `headingAnchor` takes host syntax, as it did before.
- An exported page, its navigation entry and the running header take the title `documentTitle` reads. That is a front matter `title` that is not empty, else the first `#` heading wherever the host put it, else the first heading of any depth. 0.9.0 took `title` even when it was empty, and otherwise the first heading at the top level of any depth.
- `cudoc-export/print` exports `writePrintOutputs`, `printStylesheet`, `fillVolumePageNumbers`, `resolveVolumeOptions`, `volumeId`, `printFileName`, its constants and its types. The steps the print HTML runs on a page, such as `namespaceIds`, `localizeAssets` and `urlPath`, are internal now.
- The compile diagnostic `duplicate-heading-id` is `DUPLICATE_HEADING_ID`, written as the other compile diagnostics are, so an `ignoreDiagnostics` list naming it names the new code.
- A Word file keeps a `file:` link as its text, reported as `unsafe-link`, as it does a `javascript:` link, since it would open a file on the reader's machine or network.
- `cudoc lsp` collects nothing when the library in `outDir` was collected with another compiler or for another host than its configuration names, and logs an error naming both, rather than replace the library a site's build reads.
- `cudoc-export` no longer exports the internal `LinkTarget`, `StagingContext` and `InternalOptions`, nor the `buildSite` signature that took them. `buildSite` takes `SiteOptions` and returns `SiteResult`, and refuses `afterStaging` and `printOutputs` as unknown options.
- On a host site a `caution` callout, which `danger` and `error` are read as, is red as it is in the export. `@cudoment/cudoc/styles.css` drew it amber like a warning.
- A dataset made from a library's `documents` directory with root bases now scopes after the base. Copy the ASTs elsewhere for first-segment scopes.
- `buildExport` refuses an unknown key in `page`, `page.margin`, `pdf`, `docx`, `volume.cover`, `volume.contents` and `tokens`, a `page.orientation` other than `portrait` or `landscape`, and a caller's `afterStaging` or `printOutputs`. It ignored each of them before.
- A per-language `header.links` title needs `locales` and may name only its codes, as a navigation title does.
- A Docusaurus site that follows the guide raises its `serialize-javascript` override to 7.1.3, the release that fixes [GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v).
- Nextra 4.6.0 and Nextra 4.6.1 with zod pinned both run a zod older than 4.6.6, which fixes [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), and Nextra 4.6.1 does not build with zod 4.6.6. `npm audit` reports the advisory for the zod 4.3.6 pin only, not for the zod 4.0 beta that Nextra 4.6.0 ships. The guide recommends 4.6.0, the release cudoc is tested with, which builds without an override.

## 0.9.0

Eleventy front matter is read without `gray-matter`, an exported home page lists its contents, the language and theme menus are drop-downs, and the examples are tested on Next.js 16.4.2, Nextra 4.6.0 and Eleventy 3.1.7.

- `cudoc-eleventy` no longer depends on `gray-matter`. It splits front matter by the same rules Eleventy's gray-matter does, so collection still renders the text Eleventy renders, and reads YAML front matter with the YAML parser the other hosts use and `---json` front matter as JSON. → [markdown-it internals](./api-reference/adapters.md#markdown-it)
- A `MarkdownItHost`'s `frontmatter` hook receives the collected document's `id` and `filePath` as a second argument.
- The Docusaurus guide pins `postcss-selector-parser` 7.1.6 and `tinypool` 2.2.0 beside its other `overrides`.
- The examples are tested on Next.js 16.4.2, Nextra 4.6.0 on Next.js 15.5.28 and Eleventy 3.1.7, whose dependencies carry none of the advisories `npm audit` reports for Eleventy 3.1.6. → [Supported versions](./README.md#supported-versions)
- An exported site's home document lists its contents on the right like every other page. A page with no heading to list leaves that column out instead of drawing it empty, and a generated landing page uses the whole width instead of the sidebar's narrow column. → [Home, header and contents](./export.md#home-header-and-contents)
- The language menu is a drop-down that shows the page's language and opens the others, and the theme menu is the same drop-down instead of the browser's own select. Both are drawn in the site's colours, and a press elsewhere closes them without a script; with `themeSwitch`, Escape does too.

To act on when upgrading:

- An Eleventy page whose front matter is JavaScript (`---js`) fails collection, naming the file, instead of having its front matter evaluated. Write it as YAML.
- An Eleventy page's front matter is read as YAML 1.2, as on the other hosts. A date is collected as the text it was written as rather than as a date, `<<` is an ordinary key rather than a merge, and front matter that is not a mapping fails collection, naming the file.
- A Docusaurus site that follows the guide adds the two new `overrides` and installs again.
- Next.js is supported from 16.4, the release the example is now tested on; a site on Next.js 16.3 upgrades to stay supported.
- A `css` file that restyled the language links (`.languages ul`, `.languages a`) or the theme select (`.theme-switch select`) restyles `.menu > summary` and the `.menu-list` items instead.

## 0.8.0

HTML export gains three modes (`site`, `standalone` and `annotate`), a hosted review, a `navigation` file, `locales`, a `css` list and a theme menu with Light and Dark, and cudoc's documentation becomes a website built by `cudoc-export`.

- HTML export has three modes. `mode: "site"`, the default, writes the site; `mode: "standalone"` writes each document as one HTML file that carries its styles, pictures and theme menu, to send as an attachment and open from any folder; `mode: "annotate"` writes pages that collect review notes.
- `documents` (`--document`) picks the pages a single-page run writes, a single-page run lists what each page needs from outside in `dependencies` and on standard error, and `strict` (`--strict`) fails a page that needs anything. → [Three kinds of HTML](./export.md#three-kinds-of-html)
- A review can be hosted: `annotate.target: "hosted"` writes a site with the review-note runtime beside its pages, its notes kept apart by a required `reviewId`. `annotate.inbox.github` adds _Compose on GitHub_, which opens a repository's issue form with the notes filled in, and a saved copy of a single page opens with its styles and notes from any folder. → [Collect feedback](./export.md#collect-feedback-on-the-exported-site)
- `navigation` is a YAML file or a list: a file entry is that document, a folder entry everything in it, shaped with `exclude`, `order`, `page`, `depth` and `collapsed`, plus groups and links out. `hidden` publishes a document without listing it. What the navigation lists, and the home page, is what every format publishes, and the result's `omitted` names each document left out and why. → [The navigation](./export.md#the-navigation)
- `locales` adds languages found by file suffix, `guide.ko.md` for the Korean `guide.md`; each language draws its own navigation, home and language menu, and `ui` gives the page's words for a language cudoc does not carry. `home`, `header.links` and `toc` shape the rest of the shell, and `sourceLinks` and `mounts` send links to files that are not documents to the repository or to folders copied into the site.
- `css` takes a list. A site links each file under `cudoc-css/` and copies what it loads beside it; a single page carries the text inline.
- The theme switch is a menu with Light and Dark instead of a button that cycled through System, Light and Dark. Until the reader chooses, the page follows the system setting and the menu shows which one it is; its words follow the page's language, and `ui` no longer has a `system` word.
- The floating note button goes away when the reader clicks elsewhere, presses Escape or clears the selection, and Tab reaches it from a keyboard selection.
- The bound volume holds the default language's documents in navigation order, then the `hidden` ones, and `volume.order` moves the documents it names to the front; a translation is written as its own PDF and Word file.
- cudoc's documentation is now a [website](https://cudoment.github.io/cudoc/index.html) built by `cudoc-export` from the README and `docs/`, with the export samples beside the guides. The publish workflow deploys it once every package of a release is on npm from that commit and tagged there, and refuses to put an older version over a newer one unless a manual run asks for a rollback.
- The annotation report prints the library path relative to the working directory, and a saved review page may be up to 32 MiB.
- `@cudoment/cudoc/node/library` exports `globToRegExp` and `globMatcher`, and `@cudoment/cudoc/node/resolve-embed` exports `compareNames`, `documentName` and `nfc`.

To act on when upgrading:

- `annotations: true` and `--annotations` are gone. `mode: "annotate"` (`--mode annotate`) replaces them and writes single pages by default; `annotate.target: "hosted"` with a `reviewId` gives the site-wide runtime the option used to add.
- A navigation entry names a document with its extension, `guide.md`; a name without one is a folder. Documents the navigation leaves out are no longer appended after it: list them, name them in `hidden`, or leave `navigation` out to list every document. A link to a document the site does not publish is an error under `relative` links.
- `buildSite` and `buildExport` refuse an option they do not know, naming it.
- `css` files are linked after `cudoc.css` as files of their own rather than appended to it.
- A home page has no contents column, and the site title in the header links to the language's home rather than the first document in the navigation.
- The documentation site replaces the export showcase at the root of GitHub Pages; the showcase is at `showcase/`.

## 0.7.0

A `render: { type: tree }` embed draws a folder's documents as a folding tree, `resolveTree` returns its lines as data, `cudoc check` warns when a tree's `order` matches nothing, and a copy inside a copy rebases each link once.

- A [`render: { type: tree }` embed](./embedding.md#draw-a-tree-of-documents) lists documents the way their folders nest them, `X.md` above the folder `X/` or a folder's own `index.md` above the rest, with a document's sections under it when `headings` asks. Each takes one line, the title linked and the summary beside it, and levels fold in `details` that open without a script on every host and in standalone HTML. The print HTML, the PDF and Word write them out as a nested list down to `print` levels.
- `resolveTree` returns those lines as data, the same for the same library and spec, for a program that writes the tree in a form of its own; `buildEmbedTree` renders lines it was given.
- In a tree, an extractor also receives the line it computes as `node`, with the lines below it already complete, so a column can total what the levels below hold.
- `cudoc check` warns with `unmatched-tree-order` when a tree's `order` names nothing on its first level, and reports a tree's missing folder or document as for any embed.
- `@cudoment/cudoc/styles.css` and the exported site draw a tree as an outline, without the box a host gives an authored `details`.
- A copy inside a copy rebases each link once. When `routes` gives one document another document's path, a link in a nested copy, summary table or tree keeps the route it was given instead of turning into the other document's route. A relative path that climbs out of the collection keeps naming the same file.

## 0.6.0

Supported versions are written down, `cudoc-docusaurus` and `cudoc-eleventy` declare the host releases they support, and every host guide is followed in a new project before a release. Collection, `cudoc check`, embedding, the export and Word gain the fixes below, including the calls that change from 0.5.

- [Supported versions](./README.md#supported-versions) lists the host releases every change is tested against, and what a minor or a patch release keeps compatible before 1.0.0.
- `cudoc-docusaurus` declares `@docusaurus/core` `^3.10.0` and `cudoc-eleventy` declares `@11ty/eleventy` `^3.1.0`, the releases each supports, so npm installs either only beside a supported host: it raises the host where the site's own range allows, and otherwise refuses with `ERESOLVE`.
- Each host guide shows every file it asks for and installs every package those files import, and is followed step by step in a new project before a release. The VitePress and Eleventy install lines no longer name `cudoc-markdown-it`, which their adapters bring.
- The Docusaurus and Nextra guides pin the fixed releases of host dependencies that `npm audit` reports advisories for, as the examples do, and the guide check fails when a site built from a guide reports an advisory its example does not. The Next.js example and guide are tested with Next.js 16.3.8, which fixes a critical advisory in `next/og`.
- Recovery after a killed build moves or removes only a directory that carries cudoc's exact ownership marker under a name cudoc gave it, so a directory someone else put beside the output is left alone. A leftover that cannot be removed fails the publication without keeping the lock.
- A root nested in another owns its files: each is collected once, under the inner root's base, a root reached through a symbolic link is matched by its real path, and one directory listed twice that way is refused.
- A Word table keeps a header cell's `min-width` on the column the cell stands in when a cell above it spans rows.
- The README and the dataset guide describe the dataset as it is: documents as collected, each embed kept as the block that names its source, and no deduplication.
- An `index.md` takes its directory's route when `routeSuffix` is `""` or `"/"`, `/docs/` rather than `/docs/index`, so a `guide.md` beside `guide/index.md` now fails with `duplicate document route` there. A link to a directory, `..` included, reaches that directory's index document in `cudoc check`, in embedded content and in the export, and `guide/` does so even beside a `guide.md`.
- A Markdown image that Docusaurus turns into its own image element is recorded when the page is collected, so an embed, `cudoc check` and the export all treat it as an image. It is checked as an asset, copied and drawn in Word, and a page in another directory that embeds it requires the image's file by a path from its own directory, as it does a linked local file.
- The Docusaurus collector the guide shows looks for root-relative images in `static`, as the site build does, and records an image written as `@site/static/…` at the address the site serves it from, through the new `aliases` option of `createCompilerCapture`.
- Raw HTML in an embedded section has its `poster`, `data`, `srcset` and `xlink:href` paths moved to the page that embeds it, as its `href` and `src` already were, so the export finds every resource it loads.
- The export writes each copied file's path as a URL, so a file name with a space, a comma, `%`, `#` or `?` loads from `src` and from `srcset` alike. A link to such a file reaches it from the site, the print HTML and Word.
- Under `links: "host"` a link to a `private` document names its deployed address in the bound print HTML, PDF and Word as well, as each document's own file does, instead of an anchor or bookmark the volume does not hold.
- A resource that reaches a `private` document's file, through its root, an `assetDirs` directory or a symbolic link, stops the export under every policy instead of copying the document's source into the output.
- A relative path in an embedded section that climbs out of the collection keeps pointing at the same file from the page that embeds it, instead of being clamped at the root to another file.
- On VitePress and Eleventy an image's alt text is its label as plain text, code and entities included, as on the remark hosts; Eleventy had written it empty.
- The configuration hash includes the `@cudoment/cudoc` version, so the first collection after an upgrade, `cudoc collect --watch` included, compiles every document again instead of reusing trees the previous release produced. Collect again after upgrading: a library the previous release wrote is read as it is.
- For an embed, `cudoc check` offers heading ids only as `available`, since an id raw HTML declares starts no section, and it names the document once in `no sections matched`.
- `cudoc check` finds an embed's fence by parsing the source as Markdown (MDX for `.mdx`) and matching each fence to its block by text. So a `cudoc-embed` fence shown inside a longer fence or an indented code example no longer takes the line of the embed after it, and an embed inside a quote, a callout or a list item keeps its own line. The column then counts from the start of the line, and a block the host reads differently from Markdown gets no position rather than the line of a block with other text.
- `cudoc-eleventy` handed to `eleventyConfig.addPlugin` says to pass `createMarkdownRenderer` to `setLibrary` instead of failing inside markdown-it.
- `cudoc check` reads the library `collect` wrote and writes nothing, so checking no longer rebuilds or removes `embeds.json`; run it after collecting.
- The library and its prepared embeds are published together, so a collection or watch pass that fails leaves the last good pair in place. A second writer is refused naming the process that holds the output, and a lock left by a crashed run is recovered.
- `cudoc collect` names every embed it cannot prepare, with its file and block number, in one message, and prints cudoc's own errors without a stack trace.
- `cudoc check` reports an embed that includes itself (`cyclic-embed`), counts ids declared in raw HTML as anchors, and reports a link with a malformed `%` instead of stopping. It resolves embed sources exactly as the build does, applies `select` beside a section named in the source as the build does, and reads an embed's copy after its `replace` rules have rewritten it. So it inspects what is copied and fails where the build fails.
- On VitePress and Eleventy, a diagnostic `cudoc collect` reports for a document with front matter names the line in the file rather than the line in the body.
- On VitePress and Eleventy a document saved with `\r\n` line endings is collected, embedded and rewritten as one saved with `\n`. Its positions and section ranges point into the file's own text rather than into the text markdown-it reads, where collection had stopped with `cannot map processed Markdown back to source`, and a page rendered against the library is matched to it. An Eleventy site no longer refuses every such page as rewritten by another template engine, and `cudoc-markdown-it` exports `markdownItText`, the source as markdown-it reads it with a map of its offsets back to the source.
- Two headings with the same id each keep their own section when embedded, while the duplicate is still reported, and a `replace` rule on such an id is refused instead of rewriting the first section twice.
- A `replace` rule on a section whose heading sits inside another block rewrites the section's text as it reads on its own. A list item's marker and indentation are taken off, so a section in a list item is rewritten into the structure that was collected on every host.
- Where something of the block would stay in the text, the rule is refused, matching or not, with a message that says which. The part that would stay is a quote's or callout's `>`, a footnote's indentation, or the closing line of a component or `:::` container after its last section. `cudoc check` reports that case as `unreplaceable-embed-section`, and the section still embeds without rules.
- A link inside embedded content that names only an anchor or a query points at the document it came from.
- `cudoc collect --watch` also collects again when a directory is renamed or removed, and hands a watcher error to `onError` instead of ending the process.
- On VitePress and Eleventy, whatever cudoc does not change is rendered by the host itself: code highlighting, `<script setup>` and `<style>` blocks, emoji, `[[toc]]`, code groups and the site's own containers, whose content cudoc still reads. A heading whose text slugs to an id written on another heading is numbered past it, and `[[toc]]` links to the ids cudoc settles. VitePress `rewrites` work, a page that combines `<!--@include-->` with an embed fails with a clear message, and diagnostics are printed or passed to `onDiagnostic`.
- Docusaurus keeps the heading ids cudoc settles, so `(#v1.2)` stays `v1.2` there; Nextra still slugs every id, and ids of lowercase letters, digits and hyphens are the same on every host.
- The adapters refuse options that are theirs to set (`host`, `headingIds` and `toc` on Docusaurus and Nextra, `components` on markdown-it) instead of ignoring them.
- Upgrading from 0.5 changes these calls. `createHostPlugins(options, adapter, host)` takes the host, `"docusaurus"` or `"nextra"`, as a required third argument. Paths below `/transforms/table-cell-list` and `/transforms/table-column-layout`, such as `/transforms/table-cell-list/index`, no longer resolve, and `tokensToAst` without `render` throws on a container that is not a callout rather than reading it as one.
- Upgrading from 0.5 also changes these results: `readPreparedEmbeds` returns one cached object shared between calls, so copy a block before changing it. The print pipeline marks an asset with `data.cudocAssets`, a list of `AssetMark`, rather than `data.cudocAsset`. A document's anchor in a bound volume is `cudoc-` followed by `idToken(id)`, so a link into the volume's print HTML for an id holding a `/` changes: `#cudoc-guide%2Fstart` becomes `#cudoc-guide_2f_start`.
- `@cudoment/cudoc/transforms/table-cell-list` and `/transforms/table-column-layout` are explicit entries, and `cudoc-remark` no longer installs `remark-gfm`, `remark-mdx` or `remark-parse`. The type packages the declarations need are dependencies, apart from `@types/markdown-it`, an optional peer of the markdown-it adapters. Every package exports `./package.json`, and `snapshotSource` is no longer exported from `@cudoment/cudoc/node/library`.
- A paper or margin length in `pt`, or a bare number read as millimetres, prints at the same size in PDF as in Word, and heading ids outside ASCII link inside a bound volume. A link to another bound document prints its deployed address under `linkUrls` without upsetting the contents page numbers, and `srcset`, `poster`, `<object>` and SVG image assets are copied. `srcset` is read as browsers read it, so a data URL keeps its comma and an empty candidate is skipped, and a Word link decodes a percent-encoded anchor so it reaches the heading's bookmark.
- Word carries row spans of HTML tables in MDX, within their row group as browsers draw them and `rowspan="0"` included, the start number of a top-level ordered list, task checkboxes and line breaks in cells. It reports a table it drops from a footnote and drops `javascript:` link targets.
- A `CAUTION` callout is drawn in the danger colour in HTML and PDF, as it already was in Word, and the PDF running header and footer take their font, size and colour from the design tokens.
- An authored page break next to a wide table that gets a landscape page, an HTML comment between them or not, no longer leaves a blank page in PDF or Word. A page break that opens a document is dropped in both, so the document's start bookmark and its first block's portrait page survive.
- Review notes accept ISO 8601 dates only and store them in UTC; a damaged saved copy, a malformed share link or a file over the size limit shows a message instead of stopping the panel.
- `CUDOC_SKIP_BROWSER_DOWNLOAD=0` or `false` installs the browser rather than skipping it; like Playwright's own variable, it is compared exactly, so `FALSE` skips.

## 0.5.0

PDF and Word output join the HTML site, with a bound volume, one `page` setting, review notes and a theme switch. Embedded sections are spliced into MDX pages as they compile, a table embed defines its own columns, `roots` collects several directories into one library, `cudoc collect --watch` collects again on every change, and `cudoc-html` becomes `cudoc-export`.

- PDF and Word output beside the HTML site, from one call and one set of design tokens.
- A `cudoc-pagebreak` fence forces a page break in the paginated formats and renders nothing on a site.
- Every document set also exports as one bound file, with cross-document links resolved inside it, opening with a cover and a contents page in both PDF and Word.
- One `page` setting gives PDF and Word the same paper, running header and footer, page breaks before headings, landscape pages for wide tables and printed link addresses.
- `annotations: true` ships a review-note runtime with the HTML site: whoever receives the files can select text or a block, leave notes and hand them back as a file or a share token. `cudoc-export annotations` maps them to Markdown source lines in a facts-only report.
- `themeSwitch: true` adds a System / Light / Dark button to the HTML site's header, remembered per browser; without it the stylesheet keeps following the system setting with no script.
- On an MDX host an embedded section is spliced into the page as it compiles, so the components it contains render through the host's own component mapping and its code blocks reach the host's highlighter. The embed plugin no longer renders an HTML string, `cudoc-remark/runtime` is gone, and `cudoc-remark/loader` keeps a recollection visible to the dev server and the build cache. `cudoc check` reports a copied component whose import stays behind in its source file.
- A table embed can define its own columns: where each cell's text comes from, what it links to and how wide it must stay. A cell's text can come from the section title, its first paragraph, the heading above it, a cell of a table inside it, or a function registered in the collection config. `cudoc check` reports every cell a defined column leaves empty.
- `roots: [{ dir, base }]` collects several directories into one library, each under its own URL prefix, so `/docs/…` and `/terms/…` links, embed sources and exports all mean the same document. `exclude` leaves non-documents out, `private` keeps in-house documents collected and checked but out of exports and datasets, and `externalPaths` tells the checker and the exporter which paths on your domain belong to another application.
- `tableColumnWidths` gives a table column a minimum width by its header text, per section or everywhere, so authored tables need no `<div style>` in their cells; the HTML site, the paginated formats and Word all honour it.
- `ignoreDiagnostics` silences a diagnostic code a project has decided to live with, and `loadLibrary(…, { cache: true })` lets a server reuse the loaded library between requests until the collection changes. What a consumer of the stored trees may rely on under `cudocAstVersion: 1` is now written down.
- `cudoc collect --watch` collects again whenever a document changes, compiling only the documents whose text changed and resolving only the embeds that read them. A `previous` library or preparation gives any collector the same saving, and a document that fails to compile is a message rather than a broken library.
- `cudoc-html` is now `cudoc-export`, which is what it builds.

## 0.4.0

`cudoc check` arrives, embed problems and duplicate heading ids become diagnostics, and the guides are reorganized around choosing a host.

- `cudoc check` finds every broken link, anchor, image and embed across a document set in one pass, from the CLI or as a function.
- Embed problems are reported instead of passing silently, each naming the document and the line: an unrenderable component, a `replace` rule that matches nothing, an unknown key, a block that does not parse.
- A duplicate heading ID is a diagnostic rather than a stop.
- Guides reorganized around choosing a host.

## 0.3.0

Eleventy support arrives, and the standalone HTML and the host stylesheet are rebuilt on redefinable tokens with dark themes.

- Eleventy support, on a markdown-it layer now shared with VitePress.
- Standalone HTML and the host stylesheet rebuilt on redefinable tokens, with dark themes.

## 0.2.0

Shared document normalization, section embedding, AST datasets, VitePress support and standalone HTML export arrive.

- Shared document normalization, section embedding and AST datasets.
- VitePress support, and standalone HTML export alongside any host.

## 0.1.0

The shared AST core moves into `@cudoment/cudoc`.

- The shared AST core moved into `@cudoment/cudoc`, with browser-safe APIs beside the Node entry points.
