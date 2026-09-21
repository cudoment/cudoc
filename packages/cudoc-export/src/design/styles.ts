import {
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
/* The theme switch, added by cudoc-theme.js when themeSwitch is on. */
.theme-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  height: 1.875rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  color: var(--muted);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.theme-switch:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.theme-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.theme-switch svg {
  width: 1rem;
  height: 1rem;
  flex: none;
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
.sidebar,
.toc {
  position: sticky;
  top: calc(var(--head-h) + var(--space-4));
  max-height: calc(100vh - var(--head-h) - var(--space-8));
  overflow-y: auto;
  overscroll-behavior: contain;
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
.landing {
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
  white-space: nowrap;
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
${codeThemeRules(tokens)}

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
.cudoc-callout-warning,
.cudoc-callout-caution {
  background: var(--warn-wash);
  border-left-color: var(--warn);
}
.cudoc-callout-danger,
.cudoc-callout-error {
  background: var(--danger-wash);
  border-left-color: var(--danger);
}
footer {
  margin-top: var(--space-12);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  color: var(--faint);
  font-size: var(--text-sm);
}

/* ---------- responsive ---------- */
@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: var(--space-6);
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
  .sidebar {
    position: static;
    max-height: none;
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--line);
  }
  .sidebar ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  nav a {
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
${sitePrintBlock(tokens)}
`
/** The stylesheet as the defaults produce it. Compared byte for byte by the tests. */
export const siteStyles = buildStyles()
