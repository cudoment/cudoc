/**
 * What `themeSwitch: true` adds to a site, the stylesheet hook it relies on,
 * and that the default output is untouched. The cases that need the built
 * script skip when the package has not been built, naming the command.
 */

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { parse } from "node-html-parser"
import { buildSite, buildExport } from "../src/index.js"
import { darkVariables } from "../src/design/css.js"
import {
  ANNOTATION_SCRIPT,
  THEME_SCRIPT,
  themeRuntimeFile,
} from "../src/annotations/site.js"

describe("darkVariables", () => {
  it("answers to data-theme at the specificity of :root", () => {
    const css = darkVariables()
    expect(css).toContain(
      '@media (prefers-color-scheme: dark) {\n  :root:where(:not([data-theme="light"])) {',
    )
    expect(css).toContain(
      ':root:where([data-theme="dark"]) {\n  color-scheme: dark;\n  --canvas:',
    )
    expect(css).toContain(
      ':root:where([data-theme="light"]) {\n  color-scheme: light;\n}',
    )
    // Every dark colour is declared twice: for the system and for the switch.
    expect(css.match(/--canvas:/g)).toHaveLength(2)
    expect(css).not.toMatch(/:root \{/)
  })
})

const scriptBuilt = (() => {
  try {
    themeRuntimeFile()
    return true
  } catch {
    return false
  }
})()
const withScript = scriptBuilt ? it : it.skip
if (!scriptBuilt)
  console.log(
    "theme: script not built; run npm run build --workspace packages/cudoc-export",
  )

const sha256 = (file: string) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex")

const site = (options: Record<string, unknown> = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-theme-site-"))
  const sourceRoot = path.join(root, "docs")
  fs.mkdirSync(path.join(sourceRoot, "guide"), { recursive: true })
  fs.writeFileSync(
    path.join(sourceRoot, "index.md"),
    "# Home\n\nFirst paragraph.\n\n[Guide](guide/setup.md)\n",
  )
  fs.writeFileSync(
    path.join(sourceRoot, "guide/setup.md"),
    "# Setup\n\nInstall with npm.\n",
  )
  const outDir = path.join(root, "site")
  return {
    root,
    sourceRoot,
    outDir,
    build: () =>
      buildSite({
        sourceRoot,
        outDir,
        title: "Demo",
        ...(options as object),
      }),
    read: (file: string) => fs.readFileSync(path.join(outDir, file), "utf8"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

describe("buildSite with themeSwitch", () => {
  it("leaves the default output without the script or its file", () => {
    const s = site()
    try {
      s.build()
      expect(s.read("index.html")).not.toContain("<script")
      expect(fs.existsSync(path.join(s.outDir, THEME_SCRIPT))).toBe(false)
    } finally {
      s.cleanup()
    }
  })

  it("rejects a value that is not a boolean before writing anything", () => {
    const s = site({ themeSwitch: "on" })
    try {
      expect(() => s.build()).toThrow(
        /cudoc-export: themeSwitch must be true or false/,
      )
      expect(fs.existsSync(s.outDir)).toBe(false)
    } finally {
      s.cleanup()
    }
  })

  it("refuses an asset named like the script even when the option is off", () => {
    const s = site()
    try {
      fs.writeFileSync(path.join(s.sourceRoot, THEME_SCRIPT), "alert(1)")
      fs.appendFileSync(
        path.join(s.sourceRoot, "index.md"),
        `\n<img src="${THEME_SCRIPT}">\n`,
      )
      expect(() => s.build()).toThrow(/asset collides with generated output/)
    } finally {
      s.cleanup()
    }
  })

  withScript(
    "loads the script from the head of every page, with the policy, and ships the built file",
    () => {
      const s = site({ themeSwitch: true })
      try {
        s.build()
        for (const [file, prefix] of [
          ["index.html", ""],
          ["guide/setup.html", "../"],
        ] as const) {
          const html = s.read(file)
          expect(html.match(/<script/g)).toHaveLength(1)
          expect(html).toContain(
            `<script src="${prefix}${THEME_SCRIPT}"></script></head>`,
          )
          expect(html).not.toContain("defer")
          expect(html.match(/http-equiv/g)).toHaveLength(1)
          expect(html).not.toContain("data-cudoc-")
        }
        expect(sha256(path.join(s.outDir, THEME_SCRIPT))).toBe(
          sha256(themeRuntimeFile()),
        )
        // The print outputs stay as they were.
        expect(s.read("index.print.html")).not.toContain("<script")
      } finally {
        s.cleanup()
      }
    },
  )

  withScript(
    "shares one policy meta with the annotation runtime and lists the file it wrote",
    async () => {
      const s = site({ themeSwitch: true, annotations: true })
      try {
        s.build()
        const html = s.read("index.html")
        expect(html.match(/http-equiv/g)).toHaveLength(1)
        expect(
          parse(html)
            .querySelectorAll("script")
            .map((el) => el.getAttribute("src")),
        ).toEqual([THEME_SCRIPT, ANNOTATION_SCRIPT])
        const result = await buildExport({
          sourceRoot: s.sourceRoot,
          outDir: path.join(s.root, "export"),
          themeSwitch: true,
        })
        expect(result.files.html).toContain(THEME_SCRIPT)
        expect(result.files.html).not.toContain(ANNOTATION_SCRIPT)
      } finally {
        s.cleanup()
      }
    },
  )

  withScript("ships a script that touches neither markup nor network", () => {
    const script = fs
      .readFileSync(themeRuntimeFile(), "utf8")
      .replaceAll("http://www.w3.org/2000/svg", "")
    for (const forbidden of [
      "innerHTML",
      "insertAdjacentHTML",
      "document.write",
      "eval(",
      "new Function",
      "fetch(",
      "XMLHttpRequest",
      "import(",
      "http://",
      "https://",
    ])
      expect(script, forbidden).not.toContain(forbidden)
  })
})
