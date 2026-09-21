#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import {
  buildExport,
  type ExportFormat,
  type ExportGranularity,
} from "./export.js"
import { browserInstallCommand } from "./pdf.js"
import { runAnnotationsCommand } from "./annotations/cli.js"
import type { SiteOptions } from "./index.js"
import type { PaperSize } from "./design/page.js"

const USAGE = `Usage: cudoc-export <build|install-browser>

cudoc-export build [sourceRoot] [--out-dir site] [--config config.mjs]
  [--format html|pdf|docx] [--granularity documents|volume|both]
  [--library directory] [--links relative|host|none]
  [--host-url https://example.com/] [--asset-dir directory]
  [--external-path /prefix] [--paper A4|Letter] [--landscape]
  [--annotations] [--theme-switch]

cudoc-export annotations [notes.json...] [--token token]... --library directory
  [--out report.md] [--json]

cudoc-export install-browser`

const VALUE_FLAGS = [
  "--out-dir",
  "--config",
  "--library",
  "--links",
  "--host-url",
  "--asset-dir",
  "--external-path",
  "--format",
  "--granularity",
  "--paper",
]
const BOOLEAN_FLAGS = ["--landscape", "--annotations", "--theme-switch"]

try {
  const args = process.argv.slice(2)
  if (args[0] === "annotations") {
    const result = runAnnotationsCommand(args.slice(1))
    if (result.exitCode !== 0) console.error(result.output)
    else if (result.outFile)
      console.error(`cudoc-export: wrote ${result.outFile}`)
    else process.stdout.write(result.output)
    process.exitCode = result.exitCode
  } else if (args[0] === "install-browser") {
    const [command, commandArgs] = browserInstallCommand()
    const result = spawnSync(command, commandArgs, { stdio: "inherit" })
    process.exitCode = result.status ?? 1
  } else if (args[0] === "build") {
    const options: Record<string, string> = {}
    const assetDirs: string[] = []
    const externalPaths: string[] = []
    const formats: ExportFormat[] = []
    const flags = new Set<string>()
    let sourceRoot: string | undefined
    for (let i = 1; i < args.length; i++) {
      const argument = args[i]!
      if (VALUE_FLAGS.includes(argument)) {
        const next = args[i + 1]
        if (!next || next.startsWith("--"))
          throw new Error(`Missing value for ${argument}`)
        i += 1
        // Repeatable flags replace the config's array rather than adding to it.
        if (argument === "--asset-dir") assetDirs.push(next)
        else if (argument === "--external-path") externalPaths.push(next)
        else if (argument === "--format") formats.push(next as ExportFormat)
        else options[argument] = next
      } else if (BOOLEAN_FLAGS.includes(argument)) flags.add(argument)
      else if (!argument.startsWith("-") && !sourceRoot) sourceRoot = argument
      else throw new Error(`Unknown argument: ${argument}`)
    }
    const configPath = options["--config"]
    const config = configPath
      ? configPath.endsWith(".json")
        ? JSON.parse(fs.readFileSync(configPath, "utf8"))
        : (await import(pathToFileURL(path.resolve(configPath)).href)).default
      : {}
    const page = {
      ...config.page,
      ...(options["--paper"] ? { paper: options["--paper"] as PaperSize } : {}),
      ...(flags.has("--landscape")
        ? { orientation: "landscape" as const }
        : {}),
    }
    const result = await buildExport({
      ...config,
      // A config that lists roots keeps them unless a source root is given
      // on the command line, which then replaces them.
      ...(sourceRoot || !config.roots
        ? {
            sourceRoot: sourceRoot ?? config.sourceRoot ?? "docs",
            roots: undefined,
          }
        : {}),
      outDir: options["--out-dir"] ?? config.outDir ?? "site",
      library: options["--library"] ?? config.library,
      links: (options["--links"] ?? config.links) as SiteOptions["links"],
      hostUrl: options["--host-url"] ?? config.hostUrl,
      assetDirs: assetDirs.length ? assetDirs : config.assetDirs,
      externalPaths: externalPaths.length
        ? externalPaths
        : config.externalPaths,
      formats: formats.length ? formats : config.formats,
      granularity: (options["--granularity"] ??
        config.granularity) as ExportGranularity,
      ...(flags.has("--annotations") ? { annotations: true } : {}),
      ...(flags.has("--theme-switch") ? { themeSwitch: true } : {}),
      ...(Object.keys(page).length ? { page } : {}),
    })
    // What a format left out goes to stderr, so a script reading the JSON
    // result on stdout still sees it.
    for (const diagnostic of result.diagnostics)
      console.error(
        `cudoc-export: ${diagnostic.document}: ${diagnostic.message}`,
      )
    console.log(JSON.stringify(result))
  } else throw new Error(USAGE)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
