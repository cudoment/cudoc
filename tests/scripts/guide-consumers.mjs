/**
 * Follows each host guide in a new project, the way a reader would.
 *
 * The example sites prove that the integrations work; they do not prove that
 * the guides describe them. An example imports repository fixtures, carries
 * files no guide mentions and links the packages from the workspace, so a
 * guide can skip a step, import a file it never shows or leave a package out
 * of its install line while every example still builds. This check reads
 * nothing but the guide. It starts from the smallest site the guide assumes
 * the reader already has, runs the guide's install lines with cudoc's own
 * packages replaced by packed tarballs, writes the files the guide shows,
 * runs the build its scripts define and the export it ends with, and then
 * looks for an embedded sentence in the built page and in the export. Last it
 * runs `npm audit` there and in the matching example: the site may carry no
 * advisory the example does not, so a release the example pins to leave an
 * advisory behind is one the guide pins too.
 *
 * What it takes from a guide:
 * - every `npm install` line of a `sh` block, in order; any other command in
 *   such a block runs after the build;
 * - a code block whose first line is a comment naming a file, `// collect.mjs`
 *   or `/* src/css/custom.css *\/`: that file, written as the block shows it,
 *   or put at the top of the site's existing file when the comment ends with
 *   "— add at the top". A later block for the same file replaces an earlier
 *   one, as a later step of the guide does;
 * - an `md` block right after a paragraph that names one `.md` path in code
 *   and ends with a colon, as in "`docs/reference.md` holds the facts:":
 *   that document;
 * - a `json` block holding `scripts` or `overrides`, merged into
 *   `package.json`;
 * - a "Stop here" paragraph, where the site as configured so far has to build
 *   with the host's own command, since a reader may stop there.
 * Every other block is an illustration and is left alone. Every package a
 * file the guide shows imports has to be one the site depends on directly,
 * so a guide cannot rely on another package having pulled it in.
 *
 * The embedded section sits one directory below the page that embeds it,
 * links back to that page and shows a root-relative image from the host's
 * static directory, which the collector, the check, the site build and the
 * export all have to resolve from the other directory. The
 * export guide has no host and no build script: only its first section is
 * followed, and its commands run in the order it gives them. The host
 * packages the starting site and the install lines name install at the
 * versions the matching example's lockfile records, which are the releases
 * the support table names. Pass names to run only those:
 * `node tests/scripts/guide-consumers.mjs vitepress export`. Set
 * `CUDOC_KEEP_GUIDE_SITES=1` to keep the sites for a look afterwards.
 */

import { execFileSync } from "node:child_process"
import { builtinModules } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readGuide } from "./guide-steps.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const PACKAGES_DIR = path.join(ROOT, "packages")

/** Text only the embedded section carries, so finding it proves the embed. */
const SENTENCE = "Guide check: requests are limited to ten per second."
/**
 * What a site that only uses the syntax extensions holds: a callout and an
 * anchor, and no embed, which needs the setup after the stop.
 */
const SYNTAX_ONLY = {
  "index.md":
    "# Welcome\n\n> [!NOTE] Before you start\n> Read the [limits](reference/limits.md#limits).\n",
}
/**
 * The embedded section lives one directory down from the page that embeds
 * it, so its link back and its image have to be re-expressed for another
 * directory, which is where a host that resolves paths per file goes wrong.
 */
const DOCUMENTS = {
  "reference/limits.md": `# Limits reference\n\n## Limits (#limits)\n\n${SENTENCE} Back to the [overview](../index.md).\n\n![Logo](/img/logo.png)\n`,
  "index.md":
    "# Welcome\n\nThe limit below comes from the reference page.\n\n```cudoc-embed\nsources: [reference/limits.md#limits]\n```\n",
}

/** A one-pixel PNG, real enough for a host that reads image dimensions. */
const LOGO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

const NEXT_LAYOUT = `export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

/**
 * The site each guide starts from: what a reader has before step 1, and
 * where the host writes the page that embeds the reference.
 */
const HOSTS = {
  next: {
    guide: "docs/next.md",
    example: "next-mdx",
    content: "docs",
    dependencies: ["next", "react", "react-dom"],
    files: {
      "app/layout.jsx": NEXT_LAYOUT,
      "app/page.jsx":
        'import Page from "../docs/index.md"\nexport default Page\n',
      "app/reference/limits/page.jsx":
        'import Page from "../../../docs/reference/limits.md"\nexport default Page\n',
    },
    logo: "public/img/logo.png",
    build: ["next", "build"],
    page: ".next/server/app/index.html",
  },
  docusaurus: {
    guide: "docs/docusaurus.md",
    example: "docusaurus",
    content: "docs",
    dependencies: [
      "@docusaurus/core",
      "@docusaurus/preset-classic",
      "@mdx-js/react",
      "prism-react-renderer",
      "react",
      "react-dom",
    ],
    files: {
      "docusaurus.config.mjs": `export default {
  title: "My docs",
  url: "https://docs.example.com",
  baseUrl: "/",
  presets: [["classic", { docs: { path: "docs", routeBasePath: "docs" } }]],
}
`,
      "src/css/custom.css": "/* The site's own styles. */\n",
      // The theme links its title to the home page, so a site has one.
      "src/pages/index.js": `import Layout from "@theme/Layout"

