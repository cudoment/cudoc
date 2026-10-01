// Checks a built documentation site before it is uploaded, on the very
// directory that is uploaded: every link inside it resolves to a file and an
// id that exist, nothing is spelled from the domain root (the site is served
// under /cudoc/), and version.json names the release being deployed.
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "node-html-parser"

/** The problems in a built site; an empty list is a site that may deploy. */
export function verifySite(dir, { version } = {}) {
  const problems = []
  const pages = fs
    .readdirSync(dir, { recursive: true })
    .map((file) => String(file).split(path.sep).join("/"))
    .filter((file) => file.endsWith(".html") && !file.includes(".print."))
  const ids = new Map()
  const idsOf = (file) => {
    if (!ids.has(file))
      ids.set(
        file,
        new Set(
          parse(fs.readFileSync(path.join(dir, file), "utf8"))
            .querySelectorAll("[id]")
            .map((element) => element.getAttribute("id")),
        ),
      )
    return ids.get(file)
  }
  let links = 0
  for (const page of pages) {
    const html = parse(fs.readFileSync(path.join(dir, page), "utf8"))
    for (const element of html.querySelectorAll("[href], [src]")) {
      for (const attribute of ["href", "src"]) {
        const value = element.getAttribute(attribute)
        if (!value || /^(?:[a-z][\w+.-]*:|#$)/i.test(value)) continue
        if (value.startsWith("/")) {
          problems.push(`${page}: ${value} is spelled from the domain root`)
          continue
        }
        links += 1
        const [file, fragment] = value.split("#")
        let target = file
          ? path.posix.normalize(
              path.posix.join(
                path.posix.dirname(page),
                decodeURIComponent(file.split("?")[0]),
              ),
            )
          : page
        const full = path.join(dir, target)
        if (fs.existsSync(full) && fs.statSync(full).isDirectory())
          target = path.posix.join(target, "index.html")
        if (!fs.existsSync(path.join(dir, target)))
          problems.push(`${page}: ${value} names a missing file`)
        else if (
          fragment &&
          target.endsWith(".html") &&
          !idsOf(target).has(decodeURIComponent(fragment))
        )
          problems.push(`${page}: ${value} names a missing id`)
      }
    }
  }
  if (version !== undefined) {
    const file = path.join(dir, "version.json")
    const stated = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8")).version
      : undefined
    if (stated !== version)
      problems.push(
        `version.json states ${stated ?? "nothing"}, not ${version}`,
      )
  }
  return { problems, pages: pages.length, links }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [dir, version] = process.argv.slice(2)
  const { problems, pages, links } = verifySite(dir, { version })
  if (problems.length) {
    console.error(problems.join("\n"))
    process.exitCode = 1
  } else console.log(`docs-site: ${pages} pages and ${links} links verified`)
}
