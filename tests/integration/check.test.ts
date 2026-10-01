/**
 * Reference checking against each host's own compiler.
 *
 * The checker reads a collected library, so what it sees is whatever the host
 * compiler produced: its heading ids, its links, its source snapshot. A host
 * that slugs differently, resolves link destinations during rendering, or
 * strips front matter before parsing gives the checker a different tree for the
 * same Markdown. Each case is therefore asserted per host rather than once.
 *
 * Adding a diagnostic means adding one row to `CASES`. It then runs on every
 * installed host, including any host added to `hosts.ts` afterwards.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { buildDocumentsAsync } from "@cudoment/cudoc/node/library"
import type { Library } from "@cudoment/cudoc/node/library"
import type { DocumentNode } from "@cudoment/cudoc/document"
import { checkReferences } from "@cudoment/cudoc/node/check"
import type {
  CheckResult,
  ReferenceIssueCode,
} from "@cudoment/cudoc/node/check"
import { HOST_CASES, OPTIONS } from "./hosts.js"

/** The document every case links into. Anchors here are explicit and stable. */
const TARGET = [
  "# Reference (#reference)",
  "",
  "## Limits (#limits)",
  "",
  "Body.",
  "",
  "## Repeated",
  "",
  "First.",
  "",
  "## Repeated",
  "",
  "Second.",
  "",
].join("\n")

type Case = {
  /** The diagnostic this document is written to produce. */
  code: ReferenceIssueCode
  markdown: string
  severity?: "error" | "warning"
  /** Extra assertions beyond the code appearing exactly once. */
  also?: (result: CheckResult) => void
}

const CASES: Case[] = [
  {
    code: "missing-anchor",
    markdown: "# A (#a)\n\n[typo](reference.md#limit)\n",
    also: (result) => {
      // Real anchor names rather than a guess, so an author can see the fix.
      expect(result.issues[0]!.available).toContain("limits")
    },
  },
  {
    code: "missing-document",
    markdown: "# A (#a)\n\n[gone](nowhere.md)\n",
  },
  {
    code: "missing-asset",
    markdown: "# A (#a)\n\n![gone](./missing.png)\n",
  },
  {
    code: "missing-embed-source",
    markdown: "# A (#a)\n\n```cudoc-embed\nsources: [ghost.md]\n```\n",
  },
  {
    code: "missing-embed-anchor",
    markdown:
      "# A (#a)\n\n```cudoc-embed\nsources: [reference.md#nosuch]\n```\n",
  },
  {
    code: "empty-anchor",
    markdown: "# A (#)\n\ntext\n",
  },
  {
    code: "unstable-anchor-link",
    severity: "warning",
    markdown: "# A (#a)\n\n[moves](reference.md#repeated-1)\n",
  },
  {
    code: "invalid-embed-spec",
    markdown:
      '# A (#a)\n\n```cudoc-embed\nsources: [reference.md#limits]\nreplace:\n  - find: "a"\n    replace: "b"\n    regexp: true\n```\n',
    also: (result) => {
      // The typo is named. It used to pass, turning the pattern into a literal.
      expect(result.issues[0]!.message).toContain('unknown key "regexp"')
    },
  },
  {
    code: "empty-embed-cell",
    severity: "warning",
    markdown:
      "# A (#a)\n\n```cudoc-embed\nsources: [reference.md#limits]\nrender:\n  type: table\n  columns:\n    - { header: Field, value: { row: 1, column: 0 } }\n```\n",
    also: (result) => {
      // What was asked for and what the section has, so a wrong coordinate
      // reads differently from a missing table.
      expect(result.issues[0]!.message).toContain("expected table 0")
      expect(result.issues[0]!.message).toContain("found 0 tables")
    },
  },
  {
    code: "unmatched-embed-replacement",
    severity: "warning",
    markdown:
      '# A (#a)\n\n```cudoc-embed\nsources: [reference.md#limits]\nreplace:\n  - find: "was reworded away"\n    replace: "x"\n```\n',
  },
  {
    code: "unreplaceable-embed-section",
    // The quote's `>` stays on the lines after the heading, so the section's
    // text compiled on its own would be a quote again.
    // Another heading follows in the quote, so the reason is the marks
    // themselves on every host, not the end of the quote.
    markdown:
      "# A (#a)\n\n> ## Quote (#quote)\n>\n> Alpha\n>\n> ## Next (#next)\n>\n> Gamma\n\n```cudoc-embed\nsources: [subject.md#quote]\nreplace:\n  - find: Alpha\n    replace: Beta\n```\n",
    also: (result) => {
      expect(result.issues[0]!.message).toContain(
        "subject#quote starts inside a quote, and the `>` marks stay on the lines after its heading",
      )
    },
  },
  {
    code: "cyclic-embed",
    // The document embeds itself whole, so the copy holds the block again.
    markdown: "# A (#a)\n\n```cudoc-embed\nsources: [subject.md]\n```\n",
    also: (result) => {
      expect(result.issues[0]!.message).toContain("subject#* -> subject#*")
    },
  },
]

