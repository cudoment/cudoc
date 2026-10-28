/**
 * What `scripts` adds to the HTML output, where the files land and in what
 * order the tags are written, and that the default output is untouched. The
 * cases that need cudoc's own built scripts skip when the package has not
 * been built, naming the command.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { parse } from "node-html-parser"
import { buildSite, CONTENT_SECURITY_POLICY } from "../src/index.js"
import {
  ANNOTATION_SCRIPT,
  THEME_SCRIPT,
  annotationRuntimeFiles,
  themeRuntimeFile,
} from "../src/annotations/site.js"

const runtimeBuilt = (() => {
  try {
    themeRuntimeFile()
    annotationRuntimeFiles()
    return true
  } catch {
    return false
  }
})()
const withRuntime = runtimeBuilt ? it : it.skip
if (!runtimeBuilt)
  console.log(
    "scripts: runtime not built; run npm run build --workspace packages/cudoc-export",
  )

const sha256 = (file: string) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex")

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

const A = 'document.querySelector("main").dataset.ready = "1"\n'
const B = 'console.log("</script> is text here")\n'

/** A collection beside two scripts of its own, and a build of it. */
const site = (files: Record<string, string> = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-scripts-site-"))
  roots.push(root)
  const contents = {
    "docs/index.md": "# Home\n\nFirst paragraph.\n\n[Guide](guide/setup.md)\n",
    "docs/guide/setup.md": "# Setup\n\nInstall with npm.\n",
    "extra/a.js": A,
    "extra/b.js": B,
    ...files,
  }
  for (const [name, text] of Object.entries(contents)) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  const sourceRoot = path.join(root, "docs")
  const outDir = path.join(root, "site")
  return {
    root,
    sourceRoot,
    outDir,
    a: path.join(root, "extra/a.js"),
    b: path.join(root, "extra/b.js"),
    build: (options: Record<string, unknown> = {}) =>
      buildSite({ sourceRoot, outDir, title: "Demo", ...(options as object) }),
    read: (file: string) => fs.readFileSync(path.join(outDir, file), "utf8"),
    exists: (file: string) => fs.existsSync(path.join(outDir, file)),
  }
}

const policy = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY.replaceAll("'", "&#x27;")}">`