export default function Home() {
  return <Layout title="Home">Home</Layout>
}
`,
    },
    logo: "static/img/logo.png",
    // Docusaurus's own spelling of a site file, which only the collector's
    // alias turns into an address the check and the export can find.
    aliasImage: {
      markdown: "![Site logo](@site/static/img/site.png)",
      file: "static/img/site.png",
    },
    build: ["docusaurus", "build"],
    page: "build/docs/index.html",
  },
  nextra: {
    guide: "docs/nextra.md",
    example: "nextra",
    content: "content",
    dependencies: ["next", "nextra", "nextra-theme-docs", "react", "react-dom"],
    files: {
      "next.config.mjs": `import nextra from "nextra"

const withNextra = nextra({})

export default withNextra({})
`,
      "app/layout.jsx": `import { Footer, Layout, Navbar } from "nextra-theme-docs"
import { Head } from "nextra/components"
import { getPageMap } from "nextra/page-map"
import "nextra-theme-docs/style.css"

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          footer={<Footer>My docs</Footer>}
          navbar={<Navbar logo={<b>My docs</b>} />}
          pageMap={await getPageMap()}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
`,
      "app/[[...mdxPath]]/page.jsx": `import { generateStaticParamsFor, importPage } from "nextra/pages"
import { useMDXComponents as getMDXComponents } from "../../mdx-components.jsx"

export const generateStaticParams = generateStaticParamsFor("mdxPath")

export async function generateMetadata(props) {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  return metadata
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props) {
  const params = await props.params
  const { default: MDXContent, toc, metadata } = await importPage(
    params.mdxPath,
  )
  return (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
`,
      "mdx-components.jsx": `import { useMDXComponents as getThemeComponents } from "nextra-theme-docs"

const themeComponents = getThemeComponents()

export function useMDXComponents(components) {
  return { ...themeComponents, ...components }
}
`,
    },
    logo: "public/img/logo.png",
    build: ["next", "build"],
    page: ".next/server/app/index.html",
  },
  vitepress: {
    guide: "docs/vitepress.md",
    example: "vitepress",
    content: "docs",
    dependencies: ["vitepress"],
    files: {},
    logo: "docs/public/img/logo.png",
    build: ["vitepress", "build", "docs"],
    page: "docs/.vitepress/dist/index.html",
  },
  eleventy: {
    guide: "docs/eleventy.md",
    example: "eleventy",
    content: "docs",
    dependencies: ["@11ty/eleventy"],
    files: {},
    // Eleventy has no static directory: images sit in the input and a
    // passthrough copies them, so a root-relative path names the input.
    logo: "docs/img/logo.png",
    build: ["eleventy"],
    page: "_site/index.html",
  },
  // No site at all: the guide writes its own two documents, and the
  // summary table it embeds links each row into the reference.
  export: {
    guide: "docs/export.md",
    section: "Your first site, from an empty directory",
    example: "export",
    dependencies: [],
    files: {},
    page: "site/index.html",
    expect: 'href="reference.html#limits"',
  },
}

const ENV = {
  ...process.env,
  // Nothing here prints a PDF, so cudoc-export's browser is not fetched.
  CUDOC_SKIP_BROWSER_DOWNLOAD: "1",
  NEXT_TELEMETRY_DISABLED: "1",
}

/** Runs one command in a site, printing its output only when it fails. */
function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      env: ENV,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`
    throw new Error(
      `${[command, ...args].join(" ")} failed in ${cwd}:\n${output.slice(-6000)}`,
    )
  }
}

/** The packages a script or stylesheet imports, requires or resolves. */
const importedPackages = (source) =>
  [
    ...source.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|(?:\brequire|\))\.resolve\s*\(\s*|@import\s+)["']([^"'./][^"']*)["']/g,
    ),
  ]
    .map(([, specifier]) =>
      specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0],
    )
    .filter(
      (name) => !name.startsWith("node:") && !builtinModules.includes(name),
    )

