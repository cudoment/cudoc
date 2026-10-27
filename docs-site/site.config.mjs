// The cudoc documentation site: this repository's README and docs/,
// exported by cudoc-export with no static site generator. `npm run docs:site`
// copies exactly those files into .cudoc/docs-source/ and builds from there,
// so nothing else in the repository can reach the site.
import { execFileSync } from "node:child_process"
import path from "node:path"
import { demoMounts } from "./demos.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
// Links to source files point at the commit the site was built from: the
// one checked out, which a redeploy of an older release has detached to.
const commit =
  process.env.CUDOC_SITE_COMMIT ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim()

export default {
  sourceRoot: path.join(ROOT, ".cudoc/docs-source"),
  outDir: path.join(ROOT, ".cudoc/docs-site"),
  libraryDir: path.join(ROOT, ".cudoc/docs-library"),
  title: "cudoc",
  // Where GitHub Pages serves the site, for each page's canonical address,
  // its other language under hreflang, and sitemap.xml.
  siteUrl: "https://cudoment.github.io/cudoc/",
  home: "README.md",
  navigation: path.join(ROOT, "docs-site/nav.yml"),
  locales: { en: "English", ko: "한국어" },
  header: {
    links: [
      { title: "GitHub", url: "https://github.com/cudoment/cudoc" },
      { title: "npm", url: "https://www.npmjs.com/package/@cudoment/cudoc" },
    ],
  },
  toc: { depth: 3 },
  themeSwitch: true,
  // A link to a file that is not a page, such as a source file or an
  // example's configuration, opens it on GitHub.
  sourceLinks: {
    root: ROOT,
    url: `https://github.com/cudoment/cudoc/blob/${commit}/`,
  },
  // The committed export samples are published beside the guides that
  // describe them, and the guides' links to them follow.
  mounts: [
    {
      from: path.join(ROOT, "examples/export/showcase-output"),
      to: "showcase",
    },
    {
      from: path.join(ROOT, "examples/export/standalone-output"),
      to: "samples/standalone",
    },
    {
      from: path.join(ROOT, "examples/export/annotate-output"),
      to: "samples/annotate",
    },
    // The host examples, as each host builds them, under demos/: built by
    // `npm run docs:demos` into the directory CUDOC_SITE_DEMOS names, which
    // the deploy sets. Without it the site has no demos and links to none.
    ...demoMounts(process.env.CUDOC_SITE_DEMOS),
  ],
}
