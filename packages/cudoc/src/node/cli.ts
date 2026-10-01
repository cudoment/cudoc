#!/usr/bin/env node
import { runCommand } from "./command.js"

process.exitCode = await runCommand(process.argv.slice(2))
