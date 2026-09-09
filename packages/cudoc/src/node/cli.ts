#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { buildDocuments, buildDocumentsAsync } from "./library.js"
import { prepareEmbeds } from "./prepare-embeds.js"
import { generateDataset } from "./dataset.js"

try {
  const [command, ...args] = process.argv.slice(2)
  if (
    !["collect", "dataset"].includes(command) ||
    args.length !== 2 ||
    args[0] !== "--config"
  )
    throw new Error("Usage: cudoc <collect|dataset> --config config.mjs")
  const config = args[1].endsWith(".json")
    ? JSON.parse(fs.readFileSync(args[1], "utf8"))
    : (await import(pathToFileURL(path.resolve(args[1])).href)).default
  if (command === "dataset")
    console.log(JSON.stringify(generateDataset(config)))
  else {
    const library = config.compiler
      ? await buildDocumentsAsync({
          ...config,
          compiler: async (
            ...parameters: Parameters<NonNullable<typeof config.compiler>>
          ) => config.compiler(...parameters),
        })
      : buildDocuments(config)
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