/**
 * Where an embed's error lands in pages of different shapes. The checker finds
 * the fence in the source text, so the host's tree has to name the same
 * blocks, in the same order, with the same text.
 */
const PLACED: {
  shape: string
  markdown: string
  at: { line: number; column: number }
}[] = [
  {
    shape: "after front matter",
    markdown:
      "---\ntitle: A\n---\n\n# A (#a)\n\n```cudoc-embed\nsources: [missing.md\n```\n",
    at: { line: 8, column: 21 },
  },
  {
    shape: "in a list item after an embed in a callout",
    markdown:
      "# A (#a)\n\n> [!NOTE]\n> ```cudoc-embed\n> sources: [reference.md#limits]\n> ```\n\n- A list item\n\n  ```cudoc-embed\n  sources: [missing.md\n  ```\n",
    at: { line: 11, column: 23 },
  },
  {
    shape: "after an embed shown in an indented example",
    markdown:
      "# A (#a)\n\n    ```cudoc-embed\n    sources: [x.md]\n    ```\n\n```cudoc-embed\nsources: [missing.md\n```\n",
    at: { line: 8, column: 21 },
  },
  {
    shape: "inside a container",
    markdown:
      "# A (#a)\n\n:::tip\n\n```cudoc-embed\nsources: [missing.md\n```\n\n:::\n",
    at: { line: 6, column: 21 },
  },
]

/** A document with nothing wrong, present in every run as a control. */
const CLEAN = "# Clean (#clean)\n\n[fine](reference.md#limits)\n"

