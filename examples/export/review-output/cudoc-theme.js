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
    const fallback = root.lang.toLowerCase().startsWith("ko") ? { theme: "\uD14C\uB9C8", system: "\uC2DC\uC2A4\uD15C", light: "\uB77C\uC774\uD2B8", dark: "\uB2E4\uD06C" } : { theme: "Theme", system: "System", light: "Light", dark: "Dark" };
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
  var MODES = ["system", "light", "dark"];
  function mount() {
    const header = document.querySelector("body > header");
    if (!header || header.querySelector(".theme-switch")) return;
    const control = document.createElement("label");
    control.className = "theme-switch";
    const select = document.createElement("select");
    select.setAttribute("aria-label", STRINGS.theme);
    for (const mode of MODES) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = STRINGS[mode];
      select.append(option);
    }
    const render = () => {
      const mode = stored() ?? "system";
      select.value = mode;
      control.querySelector("svg")?.remove();
      control.prepend(icon(mode));
      control.title = `${STRINGS.theme}: ${STRINGS[mode]}`;
    };
    select.addEventListener("change", () => {
      const choice = select.value === "system" ? void 0 : select.value;
      remember(choice);
      apply(choice);
      render();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === KEY || event.key === null) {
        apply(stored());
        render();
      }
    });
    control.append(select);
    render();
    (header.querySelector(".header-end") ?? header).append(control);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
