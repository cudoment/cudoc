/**
 * Several roots under bases, and the scope options that ride on the same
 * coordinates: `exclude`, `private` and external path prefixes.
 *
 * Everything below builds a real library from temporary files, because the
 * point of the feature is that ids, links, embed sources, the checker, the
 * dataset and the file lookups all agree on one coordinate system, and only
 * the real pipeline shows whether they do.
 */

import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  buildDocuments,
  buildDocumentsAsync,
  loadLibrary,
  resolveRoots,
  documentIdOf,
  sourceFileOf,
  LIBRARY_SCHEMA_VERSION,
} from "../src/node/library.js"
import { compileDocument } from "../src/markdown.js"
import { checkReferences } from "../src/node/check.js"
import {
  resolveDocumentEmbeds,
  resolveEmbedAsync,
} from "../src/node/resolve-embed.js"
import { generateDataset, scopeOf } from "../src/node/dataset.js"
import { globToRegExp, globMatcher } from "../src/node/glob.js"
import { isExternalPath, resolveLocalTarget } from "../src/node/local-target.js"
import { publishDirectory, sourceFiles } from "../src/node/storage.js"
import { renderDocument } from "../src/render.js"

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

/** Writes files under a fresh directory and returns it. */
const workspace = (files: Record<string, string>) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-roots-")),
  )
  temporary.push(root)
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return root
}

/** Two roots, the way a site with a glossary beside its guides is laid out. */
const TWO_ROOTS = {
  "content/ko/guide.md":
    "# Guide (#guide)\n\n[term](../../terms/ko/token.md#token) [abs](/terms/ko/token.md#token) [sibling](./setup.md#setup) [image](./diagram.png) [other](/terms/ko/shared.png)\n\n```cudoc-embed\nsources: [/terms/ko/token.md#token]\n```\n",
  "content/ko/setup.md": "# Setup (#setup)\n\nBody.\n",
  "content/ko/diagram.png": "png",
  "content/en/guide.md": "# Guide (#guide)\n\nEnglish.\n",
  "content/in/secret.md": "# Secret (#secret)\n\nIn-house.\n",
  "glossary/ko/token.md": "# Token (#token)\n\nA **token** is a token.\n",
  "glossary/ko/shared.png": "png",
}
const roots = (root: string) => [
  { dir: path.join(root, "content"), base: "docs" },
  { dir: path.join(root, "glossary"), base: "/terms/" },
]

describe("glob patterns", () => {
  it.each([
    ["*.tmp", ["a.tmp", "docs/a.tmp"], ["a.tmpx", "docs/tmp"]],
    ["**/AGENTS.md", ["AGENTS.md", "docs/en/AGENTS.md"], ["docs/AGENTS.mdx"]],
    ["drafts/**", ["drafts", "drafts/a.md", "drafts/a/b.md"], ["draftsx/a.md"]],
    [
      "docs/ko/000dev/**",
      ["docs/ko/000dev", "docs/ko/000dev/x.md"],
      ["docs/ko/000devx", "docs/en/000dev/x.md"],
    ],
    ["a/**/b", ["a/b", "a/x/b", "a/x/y/b"], ["a/bx", "x/a/b"]],
    ["**", ["anything", "a/b/c"], []],
    ["a?c", ["abc", "docs/abc"], ["ac", "abbc"]],
  ])("compiles %s", (pattern, hits, misses) => {
    const expression = globToRegExp(pattern)
    for (const hit of hits) expect(expression.test(hit), hit).toBe(true)
    for (const miss of misses) expect(expression.test(miss), miss).toBe(false)
  })

  it("rejects patterns that cannot mean anything", () => {
    expect(() => globToRegExp("")).toThrow(/non-empty/)
    expect(() => globToRegExp("../x")).toThrow(/invalid glob/)
    expect(() => globMatcher("x" as unknown as string[], "exclude")).toThrow(
      /exclude must be an array/,
    )
    expect(globMatcher(undefined, "exclude")("anything")).toBe(false)
  })
})

