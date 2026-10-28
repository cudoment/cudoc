/**
 * The page around a document: the header, the navigation on the left (LNB),
 * the contents of the page on the right (RNB) and the footer.
 *
 * Three layouts share it. A site page has all of them, the home document
 * included; a generated landing page lists the navigation in its body instead
 * of beside it, and has no contents; a single page, standalone or for review,
 * has no navigation, since the other documents are not beside it. A page with
 * no heading to list has no contents column. On a narrow screen the sidebar
 * opens as a panel from a floating button: the button, a backdrop and the
 * panel's close line are labels for one checkbox, which the stylesheet reads,
 * so no script is needed.
 * Every link here is written as a source path or an output path and goes
 * through the link policy with the rest of the page, so `none` removes it
 * and `host` points it at the deployment.
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
        `<li data-depth="${entry.depth}"><a data-cudoc-final href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`,
    )
    .join("")}</ul>`

/** Three bars, drawn on the same grid: the button that opens the sidebar on a narrow screen. */
const BARS =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>'

/** A cross on the same grid: the line that closes the sidebar's panel. */
const CROSS =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>'

/** A globe, drawn like the theme menu's sun and moon on a 24-unit grid. */
const GLOBE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'

/**
 * The language menu: a `<details>` whose summary names the page's language
 * and opens the list of the others. It needs no script; the stylesheet draws
 * it as the theme menu is drawn and closes it on a click elsewhere.
 */
const languageMenu = (languages: ShellLanguage[], ui: UiStrings): string => {
  const current =
    languages.find((language) => language.current) ?? languages[0]!
  const name = escapeHtml(`${ui.language}: ${current.label}`)
  return `<nav class="languages" aria-label="${escapeHtml(ui.language)}"><details class="menu"><summary aria-label="${name}">${GLOBE}<span class="menu-label">${escapeHtml(current.label)}</span></summary><ul class="menu-list">${languages
    .map((language) =>
      language.current
        ? `<li><span aria-current="true" lang="${escapeHtml(language.lang)}">${escapeHtml(language.label)}</span></li>`
        : `<li><a data-cudoc-final href="${escapeHtml(language.href)}" hreflang="${escapeHtml(language.lang)}" lang="${escapeHtml(language.lang)}">${escapeHtml(language.label)}</a></li>`,
    )
    .join("")}</ul></details></nav>`
}

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
        }${page.languages.length ? languageMenu(page.languages, ui) : ""}</div>`
      : ""
  const title = page.homeHref
    ? `<a data-cudoc-final href="${escapeHtml(page.homeHref)}">${escapeHtml(page.siteTitle)}</a>`
    : `<span>${escapeHtml(page.siteTitle)}</span>`
  const classes = [
    "layout",
    ...(page.layout === "single" ? ["single"] : []),
    ...(page.layout === "home" ? ["home"] : []),
    ...(page.toc ? [] : ["no-toc"]),
    ...(page.navigation || page.layout === "single" ? [] : ["no-nav"]),
  ].join(" ")
  // On a narrow screen the sidebar opens as a panel. The checkbox stands
  // after the header and before the layout, so `:checked ~` reaches the
  // sidebar, the floating button and the backdrop after it, and the keyboard
  // goes on from it into the panel. It carries its own name, the button's
  // word: its labels together would read "Close Documents", so the close
  // line's word is left out of it. `autocomplete="off"` keeps a browser from
  // restoring it checked, the page locked, when the reader comes back. All of
  // it is hidden on a wide screen, where the sidebar is beside the page.
  const navToggle = page.navigation
    ? {
        input: `<input type="checkbox" id="cudoc-nav-toggle" class="cudoc-nav-toggle" aria-label="${escapeHtml(ui.documents)}" autocomplete="off" hidden>`,
        close: `<label for="cudoc-nav-toggle" class="cudoc-nav-close">${CROSS}<span>${escapeHtml(ui.close)}</span></label>`,
        after: `<label for="cudoc-nav-toggle" class="cudoc-nav-button">${BARS}<span>${escapeHtml(ui.documents)}</span></label><label for="cudoc-nav-toggle" class="cudoc-nav-backdrop" aria-hidden="true"></label>`,
      }
    : { input: "", close: "", after: "" }
  const sidebar = page.navigation
    ? `<nav class="sidebar" aria-label="${escapeHtml(ui.documents)}">${navToggle.close}<p class="nav-title">${escapeHtml(ui.documents)}</p>${navList(page.navigation)}</nav>`
    : ""
  const toc = page.toc
    ? `<nav class="toc" aria-label="${escapeHtml(ui.onThisPage)}"><p class="nav-title">${escapeHtml(ui.onThisPage)}</p>${tocList(page.toc)}</nav>`
    : ""
  return `<!doctype html><html lang="${escapeHtml(page.lang)}"${page.htmlAttributes ?? ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)}</title>${page.head}</head><body>${page.skip ? `<a class="skip" href="#main-content">${escapeHtml(ui.skip)}</a>` : ""}<header>${title}${headerEnd}</header>${navToggle.input}<div class="${classes}">${sidebar}<main id="main-content"${page.mainAttributes}>${page.body}<footer>${escapeHtml(page.footer)}</footer></main>${toc}</div>${navToggle.after}</body></html>`
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
