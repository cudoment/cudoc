/**
 * What each example says about itself in its own navigation: which host
 * release drew the page, and where the Markdown it was drawn from, the guide
 * that sets it up and the other demos are. The documentation site publishes
 * every example's build under `demos/` (`docs-site/demos.mjs`), and this is
 * how a reader who lands on one of them finds the rest.
 *
 * Plain values only, so a Next.js config can hand them to its pages through
 * `env`, which a bundler worker has to be able to serialize.
 */

import fs from "node:fs"
import path from "node:path"

const SITE = "https://cudoment.github.io/cudoc/"
const REPOSITORY = "https://github.com/cudoment/cudoc/"

/**
 * The path a published demo is served under, such as `/cudoc/demos/vitepress/`,
 * or `/` for a build of the example on its own.
 */
export const demoBase = process.env.CUDOC_DEMO_BASE || "/"

/**
 * The commit the Markdown links name: the one a published demo was built
 * from, or `main` for a build of the example on its own.
 */
const commit = process.env.CUDOC_DEMO_COMMIT || "main"

/** The release of `name` installed in the example at `dir`. */
export function installedVersion(dir, name) {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "node_modules", name, "package.json"), {
      encoding: "utf8",
    }),
  ).version
}

/**
 * What an example says about itself: a title naming the host release, the
 * same as a sentence for a host that shows a notice bar, the links that go
 * with it, and the notice as HTML for a host whose bar takes HTML.
 * `example` is its directory under `examples/`, `guide` its guide under
 * `docs/` without the extension.
 */
export function demo({ host, version, example, guide }) {
  const notice = `Rendered by ${host} ${version} with cudoc`
  const links = [
    {
      text: "Markdown source",
      url: `${REPOSITORY}blob/${commit}/examples/fixtures/portable.md?plain=1`,
    },
    {
      text: "Embedded source",
      url: `${REPOSITORY}blob/${commit}/examples/fixtures/reference.md?plain=1`,
    },
    { text: "Setup guide", url: `${SITE}docs/${guide}.html` },
    {
      text: "Example code",
      url: `${REPOSITORY}tree/${commit}/examples/${example}`,
    },
    { text: "All demos", url: `${SITE}docs/README.html#host-demos` },
  ]
  return {
    title: `cudoc on ${host} ${version}`,
    notice,
    links,
    html: `${notice}: ${links.map((link) => `<a href="${link.url}">${link.text}</a>`).join(" · ")}`,
  }
}
