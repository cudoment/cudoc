/**
 * The theme switch: a menu in the site header that chooses light or dark,
 * remembered per browser. Until the reader chooses, the page follows the
 * system setting and the menu shows which of the two that is. The
 * stylesheet does the work through `data-theme` on `<html>`; this script only
 * sets that attribute, and it runs from `<head>` so a remembered choice is in
 * place before the first paint rather than flashing the other theme.
 */

const KEY = "cudoc-theme"

type Choice = "light" | "dark"

const root = document.documentElement

function stored(): Choice | undefined {
  try {
    const value = localStorage.getItem(KEY)
    return value === "light" || value === "dark" ? value : undefined
  } catch {
    return undefined
  }
}

function remember(choice: Choice | undefined): void {
  try {
    if (choice) localStorage.setItem(KEY, choice)
    else localStorage.removeItem(KEY)
  } catch {
    // Not remembered; the choice still holds for this page.
  }
}

function apply(choice: Choice | undefined): void {
  if (choice) root.setAttribute("data-theme", choice)
  else root.removeAttribute("data-theme")
}

apply(stored())

type Strings = Record<"theme" | Choice, string>

/**
 * The control's words: the page's own, written by the builder in the
 * language the page is in, or the built-in Korean or English ones.
 */
const STRINGS: Strings = (() => {
  const fallback: Strings = root.lang.toLowerCase().startsWith("ko")
    ? { theme: "테마", light: "라이트", dark: "다크" }
    : { theme: "Theme", light: "Light", dark: "Dark" }
  try {
    const given = JSON.parse(root.dataset.cudocUi ?? "{}") as Partial<Strings>
    const strings = { ...fallback }
    for (const key of Object.keys(fallback) as (keyof Strings)[])
      if (typeof given[key] === "string" && given[key])
        strings[key] = given[key]!
    return strings
  } catch {
    return fallback
  }
})()

/** Sun and moon, as stroke paths on a 24-unit grid. */
const ICONS: Record<Choice, string[]> = {
  light: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    "M12 2v2",
    "M12 20v2",
    "M4.9 4.9l1.4 1.4",
    "M17.7 17.7l1.4 1.4",
    "M2 12h2",
    "M20 12h2",
    "M4.9 19.1l1.4-1.4",
    "M17.7 6.3l1.4-1.4",
  ],
  dark: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
}

function icon(mode: Choice): SVGElement {
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  for (const d of ICONS[mode]) {
    const path = document.createElementNS(NS, "path")
    path.setAttribute("d", d)
    svg.append(path)
  }
  return svg
}

const CHOICES: Choice[] = ["light", "dark"]

const dark = window.matchMedia?.("(prefers-color-scheme: dark)")

/**
 * The theme in effect: the reader's choice, which `data-theme` holds even
 * when storage refuses to keep it, else the system's.
 */
const current = (): Choice => {
  const chosen = root.getAttribute("data-theme")
  if (chosen === "light" || chosen === "dark") return chosen
  return dark?.matches ? "dark" : "light"
}

/**
 * A `<details>` menu drawn like the language menu beside it: the browser
 * opens and closes it from the keyboard and announces it as expanded or
 * collapsed, and the stylesheet closes it on a click elsewhere. A choice is a
 * button marked `aria-pressed`.
 */
function mount(): void {
  const header = document.querySelector<HTMLElement>("body > header")
  if (!header || header.querySelector(".theme-switch")) return
  const menu = document.createElement("details")
  menu.className = "menu theme-switch"
  const summary = document.createElement("summary")
  const label = document.createElement("span")
  label.className = "menu-label"
  summary.append(label)
  const list = document.createElement("ul")
  list.className = "menu-list"
  const buttons = CHOICES.map((mode) => {
    const button = document.createElement("button")
    button.type = "button"
    button.value = mode
    button.append(icon(mode), STRINGS[mode])
    button.addEventListener("click", () => {
      remember(mode)
      apply(mode)
      render()
      menu.open = false
      summary.focus()
    })
    const item = document.createElement("li")
    item.append(button)
    list.append(item)
    return button
  })
  const render = () => {
    const mode = current()
    // Only the icon and the words change, so focus stays where it is.
    summary.querySelector("svg")?.remove()
    summary.prepend(icon(mode))
    label.textContent = STRINGS[mode]
    summary.setAttribute("aria-label", `${STRINGS.theme}: ${STRINGS[mode]}`)
    for (const button of buttons)
      button.setAttribute("aria-pressed", String(button.value === mode))
  }
  // Before any choice the menu shows the system's theme as it changes.
  dark?.addEventListener?.("change", render)
  // A choice made in another tab of the same site applies here too.
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      apply(stored())
      render()
    }
  })
  // Escape, or focus moving elsewhere, closes the open menu of the header,
  // the language menu's included.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return
    const open = header.querySelector<HTMLDetailsElement>("details.menu[open]")
    if (!open) return
    open.open = false
    open.querySelector("summary")?.focus()
  })
  header.addEventListener("focusout", (event) => {
    const left = (event.target as Element).closest?.("details.menu")
    const next = event.relatedTarget as Node | null
    // Without a next element the press was on something that takes no
    // focus: the stylesheet's layer answers a press outside the menu, and a
    // press inside it, as Safari gives a button, must leave it open.
    if (left instanceof HTMLDetailsElement && next && !left.contains(next))
      left.open = false
  })
  menu.append(summary, list)
  render()
  ;(header.querySelector(".header-end") ?? header).append(menu)
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mount)
else mount()

export {}
