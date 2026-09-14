/**
 * Eleventy adapter.
 *
 * The arrangement itself is `installHostPlugin`, shared with the VitePress
 * adapter through `cudoc-markdown-it`, so the two markdown-it hosts cannot
 * quietly diverge. What is specific to Eleventy is described in the host
 * definition below: it passes the page data object as the markdown-it env, and
 * it strips front matter with gray-matter before markdown-it ever sees the
 * source, so collection has to strip it the same way.
 *
 * Eleventy runs Liquid over Markdown before markdown-it by default. cudoc reads
 * source positions out of the token stream, so a site using cudoc must set
 * `markdownTemplateEngine: false`; the plugin raises an error when it detects
 * that the source it received is not the file's own text.
 */

import markdownIt from "markdown-it"
import type MarkdownIt from "markdown-it"
import matter from "gray-matter"
import {
  installHostPlugin,
  createHostCompiler,
  type HostPluginOptions,
  type MarkdownItHost,
} from "cudoc-markdown-it"
import type { DocumentCompiler } from "@cudoment/cudoc/node/library"

export type EleventyOptions = HostPluginOptions

type EleventyPage = {
  filePathStem?: unknown
  inputPath?: unknown
  rawInput?: unknown
}

const readPage = (env: Record<string, unknown>): EleventyPage => {
  const page = env.page
  if (typeof page !== "object" || page === null)
    throw new Error(
      'cudoc-eleventy: the markdown-it env carries no Eleventy page data; install the renderer with eleventyConfig.setLibrary("md", md)',
    )
  return page as EleventyPage
}

const eleventy: MarkdownItHost = {
  adapter: "cudoc-eleventy",
  host: "eleventy",
  documentId: (env) => {
    const { filePathStem } = readPage(env)
    if (typeof filePathStem !== "string")
      throw new Error(
        "cudoc-eleventy: page.filePathStem is required to identify the collected document",
      )
    return filePathStem.replace(/^\//, "")
  },
  compilerEnv: ({ id, filePath }) => ({
    page: { inputPath: filePath, filePathStem: `/${id}` },
  }),
  frontmatter: (source) => {
    const parsed = matter(source)
    return { body: parsed.content, data: parsed.data }
  },
}

/**
 * Install on the markdown-it instance handed to `eleventyConfig.setLibrary`.
 *
 * Register the site's own markdown-it plugins first so their tokens already
 * exist when cudoc reads the stream.
 */
export default function cudocEleventy(
  md: MarkdownIt,
  options: EleventyOptions = {},
): void {
  installHostPlugin(md, options, eleventy)
  md.core.ruler.before("cudoc", "cudoc-eleventy-source", (state) => {
    const raw = (state.env as { page?: EleventyPage }).page?.rawInput
    if (typeof raw === "string" && raw !== state.src)
      throw new Error(
        "cudoc-eleventy: another template engine rewrote this Markdown before markdown-it; set markdownTemplateEngine: false",
      )
  })
}

/**
 * One markdown-it construction for both the Eleventy build and the collector.
 *
 * Eleventy's own defaults are applied first: HTML enabled, and indented code
 * blocks disabled, which is what Eleventy does to every renderer it is given.
 * `configure` receives the instance before cudoc is installed, which is where
 * `markdown-it-attrs` and `markdown-it-container` belong.
 */
export function createMarkdownRenderer(
  options: EleventyOptions = {},
  configure?: (md: MarkdownIt) => void,
): MarkdownIt {
  const md = markdownIt({ html: true })
  md.disable("code")
  configure?.(md)
  md.use(cudocEleventy, options)
  return md
}

/** Reuse the very same configured Eleventy renderer for collection and source replacements. */
export function createDocumentCompiler(md: MarkdownIt): DocumentCompiler {
  return createHostCompiler(md, eleventy)
}
