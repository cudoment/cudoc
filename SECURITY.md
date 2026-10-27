# Security policy

**English** | [한국어](./SECURITY.ko.md)

This page lists the versions that receive security fixes, how to report a vulnerability privately, and what counts as one.

## Supported versions

Only the 1.x line receives security fixes:

| Version | Security fixes |
| ------- | -------------- |
| 1.x     | Yes            |
| 0.x     | No             |

A fix is released as a patch of the latest 1.x release. cudoc supports Node.js 22 or later; a problem that only appears on a Node.js release past its end of life is out of scope.

## Reporting a vulnerability

Please do not open a public issue. Report it privately on GitHub instead: open the repository's **Security** tab and choose **Report a vulnerability**, or go straight to [the private report form](https://github.com/cudoment/cudoc/security/advisories/new).

Say which package and version are affected, which host it runs in, and give the smallest document or configuration that shows the problem.

cudoc trusts the documents and configuration it reads. Raw HTML and links that an author writes reach HTML output as written on the remark hosts and the standalone compiler, as [the renderer's reference](./docs/api-reference/document.md#components-and-rendering) states. markdown-it refuses a `javascript:` address itself, a shared `linkReferences` address of that kind is refused on every host, and the Word writer drops `javascript:`, `vbscript:`, `data:` and `file:` links, reported as `unsafe-link`.

So the reports that matter most show something no author wrote reaching a reader. They show text that escapes its element or attribute in exported HTML, or a reader's note in the annotate runtime running as script. They also show a Word link that `unsafe-link` missed. And they show a file read or written outside the collection roots, the asset directories, the output directory and the paths the configuration or the command line names, such as the library directory, `css` files, `mounts` and a cover image.

Two places outside that list are written on purpose. A publish writes `<output>.lock`, `<output>.cudoc-staging-*` and `<output>.previous-*` beside each output directory and removes them, and a PDF export prints into a `cudoc-pdf-*` folder in the system's temporary directory.

The report is answered in its advisory thread. Once a fixed release is on npm, the advisory is published, crediting the reporter unless they ask otherwise.
