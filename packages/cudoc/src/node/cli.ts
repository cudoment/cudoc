#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { buildDocuments, buildDocumentsAsync } from "./library.js"
import { prepareEmbeds } from "./prepare-embeds.js"
import { generateDataset } from "./dataset.js"
import { checkReferences } from "./check.js"
import { formatCheckResult } from "./report.js"

const USAGE =
  "Usage: cudoc <collect|check|dataset> --config config.mjs [--format text|json] [--strict]"

try {
  const argv = process.argv.slice(2)
  const [command] = argv
  const flags = new Set(argv.filter((value) => value.startsWith("--")))
  const configIndex = argv.indexOf("--config")
  if (
    !["collect", "check", "dataset"].includes(command) ||
    configIndex === -1 ||
    !argv[configIndex + 1]
  )
    throw new Error(USAGE)
  const configPath = argv[configIndex + 1]
  const config = configPath.endsWith(".json")
    ? JSON.parse(fs.readFileSync(configPath, "utf8"))
    : (await import(pathToFileURL(path.resolve(configPath)).href)).default

  const collect = async () => {
    const library = config.compiler
      ? await buildDocumentsAsync({
          ...config,
          compiler: async (
            ...parameters: Parameters<NonNullable<typeof config.compiler>>
          ) => config.compiler(...parameters),
        })
      : buildDocuments(config)
    return library
  }

  if (command === "dataset")
    console.log(JSON.stringify(generateDataset(config)))
  else if (command === "check") {
    // Checking reads the same collection the build does, so it sees exactly
    // what the site will render. It writes nothing.
    const result = checkReferences(await collect(), config.check ?? {})
    const json = argv[argv.indexOf("--format") + 1] === "json"
    console.log(
      json ? JSON.stringify(result, null, 2) : formatCheckResult(result),
    )
    const blocking = result.issues.filter(
      (issue) => issue.severity === "error" || flags.has("--strict"),
    )
    if (blocking.length) process.exitCode = 1
  } else {
    const library = await collect()
    await prepareEmbeds(library, config.outDir)
    console.log(
      JSON.stringify({
        documentCount: library.documents.length,
        outDir: config.outDir ?? ".cudoc/documents",
      }),
    )
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
