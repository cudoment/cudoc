# Contributing to cudoc

**English** | [한국어](./CONTRIBUTING.ko.md)

This page says how to report a problem, how to set up and make a change, and how a documentation page is written.

cudoc is maintained by one person, so a clear report or a small, focused change goes a long way.

## Reporting a problem

Open an issue with the [bug report form](https://github.com/cudoment/cudoc/issues/new?template=bug_report.yml). It asks, among other things, for the host with its version, the cudoc version and the smallest document that shows the problem; those three usually decide whether it can be reproduced. Check [Supported versions](./docs/README.md#supported-versions) first: a host release outside support is worth reporting, but say so.

A question or an idea is welcome as an issue too. A security problem is reported privately instead, as [SECURITY.md](./SECURITY.md) describes.

## Setting up

cudoc is a workspace of eight packages under `packages/`, with a runnable example per host under `examples/`. Node.js 22.12 or later, which the test tools need (the packages themselves run on any Node.js 22):

```sh
npm ci
npm run build
npm test
```

`npm test` runs three tiers: the packages' unit tests, the shared fixtures compiled by each example's own host compiler, and assertions on the built example sites. A tier whose prerequisite is missing skips and names the command that provides it, such as `npm ci` inside an example; `CUDOC_STRICT=1 npm test` turns any skip into a failure. [`tests/README.md`](./tests/README.md) describes the tiers, and `npm run test:scripts` runs the checks that rebuild the examples and install the packed packages.

`npm run typecheck` and `npm run format:check` are what continuous integration runs besides the tests.

## Making a change

Four rules make a pull request easy to review and verify:

- **Keep it focused.** One problem or one feature per pull request, with a test that fails without the change.
- **Documentation is part of the change.** The [usage guides](./docs/README.md) explain what an author or a site owner does; the [API reference](./docs/api-reference/README.md) states signatures, defaults, stored formats and diagnostics. Update the pages your change affects in the same pull request, the English page and its Korean `.ko.md` counterpart together, written as [Writing a page](#writing-a-page) says.
- **Say what and why.** The pull request describes what changes for a user and why, and which checks you ran.
- **Hosts are real.** A change to syntax, embedding or checking is verified against each host's actual compiler (`npm run test:examples`), not a parser of our own.

Releases are made by the maintainer from the publish workflow; a pull request does not change package versions.

## Writing a page

Every page states its point first and gives the detail after it, so a reader who stops after the first sentence of a page, a section or a paragraph still leaves with the conclusion. `tests/integration/docs-style.test.ts` holds every published page to the part of this that a file can be held to, and `npm run test:examples` runs it.

- **The page opens with its point.** After the title and the language line comes one paragraph of at most 160 characters that says what the page gives the reader. The documentation site writes that paragraph as the page's description, whole. Background, history and the reason the page exists come after it, if at all.
- **A section opens with a sentence.** Every heading is followed by a paragraph that says what the section is for, or by its first subsection, and never directly by a code block, a table, a list or a quote. A heading names its subject: a noun phrase for a concept, a verb phrase for something the reader does, and not the words of the heading above it.
- **A paragraph makes one point, in at most 600 characters.** Its first sentence is the point, and the sentences after it qualify, except or explain; a paragraph has at most five sentences, a list item three. A sentence says one thing, in at most 40 words in English and 120 characters in Korean, spaces not counted. Three or more parallel facts go in a table and parallel items in a list, rather than in a sentence that lists them.
- **Say it once and point to it.** A fact lives on the page that owns it, and another page links to it instead of restating it. A pointer to more detail, `→ [Section](…)`, stands at the end of its paragraph, after the fact and the action, never in the middle.
- **Write what is, in the active voice.** Present tense, the subject first: cudoc resolves the embed, not the embed is resolved. Give numbers and ranges rather than "many" or "large", and name every member of a set or link the page that lists them rather than ending with "etc.".
- **A translation has the structure of its original.** The Korean page follows the English page heading for heading and block for block: the same headings, paragraphs, code blocks, tables and lists in the same order. A Korean sentence ends in 합니다 or 입니다, an instruction in 합니다 or 해야 합니다 rather than 하십시오 or 하세요, and a list or a table keeps one ending style throughout.

## License

By contributing, you agree that your contribution is licensed under the project's [MIT License](./LICENSE).