describe("root resolution", () => {
  it("normalizes bases, resolves directories and refuses ambiguous input", () => {
    const resolved = resolveRoots({
      roots: [
        { dir: "content", base: "/docs/" },
        { dir: "glossary", base: "terms" },
        { dir: "top" },
      ],
    })
    expect(resolved.map((root) => root.base)).toEqual(["docs", "terms", ""])
    expect(path.isAbsolute(resolved[0]!.dir)).toBe(true)
    expect(resolveRoots({ sourceRoot: "docs" })).toEqual([
      { dir: path.resolve("docs"), base: "" },
    ])
    expect(() => resolveRoots({ sourceRoot: "docs", roots: [] })).toThrow(
      /either sourceRoot or roots/,
    )
    expect(() => resolveRoots({})).toThrow(/required/)
    expect(() => resolveRoots({ roots: [] })).toThrow(/required/)
    expect(() => resolveRoots({ roots: [{ dir: "a", base: "../x" }] })).toThrow(
      /invalid root base/,
    )
    expect(() => resolveRoots({ roots: [{ dir: "a", base: "a?b" }] })).toThrow(
      /invalid root base/,
    )
    expect(() =>
      resolveRoots({ roots: [{ dir: "a" }, { dir: "./a" }] }),
    ).toThrow(/listed twice/)
  })

  it("maps files to ids and library paths back to files, innermost root first", () => {
    const root = workspace({
      "content/guide.md": "# G",
      "content/api/ref.md": "# R",
    })
    const resolved = resolveRoots({
      roots: [
        { dir: path.join(root, "content"), base: "docs" },
        { dir: path.join(root, "content/api"), base: "docs/api" },
      ],
    })
    expect(documentIdOf(resolved, path.join(root, "content/guide.md"))).toBe(
      "docs/guide",
    )
    expect(documentIdOf(resolved, path.join(root, "content/api/ref.md"))).toBe(
      "docs/api/ref",
    )
    expect(documentIdOf(resolved, path.join(root, "elsewhere.md"))).toBe(
      undefined,
    )
    expect(sourceFileOf(resolved, "docs/api/ref.md")).toBe(
      path.join(root, "content/api/ref.md"),
    )
    // A path that no root holds still names the place it would have been.
    expect(sourceFileOf(resolved, "docs/missing.md")).toBe(
      path.join(root, "content/missing.md"),
    )
    expect(sourceFileOf(resolved, "other/x.md")).toBe(undefined)
  })
})

