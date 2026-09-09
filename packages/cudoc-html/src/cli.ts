#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { buildSite, type SiteOptions } from "./index.js"

try {
  const args = process.argv.slice(2)
  if (args[0] !== "build")
    throw new Error(
      "Usage: cudoc-html build [sourceRoot] [--out-dir site] [--config config.mjs] [--library directory] [--links relative|host|none] [--host-url https://example.com/] [--asset-dir directory]",
    )
  const options: Record<string, string> = {}
  const assetDirs: string[] = []
  let sourceRoot: string | undefined
  for (let i = 1; i < args.length; i++) {
    if (
      [
        "--out-dir",
        "--config",
        "--library",
        "--links",
        "--host-url",
        "--asset-dir",
      ].includes(args[i])
    ) {
      const key = args[i]
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error(`Missing value for ${key}`)
      const value = args[++i]
      if (key === "--asset-dir") assetDirs.push(value)
      else options[key] = value
    } else if (!args[i].startsWith("-") && !sourceRoot) sourceRoot = args[i]
    else throw new Error(`Unknown argument: ${args[i]}`)
  }
  const config = options["--config"]
    ? options["--config"].endsWith(".json")
      ? JSON.parse(fs.readFileSync(options["--config"], "utf8"))
      : (await import(pathToFileURL(path.resolve(options["--config"])).href))
          .default
    : {}
  console.log(
    JSON.stringify(
      buildSite({
        ...config,
        sourceRoot: sourceRoot ?? config.sourceRoot ?? "docs",
        outDir: options["--out-dir"] ?? config.outDir ?? "site",
        library: options["--library"] ?? config.library,
        links: (options["--links"] ?? config.links) as SiteOptions["links"],
        hostUrl: options["--host-url"] ?? config.hostUrl,
        assetDirs: assetDirs.length ? assetDirs : config.assetDirs,
      }),
    ),
  )
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