/** The version each package resolved to in an example's lockfile. */
function lockedVersions(example) {
  const lock = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "examples", example, "package-lock.json"),
      "utf8",
    ),
  )
  return (name) => lock.packages[`node_modules/${name}`]?.version
}

function pack(destination) {
  const tarballs = {}
  for (const entry of fs.readdirSync(PACKAGES_DIR)) {
    const dir = path.join(PACKAGES_DIR, entry)
    const manifestFile = path.join(dir, "package.json")
    if (!fs.existsSync(manifestFile)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
    if (manifest.private) continue
    // npm 11 prints a list of what it packed, npm 12 an object by name.
    const printed = JSON.parse(
      run(
        "npm",
        ["pack", "--json", "--pack-destination", destination, dir],
        ROOT,
      ),
    )
    const [packed] = Array.isArray(printed) ? printed : Object.values(printed)
    tarballs[manifest.name] = path.join(destination, packed.filename)
  }
  return tarballs
}

function followGuide(name, host, tarballs, workspace) {
  const site = path.join(workspace, name)
  fs.mkdirSync(site)
  const version = lockedVersions(host.example)
  const pinned = (spec) => {
    if (tarballs[spec]) return tarballs[spec]
    const locked = version(spec)
    return locked ? `${spec}@${locked}` : spec
  }
  const manifestFile = path.join(site, "package.json")
  const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, "utf8"))
  const writeManifest = (manifest) =>
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  /**
   * `npm install` with every cudoc package the site does not depend on
   * directly overridden by its tarball, so a package the install pulls in
   * through another one is the packed one, not whatever the registry holds
   * under that version. npm refuses an override for a direct dependency, and
   * the guide's own install line has to supply those.
   */
  let overrides = {}
  const install = (args) => {
    const manifest = readManifest()
    const direct = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...args.flatMap((arg) =>
        Object.entries(tarballs).flatMap(([pkg, file]) =>
          arg === file ? [pkg] : [],
        ),
      ),
    ])
    manifest.overrides = {
      ...overrides,
      ...Object.fromEntries(
        Object.entries(tarballs)
          .filter(([pkg]) => !direct.has(pkg))
          .map(([pkg, file]) => [pkg, `file:${file}`]),
      ),
    }
    writeManifest(manifest)
    run("npm", ["install", "--no-audit", "--no-fund", ...args], site)
  }
  writeManifest({
    name: `guide-${name}`,
    private: true,
    dependencies: Object.fromEntries(
      host.dependencies.map((dependency) => {
        const locked = version(dependency)
        if (!locked)
          throw new Error(
            `examples/${host.example} does not lock ${dependency}`,
          )
        return [dependency, locked]
      }),
    ),
  })
  const write = (file, content) => {
    const target = path.join(site, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  for (const [file, content] of Object.entries(host.files)) write(file, content)
  const writeDocuments = (documents) => {
    if (host.content)
      for (const [file, content] of Object.entries(documents))
        write(path.join(host.content, file), content)
  }
  const documents = host.aliasImage
    ? {
        ...DOCUMENTS,
        "reference/limits.md": `${DOCUMENTS["reference/limits.md"]}\n${host.aliasImage.markdown}\n`,
      }
    : DOCUMENTS
  writeDocuments({ ...documents, ...SYNTAX_ONLY })
  if (host.logo) write(host.logo, LOGO)
  if (host.aliasImage) write(host.aliasImage.file, LOGO)
  install([])
  const page = path.join(site, host.page)
  const scripts = []

  // A guide without a build script is a list of commands to run as given.
  const direct = Boolean(host.section)
  const afterBuild = []
  for (const step of readGuide(path.join(ROOT, host.guide), host.section)) {
    if (step.kind === "command") {
      const [tool, verb, ...args] = step.command.split(/\s+/)
      if (tool === "npm" && verb === "install") install(args.map(pinned))
      else if (direct) run("sh", ["-c", step.command], site)
      else afterBuild.push(step.command)
    } else if (step.kind === "stop") {
      if (!host.build)
        throw new Error(`${host.guide} stops, and ${name} has no build command`)
      const [tool, ...args] = host.build
      run(path.join(site, "node_modules/.bin", tool), args, site)
      if (!fs.readFileSync(page, "utf8").includes('data-callout="note"'))
        throw new Error(`${name}: the syntax-only site draws no callout`)
      console.log(`${name}: the site builds where the guide says it may stop`)
      // From here on the site embeds.
      writeDocuments(documents)
    } else if (step.kind === "scripts") {
      const manifest = readManifest()
      manifest.scripts = { ...manifest.scripts, ...step.scripts }
      writeManifest(manifest)
    } else if (step.kind === "overrides") {
      // Kept beside the tarballs the check itself overrides with, and applied
      // by the guide's next install, as the reader's is.
      overrides = { ...overrides, ...step.overrides }
      const manifest = readManifest()
      manifest.overrides = { ...manifest.overrides, ...step.overrides }
      writeManifest(manifest)
    } else if (step.prepend) {
      const target = path.join(site, step.file)
      if (!fs.existsSync(target))
        throw new Error(
          `${host.guide} adds to ${step.file}, which the site it starts from does not have`,
        )
      write(step.file, step.content + fs.readFileSync(target, "utf8"))
      scripts.push(step.content)
    } else {
      write(step.file, step.content)
      if (/\.(?:[cm]?js|jsx|css)$/.test(step.file)) scripts.push(step.content)
    }
  }
  const declared = new Set(Object.keys(readManifest().dependencies ?? {}))
  const undeclared = [...new Set(scripts.flatMap(importedPackages))].filter(
    (name) => !declared.has(name),
  )
  if (undeclared.length)
    throw new Error(
      `${host.guide} imports ${undeclared.join(", ")}, which the site does not depend on`,
    )
  if (!direct) {
    if (!readManifest().scripts?.build)
      throw new Error(`${host.guide} defines no build script`)
    run("npm", ["run", "build"], site)
  }
  if (!fs.existsSync(page))
    throw new Error(`${name}: the build wrote no ${host.page}`)
  // The embedded section's images: each tag found by its alt text, since a
  // host may rename the file or inline a small one as a data URL.
  const images = host.logo
    ? ["Logo", ...(host.aliasImage ? ["Site logo"] : [])]
    : []
  const imageSource = (html, alt) =>
    [...html.matchAll(/<img\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes(` alt="${alt}"`))
      ?.match(/\ssrc="([^"]*)"/)?.[1]
  const built = fs.readFileSync(page, "utf8")
  if (!built.includes(host.expect ?? SENTENCE))
    throw new Error(`${name}: ${host.page} does not carry the embedded section`)
  for (const alt of images)
    if (!imageSource(built, alt))
      throw new Error(`${name}: ${host.page} does not show the image ${alt}`)
  console.log(`${name}: ${host.page} carries the embedded section`)

  for (const command of afterBuild) run("sh", ["-c", command], site)
  if (afterBuild.some((command) => command.includes("cudoc-export build"))) {
    const exported = fs.readFileSync(
      path.join(site, "shared-html/index.html"),
      "utf8",
    )
    if (!exported.includes(SENTENCE))
      throw new Error(`${name}: the exported index does not carry the embed`)
    for (const alt of images) {
      const copied = imageSource(exported, alt)
      if (
        !copied ||
        !fs.existsSync(
          path.join(site, "shared-html", decodeURIComponent(copied)),
        )
      )
        throw new Error(`${name}: the export does not carry the file of ${alt}`)
    }
    console.log(`${name}: the standalone export carries the embedded section`)
  }

  const example = advisories(path.join(ROOT, "examples", host.example))
  const extra = [...advisories(site)].filter((url) => !example.has(url))
  if (extra.length)
    throw new Error(
      `${name}: npm audit reports what examples/${host.example} does not:\n${extra.join("\n")}\nPin the fixed release in the guide as the example does.`,
    )
  console.log(`${name}: npm audit reports nothing the example does not`)
}

/** The advisories `npm audit` reports for the project in `dir`, by URL. */
function advisories(dir) {
  let output
  try {
    output = execFileSync("npm", ["audit", "--json"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    // npm audit exits non-zero whenever it finds something.
    output = String(error.stdout ?? "")
  }
  const report = JSON.parse(output || "{}")
  if (report.error || !report.vulnerabilities)
    throw new Error(
      `npm audit failed in ${dir}: ${JSON.stringify(report.error ?? report)}`,
    )
  return new Set(
    Object.values(report.vulnerabilities).flatMap((entry) =>
      entry.via.flatMap((via) => (typeof via === "object" ? [via.url] : [])),
    ),
  )
}

const selected = process.argv.slice(2)
for (const name of selected)
  if (!HOSTS[name]) throw new Error(`unknown host: ${name}`)
const workspace = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-guides-")),
)
console.log(`following the host guides in ${workspace}`)
try {
  const tarballs = pack(workspace)
  for (const [name, host] of Object.entries(HOSTS))
    if (!selected.length || selected.includes(name))
      followGuide(name, host, tarballs, workspace)
  console.log("every host guide builds a site that embeds")
} finally {
  if (process.env.CUDOC_KEEP_GUIDE_SITES) console.log(`kept ${workspace}`)
  else fs.rmSync(workspace, { recursive: true, force: true })
}