describe("collection across roots", () => {
  it("derives ids and routes from the bases and records the roots in the manifest", () => {
    const root = workspace(TWO_ROOTS)
    const outDir = path.join(root, "library")
    const library = buildDocuments({ roots: roots(root), outDir })
    expect(library.documents.map((doc) => doc.id)).toEqual([
      "docs/en/guide",
      "docs/in/secret",
      "docs/ko/guide",
      "docs/ko/setup",
      "terms/ko/token",
    ])
    expect(library.documents[2]).toMatchObject({
      sourcePath: "docs/ko/guide.md",
      route: "/docs/ko/guide",
    })
    expect(library.roots?.map((entry) => entry.base)).toEqual(["docs", "terms"])
    const manifest = JSON.parse(
      fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
    )
    expect(manifest.schemaVersion).toBe(LIBRARY_SCHEMA_VERSION)
    expect(manifest.roots).toEqual([{ base: "docs" }, { base: "terms" }])
    expect(
      fs.existsSync(path.join(outDir, "documents/terms/ko/token.json")),
    ).toBe(true)

    // Loading restores the roots only when the caller names them, and then
    // they have to be the roots the ids came from.
    expect(loadLibrary(outDir).roots).toBe(undefined)
    expect(
      loadLibrary(outDir, undefined, roots(root)).roots?.map((r) => r.base),
    ).toEqual(["docs", "terms"])
    expect(() =>
      loadLibrary(outDir, undefined, path.join(root, "content")),
    ).toThrow(/collected with bases \["docs", "terms"\]/)
  })

  it("keeps a single directory as the shorthand and its ids unprefixed", () => {
    const root = workspace({ "docs/a.md": "# A", "docs/sub/b.md": "# B" })
    const outDir = path.join(root, "library")
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir,
    })
    expect(library.documents.map((doc) => doc.id)).toEqual(["a", "sub/b"])
    expect(
      loadLibrary(outDir, undefined, path.join(root, "docs")).roots,
    ).toEqual([{ dir: path.join(root, "docs"), base: "" }])
  })

  it("rejects an older manifest and the same id from two roots", () => {
    const root = workspace({
      "a/guide.md": "# A",
      "b/Guide.md": "# B",
      "single/x.md": "# X",
    })
    expect(() =>
      buildDocuments({
        roots: [
          { dir: path.join(root, "a"), base: "docs" },
          { dir: path.join(root, "b"), base: "docs" },
        ],
        outDir: path.join(root, "library"),
      }),
    ).toThrow(/duplicate document output: docs\/Guide.md and docs\/guide.md/)
    const outDir = path.join(root, "old")
    buildDocuments({ sourceRoot: path.join(root, "single"), outDir })
    const file = path.join(outDir, "manifest.json")
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, "utf8")
        .replace(
          `"schemaVersion":${LIBRARY_SCHEMA_VERSION}`,
          '"schemaVersion":1',
        ),
    )
    expect(() => loadLibrary(outDir)).toThrow(/incompatible document manifest/)
  })

  it("compiles each file at its real path through the async builder", async () => {
    const root = workspace(TWO_ROOTS)
    const seen: string[] = []
    const library = await buildDocumentsAsync({
      roots: roots(root),
      outDir: path.join(root, "library"),
      compilerId: "test",
      async compiler(source, context) {
        seen.push(`${context.id} <- ${context.filePath}`)
        expect(context.options).not.toHaveProperty("roots")
        expect(context.options).not.toHaveProperty("outDir")
        return compileDocument(source, context.options)
      },
    })
    expect(seen).toContain(
      `terms/ko/token <- ${path.join(root, "glossary/ko/token.md")}`,
    )
    expect(library.documents).toHaveLength(5)
  })
})

describe("exclude and private", () => {
  it("leaves excluded files out, prunes excluded directories and marks private documents", () => {
    const root = workspace({
      ...TWO_ROOTS,
      "content/AGENTS.md": "# Notes",
      "content/ko/000dev/scratch.md": "# Scratch",
      "content/ko/000dev/deeper/more.md": "# More",
    })
    // A symlink inside an excluded directory is never seen, so it is not an error.
    fs.symlinkSync(
      path.join(root, "content/ko/setup.md"),
      path.join(root, "content/ko/000dev/link.md"),
    )
    const outDir = path.join(root, "library")
    const library = buildDocuments({
      roots: roots(root),
      outDir,
      exclude: ["**/AGENTS.md", "docs/ko/000dev/**"],
      private: ["docs/in/**"],
    })
    expect(library.documents.map((doc) => doc.id)).toEqual([
      "docs/en/guide",
      "docs/in/secret",
      "docs/ko/guide",
      "docs/ko/setup",
      "terms/ko/token",
    ])
    expect(
      library.documents.find((doc) => doc.id === "docs/in/secret"),
    ).toHaveProperty("private", true)
    expect(
      library.documents.find((doc) => doc.id === "docs/ko/guide"),
    ).not.toHaveProperty("private")
    const manifest = JSON.parse(
      fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
    )
    expect(
      manifest.documents.find(
        (doc: { id: string }) => doc.id === "docs/in/secret",
      ).private,
    ).toBe(true)
    // Both options are part of the configuration, so changing them is a
    // recollection as far as prepared embeds are concerned.
    const other = buildDocuments({
      roots: roots(root),
      outDir: path.join(root, "other"),
      exclude: ["**/AGENTS.md", "docs/ko/000dev/**"],
    })
    expect(other.configuration).not.toBe(library.configuration)
    expect(() =>
      buildDocuments({
        roots: roots(root),
        outDir: path.join(root, "third"),
        exclude: ["**/AGENTS.md"],
      }),
    ).toThrow(/symlink in source tree/)
  })

  it("asks the walker before entering a directory", () => {
    const root = workspace({
      "docs/a.md": "# A",
      "docs/drafts/b.md": "# B",
      "docs/drafts/deep/c.md": "# C",
    })
    const asked: string[] = []
    const files = sourceFiles(path.join(root, "docs"), undefined, {
      exclude: (relative) => {
        asked.push(relative)
        return relative === "drafts"
      },
    })
    expect(files).toEqual([path.join(root, "docs/a.md")])
    expect(asked).toEqual(["a.md", "drafts"])
  })

  it("refuses an output that overlaps any of several inputs", () => {
    const root = workspace({ "a/x.md": "# A", "b/y.md": "# B" })
    expect(() =>
      publishDirectory(
        [path.join(root, "a"), path.join(root, "b")],
        path.join(root, "b/out"),
        () => {},
      ),
    ).toThrow(/overlap/)
  })
})

