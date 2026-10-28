import {
  calloutSeverityRules,
  codeThemeRules,
  darkVariables,
  reducedMotionVariables,
  rootVariables,
  sitePrintBlock,
} from "./css.js"
import { designTokens, type DesignTokens } from "./tokens.js"

/** Escapes text for HTML interpolation. Shared by every markup builder here. */
export const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  )

/**
 * The built-in stylesheet for an exported site.
 *
 * Palette: the Knowledge Base/Documentation ramp for light and the Developer
 * Tool/IDE ramp for dark, with three values darkened so that every foreground
 * and surface pair clears WCAG AA (4.5:1 for text, 3:1 for the focus ring).
 * Every colour is a custom property that both themes define, so a site
 * restyles the export by redefining properties rather than rewriting rules.
 */
export const buildStyles = (tokens: DesignTokens = designTokens): string => `
${rootVariables(tokens)}
${darkVariables(tokens)}
${reducedMotionVariables(tokens)}

*,
*::before,
*::after {
  box-sizing: border-box;
}
html {
  font-family: var(--font-sans);
  font-size: 100%;
  line-height: var(--leading-body);
  color: var(--ink);
  background: var(--canvas);
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
body {
  margin: 0;
  font-size: var(--text-base);
  background: var(--canvas);
}
a {
  color: var(--accent);
  text-decoration: none;
  text-underline-offset: 0.2em;
  overflow-wrap: anywhere;
  transition: color var(--ease);
}
a:hover {
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
}
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
.skip {
  position: absolute;
  left: var(--space-4);
  top: -6rem;
  z-index: 6;
  padding: var(--space-3) var(--space-4);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font-weight: 600;
}
.skip:focus {
  top: var(--space-2);
}

/* ---------- shell ---------- */
header {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  height: var(--head-h);
  padding: 0 var(--space-6);
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
  font-size: var(--text-lg);
  font-weight: 650;
  letter-spacing: -0.015em;
}
header a {
  color: inherit;
}
header a:hover {
  color: var(--accent);
  text-decoration: none;
}
header > a,
header > span {
  flex: none;
}
/*
 * The button that opens the sidebar as a panel, the backdrop and the line
 * that close it: drawn on a narrow screen only.
 */
.cudoc-nav-button,
.cudoc-nav-backdrop,
.cudoc-nav-close {
  display: none;
}
/* Header links, the language menu and the theme menu, at the right. */
.header-end {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-left: auto;
  font-size: var(--text-sm);
  font-weight: 500;
  letter-spacing: 0;
}
.header-links {
  display: flex;
  gap: var(--space-4);
}
/* Header navigation draws as plain links, not as the sidebar's rows. */
.header-end nav a {
  border: 0;
  border-radius: var(--radius);
}
.header-links a {
  padding: var(--space-1) 0;
  color: var(--muted);
}
.header-links a:hover {
  background: none;
  color: var(--accent);
}
/*
 * The language and theme menus: a <details> whose summary shows the current
 * choice and opens a list under it. The language menu is written into the
 * page; cudoc-theme.js adds the theme menu when themeSwitch is on.
 */
.menu {
  position: relative;
  max-inline-size: none;
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
  font-size: var(--text-sm);
  font-weight: 500;
  letter-spacing: 0;
}
header > .menu {
  margin-left: auto;
}
.menu > summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 1.875rem;
  padding: 0 var(--space-3) 0 var(--space-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
  list-style: none;
  cursor: pointer;
  user-select: none;
  transition:
    border-color var(--ease),
    color var(--ease);
}
.menu > summary::-webkit-details-marker {
  display: none;
}
.menu > summary:hover,
.menu[open] > summary {
  margin: 0;
  border-color: var(--accent);
  color: var(--accent);
}
.menu svg {
  flex: none;
  width: 1rem;
  height: 1rem;
}
/* The chevron, pointing down while the menu is closed and up while open. */
.menu > summary::after {
  content: "";
  flex: none;
  width: 0.375rem;
  height: 0.375rem;
  margin: 0 0 0.1875rem var(--space-1);
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform var(--ease);
}
.menu[open] > summary::after {
  transform: translateY(0.1875rem) rotate(225deg);
}
/*
 * While a menu is open, a clear layer over the page takes a click anywhere
 * else and closes it, without a script. The list sits above the layer, and
 * the header rises above the review runtime's controls (z-index 39 to 43) so
 * the layer covers them too.
 */
.menu[open] > summary::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 1;
  cursor: default;
}
header:has(.menu[open]) {
  z-index: 44;
}
.menu-list {
  position: absolute;
  top: calc(100% + var(--space-1));
  right: 0;
  z-index: 2;
  min-width: max(100%, 9rem);
  margin: 0;
  padding: var(--space-1);
  list-style: none;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.menu-list li {
  margin: 0;
}
.menu-list a,
.menu-list span,
.menu-list button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--ink);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.menu-list a:hover,
.menu-list button:hover {
  background: var(--wash);
  color: var(--ink);
  text-decoration: none;
}
.menu-list [aria-current],
.menu-list [aria-pressed="true"],
.menu-list [aria-pressed="true"]:hover {
  color: var(--accent);
  font-weight: 600;
}
/* The page's own language, and every entry once links are removed. */
.menu-list span {
  cursor: default;
}
/* A check after the current choice. */
.menu-list [aria-current]::after,
.menu-list [aria-pressed="true"]::after {
  content: "";
  flex: none;
  width: 0.5rem;
  height: 0.25rem;
  margin: 0 0 0.125rem auto;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
}
.layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 58rem) 13rem;
  align-items: start;
  gap: var(--space-8);
  max-width: 90rem;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) 40vh;
}
/*
 * The navigation and the contents stay beside the text and scroll inside
 * themselves. Neither contains its overscroll: a wheel or a swipe that starts
 * on one with nothing left to scroll, a short one or one at its end, goes on
 * to the page instead of moving nothing.
 */
.sidebar,
.toc {
  position: sticky;
  top: calc(var(--head-h) + var(--space-4));
  max-height: calc(100vh - var(--head-h) - var(--space-8));
  overflow-y: auto;
  font-size: var(--text-sm);
}
nav ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
nav li {
  margin: 1px 0;
}
nav a {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-left: 2px solid transparent;
  border-radius: 0 var(--radius) var(--radius) 0;
  color: var(--muted);
  transition:
    background var(--ease),
    color var(--ease);
}
nav a:hover {
  background: var(--wash);
  color: var(--ink);
  text-decoration: none;
}
nav a[aria-current="page"] {
  background: var(--accent-soft);
  border-left-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.nav-title {
  margin: 0 0 var(--space-2);
  padding: 0 var(--space-3);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--faint);
}
.toc a {
  padding: var(--space-1) var(--space-3);
  border-left: 2px solid var(--line-soft);
  border-radius: 0;
}
.toc li[data-depth="3"] a {
  padding-left: var(--space-6);
}
/* A group of the navigation folds without a script. */
.nav-group summary {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding-left: var(--space-2);
  color: var(--muted);
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}
.nav-group summary::-webkit-details-marker {
  display: none;
}
.nav-group summary::before {
  content: "";
  flex: none;
  width: 0.4rem;
  height: 0.4rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  transition: transform var(--ease);
}
.nav-group details[open] > summary::before {
  transform: rotate(45deg);
}
.nav-group summary > a,
.nav-group summary > span {
  flex: 1;
  min-width: 0;
}
.nav-group summary > span,
.nav-group summary > a {
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-1);
}
.nav-group ul {
  margin-left: var(--space-3);
  border-left: 1px solid var(--line-soft);
}
.layout.no-toc {
  grid-template-columns: 15rem minmax(0, 58rem);
}
.layout.single {
  grid-template-columns: minmax(0, 58rem) 13rem;
  justify-content: center;
}
.layout.single.no-toc {
  grid-template-columns: minmax(0, 58rem);
}
/* A generated landing page: its list of documents is the body. */
.layout.no-nav {
  grid-template-columns: minmax(0, 1fr);
}
.landing {
  width: 100%;
  max-width: 44rem;
  margin: 0 auto;
  padding: var(--space-12) var(--space-6) 30vh;
}

/* ---------- prose ---------- */
main {
  min-width: 0;
}
main > p,
main > ul,
main > ol,
main > dl,
main > blockquote {
  max-inline-size: var(--measure);
}
.cudoc-callout,
details {
  max-inline-size: calc(var(--measure) + 6ch);
}
h1,
h2,
h3,
h4,
h5,
h6 {
  line-height: var(--leading-tight);
  font-weight: 650;
  text-wrap: balance;
  scroll-margin-top: calc(var(--head-h) + var(--space-2));
}
h1 {
  margin: 0 0 var(--space-4);
  font-size: var(--text-3xl);
  font-weight: 700;
  letter-spacing: -0.024em;
}
h2 {
  margin: var(--space-12) 0 var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  font-size: var(--text-2xl);
  letter-spacing: -0.018em;
}
h3 {
  margin: var(--space-8) 0 var(--space-2);
  font-size: var(--text-xl);
  letter-spacing: -0.012em;
}
h4,
h5,
h6 {
  margin: var(--space-6) 0 var(--space-2);
  font-size: var(--text-base);
  color: var(--muted);
}
.header-anchor {
  margin-left: 0.35em;
  color: var(--faint);
  font-weight: 400;
  opacity: 0;
  transition: opacity var(--ease);
}
h1:hover > .header-anchor,
h2:hover > .header-anchor,
h3:hover > .header-anchor,
h4:hover > .header-anchor,
.header-anchor:focus-visible {
  opacity: 1;
}
p {
  margin: 0 0 var(--space-4);
  text-wrap: pretty;
}
ul,
ol {
  margin: 0 0 var(--space-4);
  padding-left: 1.4em;
}
li {
  margin: var(--space-1) 0;
}
li > ul,
li > ol {
  margin: var(--space-1) 0 0;
}
li::marker {
  color: var(--faint);
}
hr {
  height: 0;
  margin: var(--space-8) 0;
  border: 0;
  border-top: 1px solid var(--line);
}
/* A rule already separates what follows it; the heading after one draws no second. */
hr + h2 {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
}
strong {
  font-weight: 650;
}
abbr {
  text-underline-offset: 0.25em;
}

/* ---------- code ---------- */
code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  font-variant-ligatures: none;
}
:not(pre) > code {
  padding: 0.1em 0.32em;
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-radius: 0.25em;
  /* A signature or an address longer than the column wraps inside it rather
     than running under the contents beside it or widening a phone's page;
     each line keeps the padding and the border. A table column stays as wide
     as its longest word, so a narrow table scrolls rather than splitting one. */
  overflow-wrap: break-word;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
pre {
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  overflow-x: auto;
  line-height: 1.6;
  tab-size: 2;
}
pre code {
  white-space: pre;
}
pre .line.highlighted {
  display: inline-block;
  min-width: 100%;
  margin: 0 calc(-1 * var(--space-4));
  padding: 0 var(--space-4);
  background: var(--accent-soft);
}
.cudoc-code {
  margin: 0 0 var(--space-4);
}
.cudoc-code > pre {
  margin: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
.cudoc-code-title {
  padding: var(--space-1) var(--space-4);
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-bottom: 0;
  border-radius: var(--radius) var(--radius) 0 0;
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
${codeThemeRules(tokens)}

/* ---------- tabs ---------- */
.cudoc-tabs {
  display: flex;
  flex-wrap: wrap;
  margin: 0 0 var(--space-4);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
}
.cudoc-tab-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.cudoc-tab-label {
  padding: var(--space-2) var(--space-4);
  border-bottom: 2px solid transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  cursor: pointer;
}
.cudoc-tab {
  order: 1;
  flex-basis: 100%;
  min-width: 0;
  padding: var(--space-4) var(--space-4) 0;
  border-top: 1px solid var(--line-soft);
}
.cudoc-tab-input:focus-visible + .cudoc-tab-label {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
@supports selector(:has(*)) {
  .cudoc-tab-label + .cudoc-tab {
    display: none;
  }
  .cudoc-tab-input:checked + .cudoc-tab-label + .cudoc-tab,
  .cudoc-tabs:not(:has(> .cudoc-tab-input:checked)) > .cudoc-tab-default + .cudoc-tab-label + .cudoc-tab {
    display: block;
  }
  .cudoc-tab-input:checked + .cudoc-tab-label,
  .cudoc-tabs:not(:has(> .cudoc-tab-input:checked)) > .cudoc-tab-default + .cudoc-tab-label {
    border-bottom-color: var(--accent);
    color: var(--ink);
    font-weight: 600;
  }
}

/* ---------- tables ---------- */
table {
  display: block;
  max-width: 100%;
  margin: 0 0 var(--space-4);
  border-collapse: collapse;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}
thead th {
  padding: var(--space-2) var(--space-3);
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--faint);
  white-space: nowrap;
}
tbody tr {
  border-bottom: 1px solid var(--line-soft);
  transition: background var(--ease);
}
tbody tr:nth-child(even) {
  background: var(--row-alt);
}
tbody tr:hover {
  background: var(--accent-soft);
}
tbody tr:last-child {
  border-bottom: 0;
}
td {
  padding: var(--space-2) var(--space-3);
  vertical-align: top;
}
td p,
td ul,
td ol {
  margin: var(--space-1) 0;
}
td ul,
td ol {
  padding-left: 1.2em;
}
td > :first-child {
  margin-top: 0;
}
td > :last-child {
  margin-bottom: 0;
}

/* ---------- blocks ---------- */
blockquote {
  margin: var(--space-6) 0;
  padding: 0 var(--space-4);
  border-left: 2px solid var(--line);
  color: var(--muted);
}
blockquote > :last-child {
  margin-bottom: 0;
}
details {
  margin: var(--space-4) 0;
  padding: var(--space-2) var(--space-4);
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
}
details summary {
  padding: var(--space-1) 0;
  font-weight: 600;
  cursor: pointer;
}
details[open] summary {
  margin-bottom: var(--space-2);
}
/* A navigation group folds like an authored details, without its box. */
.nav-group details,
.nav-group details[open] summary {
  max-inline-size: none;
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
}
.nav-group summary {
  padding: 0 0 0 var(--space-2);
}
/* A tree embed is an outline: an item with children folds its list in a
   details whose summary is the item's line, the disclosure triangle where a
   leaf's bullet is, and none of the box an authored details gets. */
.cudoc-tree,
.cudoc-tree ul {
  margin: 0;
  padding-left: 1.5em;
}
.cudoc-tree {
  margin: var(--space-4) 0;
}
.cudoc-tree li:not(.cudoc-tree-leaf) {
  list-style: none;
}
.cudoc-tree details {
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
}
.cudoc-tree details summary,
.cudoc-tree details[open] summary {
  margin: 0 0 0 -1.1em;
  padding: 0;
  font-weight: inherit;
}
.cudoc-badge {
  display: inline-block;
  margin-left: 0.35em;
  padding: 0.1em 0.5em;
  background: var(--accent-soft);
  border-radius: 0.75em;
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0;
  white-space: nowrap;
  vertical-align: 0.08em;
}
.cudoc-callout {
  margin: var(--space-6) 0;
  padding: var(--space-3) var(--space-4);
  background: var(--wash);
  border: 1px solid var(--line-soft);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
}
.cudoc-callout > :first-child {
  margin-top: 0;
}
.cudoc-callout > :last-child {
  margin-bottom: 0;
}
.cudoc-callout-title {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--ink);
  font-weight: 700;
}
.cudoc-table-note {
  margin: calc(-1 * var(--space-2)) 0 var(--space-6);
  color: var(--faint);
  font-size: var(--text-sm);
}
.cudoc-table-note > p {
  margin: var(--space-1) 0;
}
${calloutSeverityRules()}
footer {
  margin-top: var(--space-12);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  color: var(--faint);
  font-size: var(--text-sm);
}

/* ---------- responsive ---------- */
@media (max-width: 1024px) {
  .layout,
  .layout.no-toc {
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: var(--space-6);
  }
  .layout.single,
  .layout.single.no-toc,
  .layout.no-nav {
    grid-template-columns: minmax(0, 1fr);
  }
  .toc {
    display: none;
  }
}
@media (max-width: 768px) {
  header {
    padding: 0 var(--space-4);
  }
  .layout {
    display: block;
    padding: var(--space-4) var(--space-4) 20vh;
  }
  .landing {
    padding: var(--space-6) var(--space-4) 20vh;
  }
  /*
   * The sidebar opens as a panel over the page from a floating button. The
   * button, the backdrop and the panel's close line are labels for one
   * checkbox, so the panel opens and closes without a script. The checkbox
   * is written hidden; here it is shown to the keyboard alone, under the
   * button, so a reader can tab to it and press Space while the labels are
   * what is seen, and focusing it scrolls nothing.
   */
  .cudoc-nav-toggle {
    display: block;
    position: fixed;
    right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
    pointer-events: none;
  }
  /* Below the review runtime's controls and an open menu's layer. */
  .cudoc-nav-button {
    position: fixed;
    right: calc(var(--space-4) + env(safe-area-inset-right, 0px));
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 3rem;
    padding: 0 var(--space-6) 0 var(--space-4);
    /* Drawn in forced colours, where the fill is dropped. */
    border: 1px solid transparent;
    border-radius: 1.5rem;
    background: var(--accent);
    color: var(--paper);
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.2);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .cudoc-nav-button svg,
  .cudoc-nav-close svg {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
  }
  .cudoc-nav-toggle:focus-visible ~ .cudoc-nav-button {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
  .cudoc-nav-toggle:checked ~ .cudoc-nav-button {
    display: none;
  }
  /*
   * Open, the panel lies over everything, the review runtime and an open
   * menu included, and scrolls inside itself; its overscroll stays in it.
   * Where :has() is supported, a wheel or a swipe does not scroll the page
   * behind, which keeps its scrollbar's room so it does not reflow. Nothing
   * in the panel scrolls sideways: a long word wraps.
   */
  .sidebar {
    display: none;
  }
  .cudoc-nav-toggle:checked ~ .layout > .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 46;
    display: block;
    width: min(86vw, 22rem);
    max-height: none;
    padding: 0 var(--space-4) calc(var(--space-6) + env(safe-area-inset-bottom, 0px))
      calc(var(--space-4) + env(safe-area-inset-left, 0px));
    overflow-y: auto;
    overscroll-behavior: contain;
    overflow-wrap: anywhere;
    background: var(--paper);
    border-right: 1px solid var(--line);
    box-shadow: 4px 0 24px rgb(0 0 0 / 0.2);
    animation: var(--ease) cudoc-nav-in;
  }
  .cudoc-nav-toggle:checked ~ .cudoc-nav-backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: block;
    background: rgb(0 0 0 / 0.4);
    cursor: pointer;
    animation: var(--ease) cudoc-nav-fade;
  }
  html:has(.cudoc-nav-toggle:checked) {
    overflow: hidden;
    scrollbar-gutter: stable;
  }
  /* The close line stays at the top of the panel as its list scrolls. */
  .cudoc-nav-toggle:checked ~ .layout > .sidebar .cudoc-nav-close {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    min-height: 3rem;
    margin: 0 calc(-1 * var(--space-4)) var(--space-2);
    padding: env(safe-area-inset-top, 0px) var(--space-4) 0;
    background: var(--paper);
    border-bottom: 1px solid var(--line-soft);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .cudoc-nav-toggle:checked:focus-visible ~ .layout > .sidebar .cudoc-nav-close {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* A short slide and fade, which --ease shortens to 1ms for reduced motion. */
  @keyframes cudoc-nav-in {
    from {
      transform: translateX(-100%);
    }
  }
  @keyframes cudoc-nav-fade {
    from {
      opacity: 0;
    }
  }
  .header-links {
    display: none;
  }
  nav a,
  .menu-list a,
  .menu-list span,
  .menu-list button {
    min-height: 2.75rem;
    display: flex;
    align-items: center;
  }
  h1 {
    font-size: var(--text-2xl);
  }
  h2 {
    margin-top: var(--space-8);
    font-size: var(--text-xl);
  }
  h3 {
    font-size: var(--text-lg);
  }
}

/* ---------- touch ---------- */
@media (pointer: coarse) {
  /* A finger's target: the line that folds a group, a details or a tree
     branch is at least 2.75rem tall, and a checkbox in a list, wrapped in a
     paragraph or not, takes 2.75rem of its line. */
  details summary {
    min-height: 2.75rem;
    padding-top: var(--space-2);
    padding-bottom: var(--space-2);
  }
  li > input[type="checkbox"],
  li > p > input[type="checkbox"] {
    width: 1.5rem;
    height: 1.5rem;
    margin: 0.625rem var(--space-2) 0.625rem 0;
    vertical-align: middle;
  }
}
${sitePrintBlock(tokens)}
`
/** The stylesheet as the defaults produce it. Compared byte for byte by the tests. */
export const siteStyles = buildStyles()
