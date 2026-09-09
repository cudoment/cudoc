import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { parse } from "node-html-parser"
import { loadLibrary } from "@cudoment/cudoc/node/library"

const hosts = [
  ["next-mdx", "docs", ".next"],
  ["docusaurus", "docs", "build"],
  ["nextra", "content", ".next"],
  ["vitepress", "docs", "docs/.vitepress/dist"],
]
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-html-hosts-"))
const snapshot = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory()
      ? snapshot(file)
      : [
          [
            file,
            entry.isSymbolicLink()
              ? fs.readlinkSync(file)
              : createHash("sha256")
                  .update(fs.readFileSync(file))
                  .digest("hex"),
          ],
        ]
  })
try {
  for (const [host, source, output] of hosts) {
    const site = path.resolve("examples", host)
    const libraryDir = path.join(site, ".cudoc/documents")
    assert.ok(
      fs.existsSync(path.join(libraryDir, "embeds.json")),
      `Build examples/${host} before this check`,
    )
    const library = loadLibrary(libraryDir)
    const before = snapshot(libraryDir)
    const primaryOutput = snapshot(path.join(site, output))
    const sourceBefore = snapshot(path.join(site, source))
    const reference = library.documents.find((doc) => doc.id === "reference")
    for (const links of ["relative", "host", "none"]) {
      const outDir = path.join(temporary, `${host}-${links}`)
      const args = [
        path.resolve("packages/cudoc-html/dist/cli.js"),
        "build",
        path.join(site, source),
        "--library",
        libraryDir,
        "--out-dir",
        outDir,
        "--links",
        links,
      ]
      if (links === "host")
        args.push("--host-url", "https://docs.example.com/project/")
      const result = JSON.parse(
        execFileSync(process.execPath, args, { encoding: "utf8" }),
      )
      assert.equal(result.documentCount, library.documents.length)
      const html = parse(
        fs.readFileSync(path.join(outDir, "portable.html"), "utf8"),
      )
      assert.equal(
        html.querySelector("[data-callout]")?.getAttribute("data-callout"),
        "warning",
      )
      assert.ok(html.querySelector("td ul li ul"), `${host}: nested table list`)
      assert.ok(
        html.querySelectorAll("em").some((node) => node.text === "adapted"),
        `${host}: original native replacement is reused`,
      )
      assert.equal(html.querySelectorAll("table").length, 2)
      assert.equal(
        html.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
        "cudoc.css",
      )
      if (links === "none") assert.equal(html.querySelectorAll("a").length, 0)
      else {
        const prefix =
          links === "host"
            ? `https://docs.example.com/project${reference.route}`
            : "reference.html"
        assert.ok(
          html
            .querySelectorAll("table a")
            .some((a) => a.getAttribute("href") === `${prefix}#limits`),
          `${host}: ${links} summary target`,
        )
        if (links === "host")
          assert.ok(
            html
              .querySelectorAll("nav a")
              .every((a) =>
                a
                  .getAttribute("href")
                  .startsWith("https://docs.example.com/project/"),
              ),
          )
      }
    }
    assert.deepEqual(
      snapshot(libraryDir),
      before,
      `${host}: shared library unchanged`,
    )
    assert.deepEqual(
      snapshot(path.join(site, output)),
      primaryOutput,
      `${host}: complete primary site output unchanged`,
    )
    assert.deepEqual(
      snapshot(path.join(site, source)),
      sourceBefore,
      `${host}: source files unchanged`,
    )
    console.log(
      `${host}: shared host library exported with relative, host and none links; original site/library unchanged`,
    )
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
