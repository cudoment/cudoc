// Builds the five host examples for the documentation site, which publishes
// each one under demos/<name>/: the example as it is, installed from its own
// lockfile, so a demo shows the host release the support table says is
// tested. Each build is told the path it is served under through
// CUDOC_DEMO_BASE and leaves its static files in .cudoc/docs-demos/<name>/,
// which `npm run docs:site` publishes when CUDOC_SITE_DEMOS names that
// directory. Install each example (`npm ci` inside it) and build the
// packages first.
//
// An example's own pages stay as they were, so the built-site tests still
// read them: Docusaurus, VitePress and Eleventy write the demo to another
// directory, and the two Next.js examples, which build in .next whatever they
// export, have their .next moved aside meanwhile and put back afterwards, or
// on the next run if this one was stopped. Each build collects again first,
// as `npm run build` does, so the collected library under .cudoc/ is the
// demo's until the example's own next build; only VitePress's differs, by the
// routes it collects below the demo's path.
//
// Each demo links the Markdown it was built from at the commit the site is
// built from, which CUDOC_DEMO_COMMIT carries to its navigation.
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const ROOT = path.resolve(import.meta.dirname, "..")

/**
 * The demos: the folder each is published in, its example, the page a
 * reader starts from, and the build that writes it into `out`.
 */
export const DEMOS = [
  {
    name: "next",
    example: "next-mdx",
    page: "portable/index.html",
    exported: "out",
    build: () => ["run", "build"],
  },
  {
    name: "docusaurus",
    example: "docusaurus",
    page: "docs/portable/index.html",
    build: (out) => ["run", "build", "--", "--out-dir", out],
  },
  {
    name: "nextra",
    example: "nextra",
    page: "portable.html",
    exported: "out",
    build: () => ["run", "build"],
  },
  {
    name: "vitepress",
    example: "vitepress",
    page: "portable.html",
    build: (out) => ["run", "build", "--", "--outDir", out],
  },
  {
    name: "eleventy",
    example: "eleventy",
    page: "portable/index.html",
    build: (out) => ["run", "build", "--", `--output=${out}`],
  },
]

/**
 * The site's mounts for the demos built into `dir`, or none without one. A
 * demo missing there stops the site build rather than publishing fewer.
 */
export function demoMounts(dir) {
  if (!dir) return []
  return DEMOS.map(({ name, page }) => {
    const from = path.resolve(dir, name)
    if (!fs.existsSync(path.join(from, page)))
      throw new Error(
        `docs-site: ${from} holds no built ${name} demo; run npm run docs:demos`,
      )
    return { from, to: `demos/${name}` }
  })
}

/**
 * Builds every demo for the site served at `siteUrl` into `outDir`, linking
 * its sources at `commit`.
 */
export function buildDemos({ siteUrl, outDir, commit }) {
  const sitePath = new URL(siteUrl).pathname.replace(/\/?$/, "/")
  fs.rmSync(outDir, { recursive: true, force: true })
  for (const demo of DEMOS) {
    const dir = path.join(ROOT, "examples", demo.example)
    const out = path.join(outDir, demo.name)
    if (!fs.existsSync(path.join(dir, "node_modules")))
      throw new Error(
        `docs-site: examples/${demo.example} is not installed; run npm ci there`,
      )
    const kept = path.join(dir, ".next.before-demo")
    const next = path.join(dir, ".next")
    if (demo.exported) {
      // A run stopped mid-build left the example's own .next aside and a
      // demo build in its place.
      if (fs.existsSync(kept)) {
        fs.rmSync(next, { recursive: true, force: true })
        fs.renameSync(kept, next)
      }
      if (fs.existsSync(next)) fs.renameSync(next, kept)
    }
    try {
      execFileSync("npm", demo.build(out), {
        cwd: dir,
        stdio: "inherit",
        env: {
          ...process.env,
          CUDOC_DEMO_BASE: `${sitePath}demos/${demo.name}/`,
          ...(commit ? { CUDOC_DEMO_COMMIT: commit } : {}),
          NEXT_TELEMETRY_DISABLED: "1",
        },
      })
      if (demo.exported) {
        fs.cpSync(path.join(dir, demo.exported), out, { recursive: true })
        fs.rmSync(path.join(dir, demo.exported), {
          recursive: true,
          force: true,
        })
      }
    } finally {
      if (demo.exported) {
        fs.rmSync(next, { recursive: true, force: true })
        if (fs.existsSync(kept)) fs.renameSync(kept, next)
      }
    }
    // GitHub Pages serves the site's own 404.html for every missing path, so
    // the one each host writes would never be shown under demos/.
    for (const page of ["404.html", "404"])
      fs.rmSync(path.join(out, page), { recursive: true, force: true })
    if (!fs.existsSync(path.join(out, demo.page)))
      throw new Error(`docs-site: the ${demo.name} demo has no ${demo.page}`)
    console.log(`docs-site: built the ${demo.name} demo into ${out}`)
  }
}

// The site configuration imports this module for its mounts, so it is read
// once this module has finished loading rather than awaited while it loads.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  import("./site.config.mjs").then(({ default: config }) =>
    buildDemos({
      siteUrl: config.siteUrl,
      outDir: path.join(ROOT, ".cudoc/docs-demos"),
      commit: config.sourceLinks.url.split("/blob/")[1].replace(/\/$/, ""),
    }),
  )
