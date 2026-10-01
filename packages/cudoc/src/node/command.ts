/**
 * The `cudoc` command line as a function: arguments in, exit code out. The
 * installed binary (`cli.ts`) runs it with the process's own streams; a test
 * calls it directly. It is not a package entry point.
 */

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { loadLibrary } from "./library.js"
import { generateDataset } from "./dataset.js"
import { checkReferences } from "./check.js"
import { formatCheckResult } from "./report.js"
import { collectDocuments, watchDocuments } from "./watch.js"

export const USAGE =
  "Usage: cudoc <collect|check|dataset> --config config.mjs [--watch] [--format text|json] [--strict]"

/** Where the command writes: standard output and standard error. */
export type CommandOutput = {
  out(text: string): void
  error(value: unknown): void
}

/**
 * What the process prints for a failure. cudoc's own errors describe the
 * document and are printed as they read; anything else keeps its stack, since
 * it is a fault rather than a finding.
 */
export const describeError = (value: unknown): unknown => {
  if (
    !(value instanceof Error) ||
    !(/^cudoc[\w-]*: /.test(value.message) || value.message === USAGE)
  )
    return value
  // A finding may wrap what caused it, a parser's message for instance. A
  // cause the message already repeats, as a block's names its resolver's,
  // adds nothing.
  let text = value.message
  for (
    let cause: unknown = value.cause;
    cause !== undefined;
    cause = cause instanceof Error ? cause.cause : undefined
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    if (!text.includes(reason.replace(/^cudoc[\w-]*: /, "")))
      text += `\n  caused by: ${reason}`
  }
  return text
}

const processOutput: CommandOutput = {
  out: (text) => console.log(text),
  error: (value) => console.error(describeError(value)),
}

/**
 * Runs one command. Resolves with the exit code; a `collect --watch` resolves
 * after its first pass and keeps watching until the process is signalled.
 */
export async function runCommand(
  argv: string[],
  io: CommandOutput = processOutput,
): Promise<number> {
  try {
    const [command] = argv
    const flags = new Set(argv.filter((value) => value.startsWith("--")))
    const configIndex = argv.indexOf("--config")
    const formatIndex = argv.indexOf("--format")
    const format = formatIndex === -1 ? "text" : argv[formatIndex + 1]
    if (
      !["collect", "check", "dataset"].includes(command ?? "") ||
      configIndex === -1 ||
      !argv[configIndex + 1] ||
      (format !== "text" && format !== "json")
    )
      throw new Error(USAGE)
    const configPath = argv[configIndex + 1]!
    const config = configPath.endsWith(".json")
      ? JSON.parse(fs.readFileSync(configPath, "utf8"))
      : (await import(pathToFileURL(path.resolve(configPath)).href)).default

    if (command === "dataset") {
      io.out(JSON.stringify(generateDataset(config)))
      return 0
    }
    if (command === "check") {
      // Checking reads the library the last collection published, which is
      // the one the host build renders from, and writes nothing. It needs no
      // compiler: a host's collector script keeps that, not this config.
      const outDir = config.outDir ?? ".cudoc/documents"
      if (!fs.existsSync(path.join(outDir, "manifest.json")))
        throw new Error(
          `cudoc: no collected library in ${outDir}; collect documents before checking them`,
        )
      const library = loadLibrary(
        outDir,
        undefined,
        config.roots ?? config.sourceRoot,
      )
      // A stored library keeps no functions: a table column that names an
      // extractor is checked with the one the same configuration registers.
      if (config.extractors) library.extractors = config.extractors
      const result = checkReferences(library, config.check ?? {})
      io.out(
        format === "json"
          ? JSON.stringify(result, null, 2)
          : formatCheckResult(result),
      )
      const blocking = result.issues.filter(
        (issue) => issue.severity === "error" || flags.has("--strict"),
      )
      return blocking.length ? 1 : 0
    }
    if (flags.has("--watch")) {
      // The first pass starts from whatever the output directory holds, and
      // every pass reports what it compiled; a failed pass is a message and
      // the last good output stays in place.
      const watcher = watchDocuments(config, {
        onPass: ({
          documentCount,
          compiled,
          reused,
          blocks,
          reusedBlocks,
          outDir,
          elapsed,
        }) =>
          io.out(
            JSON.stringify({
              documentCount,
              compiled,
              reused,
              blocks,
              reusedBlocks,
              outDir,
              elapsed,
            }),
          ),
        onError: (error) => io.error(error),
      })
      const stop = () => {
        watcher.close()
        process.exit(0)
      }
      process.on("SIGINT", stop)
      process.on("SIGTERM", stop)
      await watcher.ready
      return 0
    }
    const { documentCount, outDir } = await collectDocuments(config)
    io.out(JSON.stringify({ documentCount, outDir }))
    return 0
  } catch (error) {
    io.error(error)
    return 1
  }
}
