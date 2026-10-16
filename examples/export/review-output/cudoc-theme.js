"use strict";
(() => {
  // src/browser/cudoc-theme.ts
  var KEY = "cudoc-theme";
  var root = document.documentElement;
  function stored() {
    try {
      const value = localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : void 0;
    } catch {
      return void 0;
    }
  }
  function remember(choice) {
    try {
      if (choice) localStorage.setItem(KEY, choice);
      else localStorage.removeItem(KEY);
    } catch {
    }
  }
  function apply(choice) {
    if (choice) root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
  }
  apply(stored());
  var STRINGS = (() => {
    const fallback = root.lang.toLowerCase().startsWith("ko") ? { theme: "\uD14C\uB9C8", light: "\uB77C\uC774\uD2B8", dark: "\uB2E4\uD06C" } : { theme: "Theme", light: "Light", dark: "Dark" };
    try {
      const given = JSON.parse(root.dataset.cudocUi ?? "{}");
      const strings = { ...fallback };
      for (const key of Object.keys(fallback))
        if (typeof given[key] === "string" && given[key])
          strings[key] = given[key];
      return strings;
    } catch {
      return fallback;
    }
  })();
  var ICONS = {
    light: [
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
      "M12 2v2",
      "M12 20v2",
      "M4.9 4.9l1.4 1.4",
      "M17.7 17.7l1.4 1.4",
      "M2 12h2",
      "M20 12h2",
      "M4.9 19.1l1.4-1.4",
      "M17.7 6.3l1.4-1.4"
    ],
    dark: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"]
  };
  function icon(mode) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of ICONS[mode]) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }
  var CHOICES = ["light", "dark"];
  var dark = window.matchMedia?.("(prefers-color-scheme: dark)");
  var current = () => {
    const chosen = root.getAttribute("data-theme");
    if (chosen === "light" || chosen === "dark") return chosen;
    return dark?.matches ? "dark" : "light";
  };
  function mount() {
    const header = document.querySelector("body > header");
    if (!header || header.querySelector(".theme-switch")) return;
    const menu = document.createElement("details");
    menu.className = "menu theme-switch";
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.className = "menu-label";
    summary.append(label);
    const list = document.createElement("ul");
    list.className = "menu-list";
    const buttons = CHOICES.map((mode) => {
      const button = document.createElement("button");
      button.type = "button";
      button.value = mode;
      button.append(icon(mode), STRINGS[mode]);
      button.addEventListener("click", () => {
        remember(mode);
        apply(mode);
        render();
        menu.open = false;
        summary.focus();
      });
      const item = document.createElement("li");
      item.append(button);
      list.append(item);
      return button;
    });
    const render = () => {
      const mode = current();
      summary.querySelector("svg")?.remove();
      summary.prepend(icon(mode));
      label.textContent = STRINGS[mode];
      summary.setAttribute("aria-label", `${STRINGS.theme}: ${STRINGS[mode]}`);
      for (const button of buttons)
        button.setAttribute("aria-pressed", String(button.value === mode));
    };
    dark?.addEventListener?.("change", render);
    window.addEventListener("storage", (event) => {
      if (event.key === KEY || event.key === null) {
        apply(stored());
        render();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const open = header.querySelector("details.menu[open]");
      if (!open) return;
      open.open = false;
      open.querySelector("summary")?.focus();
    });
    header.addEventListener("focusout", (event) => {
      const left = event.target.closest?.("details.menu");
      const next = event.relatedTarget;
      if (left instanceof HTMLDetailsElement && next && !left.contains(next))
        left.open = false;
    });
    menu.append(summary, list);
    render();
    (header.querySelector(".header-end") ?? header).append(menu);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
