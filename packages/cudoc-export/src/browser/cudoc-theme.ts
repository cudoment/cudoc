/**
 * The theme switch: a button in the site header that cycles the colour
 * scheme through system, light and dark, remembered per browser. The
 * stylesheet does the work through `data-theme` on `<html>`; this script only
 * sets that attribute, and it runs from `<head>` so a remembered choice is in
 * place before the first paint rather than flashing the other theme.
 */

const KEY = "cudoc-theme"

type Choice = "light" | "dark"
type Mode = Choice | "system"

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

const STRINGS = root.lang.toLowerCase().startsWith("ko")
  ? { theme: "테마", system: "시스템", light: "라이트", dark: "다크" }
  : { theme: "Theme", system: "System", light: "Light", dark: "Dark" }

/** Monitor, sun and moon, as stroke paths on a 24-unit grid. */
const ICONS: Record<Mode, string[]> = {
  system: ["M3 5h18v12H3z", "M8 21h8", "M12 17v4"],
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

function icon(mode: Mode): SVGElement {
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

/** system → light → dark → system. */
const NEXT: Record<Mode, Choice | undefined> = {
  system: "light",
  light: "dark",
  dark: undefined,
}

function mount(): void {
  const header = document.querySelector("body > header")
  if (!header || header.querySelector(".theme-switch")) return
  const button = document.createElement("button")
  button.type = "button"
  button.className = "theme-switch"
  const label = document.createElement("span")
  const render = () => {
    const mode: Mode = stored() ?? "system"
    label.textContent = STRINGS[mode]
    button.replaceChildren(icon(mode), label)
    const text = `${STRINGS.theme}: ${STRINGS[mode]}`
    button.title = text
    button.setAttribute("aria-label", text)
  }
  button.addEventListener("click", () => {
    const next = NEXT[stored() ?? "system"]
    remember(next)
    apply(next)
    render()
  })
  // A choice made in another tab of the same site applies here too.
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) {
      apply(stored())
      render()
    }
  })
  render()
  header.append(button)
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", mount)
else mount()

export {}
