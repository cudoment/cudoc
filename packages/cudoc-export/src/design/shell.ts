/**
 * The page around a document: the header, the navigation on the left (LNB),
 * the contents of the page on the right (RNB) and the footer.
 *
 * Three layouts share it. A site page has all of them; the home page drops
 * the contents column; a single page, standalone or for review, has no
 * navigation, since the other documents are not beside it. Every link here
 * is written as a source path or an output path and goes through the link
 * policy with the rest of the page, so `none` removes it and `host` points
 * it at the deployment.
 */

import { escapeHtml } from "./styles.js"
import type { UiStrings } from "../locales.js"

export type ShellLink = { title: string; href: string }

export type ShellLanguage = {
  label: string
  lang: string
  href: string
  current: boolean
}

export type ShellNavItem =
  | { kind: "page"; title: string; href: string; current: boolean }
  | {
      kind: "group"
      title: string
      href?: string
      current: boolean
      open: boolean
      children: ShellNavItem[]
    }
  | { kind: "link"; title: string; href: string }

export type ShellToc = { depth: number; id: string; text: string }[]

export type ShellPage = {
  lang: string
  title: string
  /** Stylesheets, scripts and policy, already written as HTML. */
  head: string
  ui: UiStrings
  skip: boolean
  siteTitle: string
  /** Where the site title goes; a single page's title links nowhere. */
  homeHref?: string
  headerLinks: ShellLink[]
  languages: ShellLanguage[]
  layout: "site" | "home" | "single"
  navigation?: ShellNavItem[]
  /** Undefined for a page without contents. */
  toc?: ShellToc
  mainAttributes: string
  body: string
  footer: string
  /** Attributes for `<html>` besides `lang`, already written as HTML. */
  htmlAttributes?: string
}

const navList = (items: ShellNavItem[]): string =>
  `<ul>${items
    .map((item) => {
      if (item.kind === "page")
        return `<li><a data-cudoc-final href="${escapeHtml(item.href)}"${item.current ? ' aria-current="page"' : ""}>${escapeHtml(item.title)}</a></li>`
      if (item.kind === "link")
        return `<li class="nav-external"><a data-cudoc-final href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></li>`
      const label = item.href
        ? `<a data-cudoc-final href="${escapeHtml(item.href)}"${item.current ? ' aria-current="page"' : ""}>${escapeHtml(item.title)}</a>`
        : `<span>${escapeHtml(item.title)}</span>`
      return `<li class="nav-group"><details${item.open ? " open" : ""}><summary>${label}</summary>${navList(item.children)}</details></li>`
    })
    .join("")}</ul>`

const tocList = (toc: ShellToc): string =>
  `<ul>${toc
    .map(
      (entry) =>
        `<li data-depth="${entry.depth}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`,
    )
    .join("")}</ul>`

export function renderShell(page: ShellPage): string {
  const { ui } = page
  const headerEnd =
    page.headerLinks.length || page.languages.length
      ? `<div class="header-end">${
          page.headerLinks.length
            ? `<nav class="header-links">${page.headerLinks
                .map(
                  (link) =>
                    `<a data-cudoc-final href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>`,
                )
                .join("")}</nav>`
            : ""
        }${
          page.languages.length
            ? `<nav class="languages" aria-label="${escapeHtml(ui.language)}"><ul>${page.languages
                .map((language) =>
                  language.current
                    ? `<li><span aria-current="true" lang="${escapeHtml(language.lang)}">${escapeHtml(language.label)}</span></li>`
                    : `<li><a data-cudoc-final href="${escapeHtml(language.href)}" hreflang="${escapeHtml(language.lang)}" lang="${escapeHtml(language.lang)}">${escapeHtml(language.label)}</a></li>`,
                )
                .join("")}</ul></nav>`
            : ""
        }</div>`
      : ""
  const title = page.homeHref
    ? `<a data-cudoc-final href="${escapeHtml(page.homeHref)}">${escapeHtml(page.siteTitle)}</a>`
    : `<span>${escapeHtml(page.siteTitle)}</span>`
  const classes = [
    "layout",
    ...(page.layout === "single" ? ["single"] : []),
    ...(page.layout === "home" ? ["home"] : []),
    ...(page.toc ? [] : ["no-toc"]),
  ].join(" ")
  const sidebar = page.navigation
    ? `<nav class="sidebar" aria-label="${escapeHtml(ui.documents)}"><p class="nav-title">${escapeHtml(ui.documents)}</p>${navList(page.navigation)}</nav>`
    : ""
  const toc = page.toc
    ? `<nav class="toc" aria-label="${escapeHtml(ui.onThisPage)}"><p class="nav-title">${escapeHtml(ui.onThisPage)}</p>${tocList(page.toc)}</nav>`
    : ""
  return `<!doctype html><html lang="${escapeHtml(page.lang)}"${page.htmlAttributes ?? ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)}</title>${page.head}</head><body>${page.skip ? `<a class="skip" href="#main-content">${escapeHtml(ui.skip)}</a>` : ""}<header>${title}${headerEnd}</header><div class="${classes}">${sidebar}<main id="main-content"${page.mainAttributes}>${page.body}<footer>${escapeHtml(page.footer)}</footer></main>${toc}</div></body></html>`
}

/** The page a language opens on when no document is its home. */
export function renderLanding(page: {
  lang: string
  title: string
  head: string
  ui: UiStrings
  headerLinks: ShellLink[]
  languages: ShellLanguage[]
  navigation: ShellNavItem[]
  htmlAttributes?: string
}): string {
  return renderShell({
    ...page,
    skip: false,
    siteTitle: page.title,
    layout: "home",
    mainAttributes: ' class="landing"',
    body: `<h1>${escapeHtml(page.title)}</h1><nav aria-label="${escapeHtml(page.ui.documents)}">${navList(page.navigation)}</nav>`,
    footer: page.title,
    navigation: undefined,
  })
}
