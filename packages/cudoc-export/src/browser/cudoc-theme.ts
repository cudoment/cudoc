/**
 * The theme switch: a select in the site header that chooses light or dark,
 * remembered per browser. Until the reader chooses, the page follows the
 * system setting and the select shows which of the two that is. The
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

/** The theme in effect: the reader's choice, else the system's. */
const current = (): Choice => stored() ?? (dark?.matches ? "dark" : "light")

/**
 * A native select: the browser gives it keyboard use, a screen reader's
 * announcement, the phone's own picker and closing when the reader looks
 * elsewhere, none of which a hand-made menu would get right everywhere.
 */
function mount(): void {
  const header = document.querySelector("body > header")
  if (!header || header.querySelector(".theme-switch")) return
  const control = document.createElement("label")
  control.className = "theme-switch"
  const select = document.createElement("select")
  select.setAttribute("aria-label", STRINGS.theme)
  for (const mode of CHOICES) {
    const option = document.createElement("option")
    option.value = mode
    option.textContent = STRINGS[mode]
    select.append(option)
  }
  const render = () => {
    const mode = current()
    select.value = mode
    // Only the icon is replaced, so the select keeps focus while it is used.
    control.querySelector("svg")?.remove()
    control.prepend(icon(mode))
    control.title = `${STRINGS.theme}: ${STRINGS[mode]}`
  }
  select.addEventListener("change", () => {
    const choice = select.value as Choice
    remember(choice)
    apply(choice)
    render()
  })
  // Before any choice the select shows the system's theme as it changes.
  dark?.addEventListener?.("change", () => {
    if (!stored()) render()
  })
  // A choice made in another tab of the same site applies here too.
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      apply(stored())
      render()
    }
  })
  control.append(select)
  render()
  ;(header.querySelector(".header-end") ?? header).append(control)
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mount)
else mount()

export {}
