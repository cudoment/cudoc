import path from "node:path"
import type { Root, RootContent } from "hast"
import type { Library, StoredDocument } from "@cudoment/cudoc/node/library"

export type SiteLinkMode = "relative" | "host" | "none"
export const externalUrl = (url: string) =>
  /^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)

export function deploymentUrl(
  mode: SiteLinkMode,
  value?: string,
): URL | undefined {
  if (!["relative", "host", "none"].includes(mode))
    throw new Error(`cudoc-export: invalid links mode: ${mode}`)
  if (value === undefined && mode !== "host") return undefined
  let url: URL
  try {
    url = new URL(value ?? "")
  } catch {
    throw new Error(
      "cudoc-export: host links require an absolute HTTP(S) hostUrl",
    )
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "cudoc-export: hostUrl must be HTTP(S) without credentials, query or fragment",
    )
  url.pathname = url.pathname.replace(/\/?$/, "/")
  return url
}

/** Document routes are relative to the deployment; already-prefixed routes stay intact. */
export function hostedRoute(route: string, base: URL): string {
  const prefix = base.pathname.replace(/\/$/, "")
  return new URL(
    prefix && (route === prefix || route.startsWith(`${prefix}/`))
      ? route
      : `${base.pathname}${route.replace(/^\//, "")}`,
    base,
  ).href
}

export function createTargets(library: Library, base?: URL) {
  const key = (value: string) =>
    decodeURIComponent(value).replace(/\/$/, "") || "/"
  const routes = new Map(library.documents.map((doc) => [key(doc.route), doc]))
  const documents = new Map(library.documents.map((doc) => [doc.id, doc]))
  const withoutBase = (pathname: string) => {
    const prefix = base?.pathname.replace(/\/$/, "")
    return prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))
      ? pathname.slice(prefix.length) || "/"
      : pathname
  }
  return {
    withoutBase,
    find(url: string, from: StoredDocument) {
      const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/)!
      if (!pathname) return { document: from, suffix }
      const decoded = decodeURIComponent(pathname)
      const sourcePath = path.posix.normalize(
        decoded.startsWith("/")
          ? decoded.slice(1)
          : path.posix.join(path.posix.dirname(from.sourcePath), decoded),
      )
      const routePath = new URL(url, `https://cudoc.invalid${from.route}`)
        .pathname
      const route =
        routes.get(key(pathname.startsWith("/") ? pathname : routePath)) ??
        routes.get(
          key(withoutBase(pathname.startsWith("/") ? pathname : routePath)),
        )
      const id = sourcePath.replace(/\.(?:mdx?|html)$/i, "").replace(/\/$/, "")
      const bySource = documents.get(id) ?? documents.get(`${id}/index`)
      // Markdown references name source files; extensionless/native URLs name routes.
      return {
        document: /\.mdx?$/i.test(pathname)
          ? (bySource ?? route)
          : (route ?? bySource),
        suffix,
      }
    },
  }
}

/** Apply to the complete page, including generated navigation and raw HTML. */
export function rewritePageLinks(
  tree: Root,
  mode: SiteLinkMode,
  rewrite: (url: string) => string,
): void {
  const walk = (node: Root | RootContent) => {
    if (node.type === "element" && ["a", "area"].includes(node.tagName)) {
      if (mode === "none") {
        if (node.tagName === "a") node.tagName = "span"
        for (const key of [
          "href",
          "xLinkHref",
          "target",
          "rel",
          "download",
          "ping",
          "hrefLang",
          "referrerPolicy",
          "tabIndex",
        ])
          delete node.properties[key]
        if (node.properties.role === "link") delete node.properties.role
      } else {
        for (const key of ["href", "xLinkHref"]) {
          const url = node.properties[key]
          if (typeof url === "string" && !externalUrl(url))
            node.properties[key] = rewrite(url)
        }
      }
    }
    if ("children" in node) node.children.forEach(walk)
  }
  walk(tree)
}
