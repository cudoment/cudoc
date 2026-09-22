// A complete export of a small documentation set: the site, a bound PDF and a
// Word file from one configuration. Build it from this directory with
//   npm run showcase
// which writes showcase-output/, the copy committed beside these sources.
export default {
  sourceRoot: "showcase",
  outDir: "showcase-output",
  libraryDir: ".cudoc/showcase-library",
  title: "Northlight Weather API",
  navigation: [
    "index",
    "getting-started",
    "reference/endpoints",
    "reference/limits",
    "reference/errors",
    "release-notes",
  ],
  // Authors write cudoc's own markers; no host syntax is in play here.
  syntax: {
    headingAnchor: "cudoc",
    badge: "cudoc",
    callout: "cudoc",
    tableCellList: "cudoc",
    link: "cudoc",
  },
  calloutTypes: ["success"],
  // A long list in a narrow cell is split across two columns.
  tableColumnLayout: [
    {
      section: { depth: 5, titles: ["Requirements"] },
      columnHeaders: ["Prerequisites"],
      split: { minItems: 4, columns: 2 },
    },
  ],
  // Parameter tables keep their description column readable in every format.
  tableColumnWidths: [{ widths: { Description: "18rem", Meaning: "16rem" } }],
  tokens: {
    colors: {
      light: { accent: "#155e75", accentSoft: "#e0f2fe" },
      dark: { accent: "#67e8f9", accentSoft: "#164e63" },
    },
  },
  // Readers of the site can leave notes and switch the theme.
  annotations: true,
  themeSwitch: true,
  formats: ["html", "pdf", "docx"],
  granularity: "both",
  links: "relative",
  page: {
    paper: "A4",
    header: { left: "{title}", right: "{date}" },
    footer: { center: "{page} / {pages}" },
    // A fixed date keeps the output identical from one build to the next.
    date: "2026-09-22",
    breakBefore: 2,
    linkUrls: true,
    wideTables: { minColumns: 6 },
  },
  volume: {
    fileName: "northlight-handbook",
    cover: { image: "showcase/assets/cover.png" },
    contents: { title: "Contents", pageNumbers: true },
  },
}