describe("buildSite with scripts", () => {
  it("leaves the default output without a script, a cudoc-js folder or a document id", () => {
    const s = site()
    const result = s.build()
    for (const file of ["index.html", "guide/setup.html"]) {
      expect(s.read(file)).not.toContain("<script")
      expect(s.read(file)).not.toContain("http-equiv")
      expect(s.read(file)).not.toContain("data-cudoc-")
    }
    expect(s.exists("cudoc-js")).toBe(false)
    expect(result.files.some((file) => file.startsWith("cudoc-js/"))).toBe(
      false,
    )
  })

  it("copies each file under cudoc-js/ in order and loads it at the end of every page's body", () => {
    const s = site()
    const result = s.build({ scripts: [s.a, s.b] })
    expect(result.files).toContain("cudoc-js/1-a.js")
    expect(result.files).toContain("cudoc-js/2-b.js")
    expect(sha256(path.join(s.outDir, "cudoc-js/1-a.js"))).toBe(sha256(s.a))
    expect(sha256(path.join(s.outDir, "cudoc-js/2-b.js"))).toBe(sha256(s.b))
    for (const [file, prefix, id] of [
      ["index.html", "", "index"],
      ["guide/setup.html", "../", "guide/setup"],
    ] as const) {
      const html = s.read(file)
      expect(html.match(/<script/g)).toHaveLength(2)
      // At the end of the body, after the footer and the narrow screen's
      // navigation button and backdrop, in the option's order, with
      // relative paths.
      expect(html).toContain(
        `<label for="cudoc-nav-toggle" class="cudoc-nav-backdrop" aria-hidden="true"></label><script defer src="${prefix}cudoc-js/1-a.js"></script><script defer src="${prefix}cudoc-js/2-b.js"></script></body></html>`,
      )
      expect(html.indexOf("</footer>")).toBeLessThan(html.indexOf("<script"))
      expect(html.match(/http-equiv/g)).toHaveLength(1)
      expect(html).toContain(policy)
      // The one attribute a caller's script is given: the document's id.
      expect(html).toContain(
        `<main id="main-content" data-cudoc-document="${id}">`,
      )
      expect(html.match(/data-cudoc-/g)).toHaveLength(1)
    }
    // The print outputs stay as they were.
    for (const file of ["index.print.html", "volume.print.html"]) {
      expect(s.read(file)).not.toContain("<script")
      expect(s.read(file)).not.toContain("data-cudoc-")
    }
  })

  it("takes one file as a string, and names the document on document pages only", () => {
    // Without an index document the home is a generated landing page.
    const s = site({ "docs/index.md": "" })
    fs.rmSync(path.join(s.sourceRoot, "index.md"))
    s.build({ scripts: s.a })
    const landing = s.read("index.html")
    expect(landing).toContain('<main id="main-content" class="landing">')
    expect(landing).toContain(
      '<script defer src="cudoc-js/1-a.js"></script></body>',
    )
    expect(landing).not.toContain("data-cudoc-document")
    expect(s.read("guide/setup.html")).toContain(
      '<main id="main-content" data-cudoc-document="guide/setup">',
    )
  })

  withRuntime(
    "comes after cudoc's own scripts in a hosted review, with one policy meta",
    () => {
      const s = site()
      s.build({
        scripts: [s.a],
        themeSwitch: true,
        mode: "annotate",
        annotate: { target: "hosted", reviewId: "demo" },
      })
      const html = s.read("index.html")
      expect(html.match(/http-equiv/g)).toHaveLength(1)
      expect(
        parse(html)
          .querySelectorAll("script")
          .map((el) => el.getAttribute("src")),
      ).toEqual([THEME_SCRIPT, ANNOTATION_SCRIPT, "cudoc-js/1-a.js"])
      expect(html).toContain(
        `<script defer src="${ANNOTATION_SCRIPT}"></script><script defer src="cudoc-js/1-a.js"></script></body>`,
      )
      // The review page keeps its own attributes beside the document id.
      const main = parse(html).querySelector("main")!
      expect(main.getAttribute("data-cudoc-document")).toBe("index")
      expect(main.getAttribute("data-cudoc-site")).toBe("demo")
    },
  )

  withRuntime("shares one policy meta with the theme switch", () => {
    const s = site()
    s.build({ scripts: [s.a], themeSwitch: true })
    for (const file of ["index.html", "guide/setup.html"]) {
      const html = s.read(file)
      expect(html.match(/http-equiv/g)).toHaveLength(1)
      expect(html).toContain(policy)
      expect(html.match(/<script/g)).toHaveLength(2)
      // The theme script stays in the head; the caller's ends the body.
      expect(html).toMatch(
        /<script src="(\.\.\/)?cudoc-theme\.js"><\/script><\/head>/,
      )
      expect(html).toMatch(
        /<script defer src="(\.\.\/)?cudoc-js\/1-a\.js"><\/script><\/body>/,
      )
    }
  })

  it("writes the text into a single page, escaped, and copies nothing", () => {
    const s = site()
    const result = s.build({ mode: "standalone", scripts: [s.a, s.b] })
    expect(result.files).toEqual(["guide/setup.html", "index.html"])
    expect(s.exists("cudoc-js")).toBe(false)
    const html = s.read("index.html")
    expect(html.match(/<script/g)).toHaveLength(2)
    expect(html).toContain(
      `</footer></main></div><script>${A}</script><script>console.log("<\\/script> is text here")\n</script></body></html>`,
    )
    expect(html.match(/http-equiv/g)).toHaveLength(1)
    expect(html).toContain(
      '<main id="main-content" data-cudoc-document="index">',
    )
  })

  withRuntime("writes the text into a review page the same way", () => {
    const s = site()
    s.build({ mode: "annotate", scripts: [s.a] })
    expect(s.read("index.html")).toContain(`<script>${A}</script></body>`)
    expect(s.read("index.html").match(/http-equiv/g)).toHaveLength(1)
  })

  it("takes an empty list as no scripts at all", () => {
    const s = site()
    const result = s.build({ scripts: [] })
    expect(s.read("index.html")).not.toContain("<script")
    expect(s.read("index.html")).not.toContain("http-equiv")
    expect(s.read("index.html")).not.toContain("data-cudoc-")
    expect(s.exists("cudoc-js")).toBe(false)
    expect(result.files.some((file) => file.startsWith("cudoc-js/"))).toBe(
      false,
    )
  })

  it("keeps two files of one name apart by their place, and reads a relative path", () => {
    const s = site({ "other/a.js": 'console.log("other")\n' })
    const result = s.build({
      scripts: [
        path.relative(process.cwd(), s.a),
        path.join(s.root, "other/a.js"),
      ],
    })
    expect(result.files).toContain("cudoc-js/1-a.js")
    expect(result.files).toContain("cudoc-js/2-a.js")
    expect(s.read("cudoc-js/1-a.js")).toBe(A)
    expect(s.read("cudoc-js/2-a.js")).toBe('console.log("other")\n')
    expect(s.read("index.html")).toContain(
      '<script defer src="cudoc-js/1-a.js"></script><script defer src="cudoc-js/2-a.js"></script></body>',
    )
  })

  it("refuses a script holding <!-- before anything is written", () => {
    const s = site({ "extra/c.js": "// <!-- a comment opener -->\n" })
    expect(() =>
      s.build({ scripts: [s.a, path.join(s.root, "extra/c.js")] }),
    ).toThrow(/extra\/c\.js contains <!--, which a page cannot carry inline/)
    expect(fs.existsSync(s.outDir)).toBe(false)
  })

  it.each([
    [(s: ReturnType<typeof site>) => path.join(s.root, "extra/missing.js")],
    [(s: ReturnType<typeof site>) => path.join(s.root, "extra/theme.css")],
    [(s: ReturnType<typeof site>) => path.join(s.root, "extra")],
    [() => 5],
    [(s: ReturnType<typeof site>) => [s.a, ""]],
  ])(
    "refuses what is not a local .js file (%#) before writing anything",
    (scripts) => {
      const s = site({ "extra/theme.css": "a {}" })
      expect(() => s.build({ scripts: scripts(s) })).toThrow(
        /script file not found|which is not a \.js file/,
      )
      expect(fs.existsSync(s.outDir)).toBe(false)
    },
  )

  it("refuses a script inside the output directory, which the build replaces", () => {
    const s = site()
    s.build()
    fs.writeFileSync(path.join(s.outDir, "mine.js"), A)
    expect(() => s.build({ scripts: path.join(s.outDir, "mine.js") })).toThrow(
      /mine\.js, which is inside the output directory/,
    )
    // The previous output is untouched.
    expect(s.exists("index.html")).toBe(true)
  })

  it("refuses a document asset under cudoc-js/ even when the option is off", () => {
    const s = site({
      "docs/cudoc-js/x.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
    })
    fs.appendFileSync(
      path.join(s.sourceRoot, "index.md"),
      '\n<img src="cudoc-js/x.svg">\n',
    )
    for (const options of [{}, { scripts: [s.a] }])
      expect(() => s.build(options)).toThrow(
        /asset collides with generated output: cudoc-js\/x\.svg/,
      )
  })

  it("still refuses an option it does not know", () => {
    const s = site()
    expect(() => s.build({ scrpits: [s.a] })).toThrow(/unknown option scrpits/)
    expect(fs.existsSync(s.outDir)).toBe(false)
  })
})