describe("references across roots", () => {
  it("resolves relative and root-relative links, images and embed sources in library coordinates", () => {
    const root = workspace(TWO_ROOTS)
    const library = buildDocuments({
      roots: roots(root),
      outDir: path.join(root, "library"),
    })
    const result = checkReferences(library)
    expect(result.issues).toEqual([])
    // A relative link is resolved in library coordinates, so the directory
    // name on disk is not a path an author can link by.
    fs.writeFileSync(
      path.join(root, "content/ko/setup.md"),
      "# Setup (#setup)\n\n[disk](../../glossary/ko/token.md)\n",
    )
    const again = checkReferences(
      buildDocuments({ roots: roots(root), outDir: path.join(root, "again") }),
    )
    expect(again.issues.map((i) => [i.code, i.reference])).toEqual([
      ["missing-document", "../../glossary/ko/token.md"],
    ])
    // The image lookups reached the files through the roots.
    expect(
      resolveLocalTarget("./diagram.png", "docs/ko/guide.md", {
        roots: library.roots!,
      }),
    ).toMatchObject({
      kind: "resolved",
      relative: "docs/ko/diagram.png",
      source: path.join(root, "content/ko/diagram.png"),
    })
    expect(
      resolveLocalTarget("/terms/ko/shared.png", "docs/ko/guide.md", {
        roots: library.roots!,
      }),
    ).toMatchObject({ kind: "resolved", relative: "terms/ko/shared.png" })
    // A relative path that leaves every base is missing, not a traversal.
    expect(
      resolveLocalTarget("../../../outside.png", "docs/ko/guide.md", {
        roots: library.roots!,
      }),
    ).toMatchObject({ kind: "missing" })

    const html = renderDocument(resolveDocumentEmbeds(library, "docs/ko/guide"))
    expect(html).toContain("<strong>token</strong>")
    expect(html).toContain('id="embed-1-1-token"')
  })

  it("treats a link under an external prefix as external and otherwise reports it", () => {
    const root = workspace({
      "docs/a.md":
        "# A (#a)\n\n[sdk](/sdk/js/start) [tool](/tool) [status](/status-page)\n",
    })
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, "library"),
    })
    expect(checkReferences(library).issues.map((i) => i.reference)).toEqual([
      "/sdk/js/start",
      "/tool",
      "/status-page",
    ])
    const result = checkReferences(library, {
      externalPaths: ["/sdk", "tool/"],
    })
    expect(result.issues.map((i) => i.reference)).toEqual(["/status-page"])
    expect(isExternalPath("/sdk-tools/x", ["/sdk"])).toBe(false)
    expect(isExternalPath("/sdk?x=1#y", ["/sdk"])).toBe(true)
    expect(isExternalPath("//sdk/x", ["/sdk"])).toBe(false)
    expect(isExternalPath("/anything", ["/"])).toBe(false)
  })

  it("looks a root-relative document link up once more without the deployment base", () => {
    const root = workspace({
      "docs/a.md": "# A (#a)\n\n[b](/project/b.md#b) [c](/project/c.md)\n",
      "docs/b.md": "# B (#b)\n",
    })
    const library = buildDocuments({
      sourceRoot: path.join(root, "docs"),
      outDir: path.join(root, "library"),
    })
    const withoutBase = (pathname: string) =>
      pathname.replace(/^\/project(?=\/|$)/, "") || "/"
    expect(checkReferences(library).issues).toHaveLength(2)
    const result = checkReferences(library, { withoutBase })
    expect(result.issues.map((i) => [i.code, i.reference])).toEqual([
      ["missing-document", "/project/c.md"],
    ])
  })

  it("hands a host compiler the real file when it recompiles a replaced slice", async () => {
    const root = workspace(TWO_ROOTS)
    const paths: string[] = []
    const library = await buildDocumentsAsync({
      roots: roots(root),
      outDir: path.join(root, "library"),
      compilerId: "test",
      async compiler(source, context) {
        paths.push(context.filePath)
        return compileDocument(source, context.options)
      },
    })
    paths.length = 0
    const resolved = await resolveEmbedAsync(
      library,
      {
        sources: ["/terms/ko/token.md#token"],
        replace: [{ find: "a token", replace: "an access token" }],
      },
      { documentId: "docs/ko/guide" },
    )
    expect(renderDocument(resolved)).toContain("an access token")
    expect(paths).toEqual([path.join(root, "glossary/ko/token.md")])
  })
})