for (const host of HOST_CASES) {
  const suite = host.compiler ? describe : describe.skip
  suite(`${host.name}: reference checking`, () => {
    let workspace: string
    type Attempt =
      { result: CheckResult; library: Library } | { rejected: string }
    const results = new Map<ReferenceIssueCode, Attempt>()
    const placed = new Map<string, Attempt>()
    let clean: CheckResult
    let duplicate: { result: CheckResult; library: Library }
    let component: Attempt
    let imported: Awaited<ReturnType<typeof attempt>>
    let rewrittenComponent: Attempt
    let rewrittenCycle: Attempt

    let scenario = 0
    const collect = async (files: Record<string, string>) => {
      // Each scenario gets fresh directories. The library path must not exist
      // yet: collection refuses to publish over a directory it does not own.
      const id = `case-${++scenario}`
      const source = path.join(workspace, id, "docs")
      fs.mkdirSync(source, { recursive: true })
      for (const [name, content] of Object.entries(files))
        fs.writeFileSync(path.join(source, name), content)
      const compile = await host.compiler!()
      const library = await buildDocumentsAsync({
        ...OPTIONS,
        sourceRoot: source,
        outDir: path.join(workspace, id, "library"),
        host: host.host,
        compilerId: `${host.name}-check`,
        // The context is passed through untouched so the format collection
        // derived from the extension survives: one case deliberately writes an
        // `.mdx` document, and a host told to compile it as Markdown would
        // never produce the component that case is about.
        async compiler(text, context) {
          return compile(text, context)
        },
      })
      return { result: checkReferences(library), library }
    }

    /**
     * Collection, or the reason the host refused it.
     *
     * Hosts disagree about how much they tolerate. Docusaurus's MDX loader
     * throws on an image that does not resolve, so a document the checker would
     * report never compiles there at all. Refusing early is a legitimate
     * answer, and the assertion below accepts either.
     */
    const attempt = async (files: Record<string, string>) => {
      try {
        return await collect(files)
      } catch (error) {
        return { rejected: (error as Error).message }
      }
    }

    beforeAll(async () => {
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cudoc-check-"))
      // Each case gets its own library: one document's errors must not mask
      // another's, and a duplicate anchor used to stop collection entirely.
      for (const entry of CASES)
        results.set(
          entry.code,
          await attempt({
            "reference.md": TARGET,
            "subject.md": entry.markdown,
          }),
        )
      for (const entry of PLACED)
        placed.set(
          entry.shape,
          await attempt({
            "reference.md": TARGET,
            "subject.md": entry.markdown,
          }),
        )
      clean = (await collect({ "reference.md": TARGET, "subject.md": CLEAN }))
        .result
      duplicate = await collect({
        "reference.md": TARGET,
        "subject.md":
          "# A (#a)\n\n## One (#same)\n\nx\n\n## Two (#same)\n\ny\n",
      })
      component = await attempt({
        "widget.mdx":
          "# W (#w)\n\n## Live (#live)\n\n<Chart data={points} />\n",
        "subject.md":
          "# A (#a)\n\n```cudoc-embed\nsources: [widget.mdx#live]\n```\n",
      })
      imported = await attempt({
        "widget.mdx":
          'import Chart from "./chart.jsx"\n\n# W (#w)\n\n## Live (#live)\n\n<Chart data={points} />\n',
        "subject.md":
          "# A (#a)\n\n```cudoc-embed\nsources: [widget.mdx#live]\n```\n",
      })
      rewrittenComponent = await attempt({
        "widget.mdx":
          'import Chart from "./chart.jsx"\n\n# W (#w)\n\n## Live (#live)\n\n<Chart data={points} />\n',
        "subject.md":
          '# A (#a)\n\n```cudoc-embed\nsources: [widget.mdx#live]\nreplace:\n  - find: "<Chart data={points} />"\n    replace: "A chart of the week."\n```\n',
      })
      rewrittenCycle = await attempt({
        "reference.md": TARGET,
        "loop.md":
          "# L (#l)\n\n## Loop (#loop)\n\n```cudoc-embed\nsources: [reference.md#limits]\n```\n",
        "subject.md":
          "# A (#a)\n\n```cudoc-embed\nsources: [loop.md#loop]\nreplace:\n  - find: reference.md#limits\n    replace: subject.md\n```\n",
      })
    }, 120_000)

    afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }))

    it("reports nothing for a document whose references all resolve", () => {
      expect(clean.issues).toEqual([])
      expect(clean.documentCount).toBe(2)
    })

    for (const entry of CASES)
      it(`reports ${entry.code}`, () => {
        const attempted = results.get(entry.code)!
        // A host that refuses to compile the document has already stopped the
        // problem, which is the outcome the diagnostic exists to produce.
        if ("rejected" in attempted) {
          expect(attempted.rejected).toBeTruthy()
          return
        }
        const result = attempted.result
        const matching = result.issues.filter(
          (issue) => issue.code === entry.code,
        )

        expect(
          matching,
          `got ${JSON.stringify(result.issues.map((i) => i.code))}`,
        ).toHaveLength(1)
        expect(matching[0]!.severity).toBe(entry.severity ?? "error")
        expect(matching[0]!.documentId).toBe("subject")
        // A coordinate recovered from the source, not a stale stored position.
        expect(matching[0]!.position?.start.line).toBeGreaterThan(0)
        entry.also?.({ ...result, issues: matching })
      })

    for (const entry of PLACED)
      it(`places an embed error ${entry.shape}`, () => {
        const attempted = placed.get(entry.shape)!
        expect(attempted).not.toHaveProperty("rejected")
        const { issues } = (attempted as { result: CheckResult }).result
        expect(issues.map((issue) => issue.code)).toEqual([
          "invalid-embed-spec",
        ])
        expect(issues[0]!.position?.start).toEqual(entry.at)
      })

    it("never lets two headings keep one anchor between them", () => {
      // Docusaurus and Nextra run a slug-shaped heading id through their
      // slugger after cudoc, so a duplicate explicit anchor is disambiguated
      // before it reaches the tree and there is nothing left to report. The
      // other hosts keep the ids cudoc settled, and the checker reports it.
      // Either way the document must not ship two headings that answer to the
      // same anchor, which is the property that matters.
      const subject = duplicate.library.documents.find(
        (doc) => doc.id === "subject",
      )!
      const walk = (node: DocumentNode): DocumentNode[] => [
        node,
        ...(node.children ?? []).flatMap(walk),
      ]
      const ids = walk(subject.tree as unknown as DocumentNode)
        .filter((node) => node.type === "heading")
        .map((node) => node.data?.hProperties?.id)
        .filter((id): id is string => typeof id === "string")
      const reported = duplicate.result.issues.filter(
        (issue) => issue.code === "duplicate-anchor",
      )

      if (host.name === "nextra" || host.name === "docusaurus") {
        expect(ids).toEqual(["a", "same", "same-1"])
        expect(reported).toHaveLength(0)
      } else {
        expect(ids).toEqual(["a", "same", "same"])
        expect(reported).toHaveLength(1)
      }
    })

    it("never lets an embed copy a component without saying so", () => {
      // Hosts reach this from opposite directions. The markdown-it hosts have
      // no MDX to parse and refuse the document outright, which stops the
      // problem at collection. The MDX hosts compile it, so the component
      // really does land in the copy and the checker has to name it. Both are
      // acceptable; a host that collects it and stays silent is not, because
      // the failure would then surface only at HTML export.
      if ("rejected" in component) {
        expect(component.rejected).toMatch(/mdx/i)
        return
      }
      const reported = component.result.issues.filter(
        (issue) => issue.code === "unportable-embed-component",
      )

      expect(reported).toHaveLength(1)
      expect(reported[0]!.severity).toBe("warning")
      expect(reported[0]!.message).toContain("<Chart>")
    })

    it("never lets an embed copy a component whose import stays behind", () => {
      // The same two directions as above. On an MDX host the import is real,
      // the copy would land in a document without it, and the checker has to
      // say so before the page fails to render.
      if ("rejected" in imported) {
        expect(imported.rejected).toMatch(/mdx/i)
        return
      }
      const reported = imported.result.issues.filter(
        (issue) => issue.code === "imported-embed-component",
      )

      expect(reported).toHaveLength(1)
      expect(reported[0]!.severity).toBe("error")
      expect(reported[0]!.message).toContain("<Chart>")
      expect(reported[0]!.message).toContain("subject has no such import")
    })

    it("inspects the copy a replace rule rewrote, not the section as collected", () => {
      // The rule turns the component into prose, so the copy the build
      // splices in carries nothing to report. The checker has only the
      // standalone compiler here, as `cudoc check` does, and reads the
      // rewritten section with this host's options.
      if ("rejected" in rewrittenComponent) {
        expect(rewrittenComponent.rejected).toMatch(/mdx/i)
        return
      }
      expect(rewrittenComponent.library.compiler).toBeUndefined()
      expect(rewrittenComponent.result.issues).toEqual([])
    })

    it("follows a cycle that only the rewritten copy makes", () => {
      // `loop.md#loop` embeds the reference; the rule points that nested
      // embed back at the subject, which embeds the loop again.
      if ("rejected" in rewrittenCycle) throw new Error(rewrittenCycle.rejected)
      const cycles = rewrittenCycle.result.issues.filter(
        (issue) => issue.code === "cyclic-embed",
      )
      expect(cycles.map((issue) => issue.documentId)).toEqual(["subject"])
      expect(cycles[0]!.message).toContain(
        "loop#loop -> subject#* -> loop#loop",
      )
    })
  })
}

describe("diagnostic coverage", () => {
  it("exercises every code the checker can emit", () => {
    // A new code added to the union without a case here would ship
    // unverified on every host; `satisfies` makes the type check name it.
    const documented = Object.keys({
      "missing-document": true,
      "missing-anchor": true,
      "missing-asset": true,
      "duplicate-anchor": true,
      "empty-anchor": true,
      "unstable-anchor-link": true,
      "missing-embed-source": true,
      "missing-embed-anchor": true,
      "invalid-embed-spec": true,
      "unmatched-embed-replacement": true,
      "unreplaceable-embed-section": true,
      "empty-embed-cell": true,
      "unportable-embed-component": true,
      "imported-embed-component": true,
      "cyclic-embed": true,
    } satisfies Record<ReferenceIssueCode, true>)

    // Three are asserted separately, because whether they can occur at all
    // depends on the host rather than on the document: Docusaurus and Nextra
    // re-slug away a duplicate anchor, and the markdown-it hosts cannot parse
    // the MDX a copied or imported component would have to come from.
    expect(
      new Set([
        ...CASES.map((entry) => entry.code),
        "duplicate-anchor",
        "unportable-embed-component",
        "imported-embed-component",
      ]),
    ).toEqual(new Set(documented))
  })
})