describe("datasets over a library with roots", () => {
  it("scopes by the segment after the base and leaves private documents out", () => {
    const root = workspace(TWO_ROOTS)
    const outDir = path.join(root, "library")
    buildDocuments({ roots: roots(root), outDir, private: ["docs/in/**"] })
    expect(scopeOf("docs/ko/guide", ["docs", "terms"])).toBe("ko")
    expect(scopeOf("terms/ko/token", ["docs", "terms"])).toBe("ko")
    expect(scopeOf("docs/ko/guide", [""])).toBe("docs")
    expect(scopeOf("docs/api/x", ["docs", "docs/api"])).toBe("x")

    const ko = generateDataset({
      inputDir: path.join(outDir, "documents"),
      outDir: path.join(root, "dataset-ko"),
      library: outDir,
      scopes: ["ko"],
    })
    expect(ko.documents.map((doc) => doc.id)).toEqual([
      "docs/ko/guide",
      "docs/ko/setup",
      "terms/ko/token",
    ])
    const all = generateDataset({
      inputDir: path.join(outDir, "documents"),
      outDir: path.join(root, "dataset-all"),
      library: outDir,
    })
    expect(all.documents.map((doc) => doc.id)).not.toContain("docs/in/secret")
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "dataset-all/manifest.json"), "utf8"),
    )
    expect(manifest.scopes).toEqual(["en", "ko"])
    expect(() =>
      generateDataset({
        inputDir: path.join(outDir, "documents"),
        outDir: path.join(root, "dataset-private"),
        library: outDir,
        documents: ["docs/in/secret"],
      }),
    ).toThrow(/is private/)

    // Without the library, the first segment is the scope, as for a plain
    // directory of ASTs.
    const plain = generateDataset({
      inputDir: path.join(outDir, "documents"),
      outDir: path.join(root, "dataset-plain"),
      scopes: ["terms"],
    })
    expect(plain.documents.map((doc) => doc.id)).toEqual(["terms/ko/token"])
  })
})
