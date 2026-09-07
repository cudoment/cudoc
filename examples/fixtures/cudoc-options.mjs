/**
 * The cudoc configuration shared by every example site.
 *
 * The three hosts have to be given the same options for their output to be
 * comparable, and every value here is plain JSON so it survives a bundler
 * handing the config to a worker.
 *
 * There is deliberately no default export. Docusaurus loads its config through
 * jiti, which collapses a module that exports the same object twice into one
 * that holds a reference to itself, and the options then fail to serialize.
 */

export const cudocOptions = {
  headingMetadata: {
    depths: [2, 3, 4, 5],
    idDelimiters: ["(#", ")"],
    badgeDelimiters: ["(@", ")"],
    anchor: {
      name: "Anchor",
      idAttribute: "id",
      levelAttribute: "headerLevel",
      levelPrefix: "h",
      badgeAttribute: "badge",
    },
  },
  badge: {
    name: "Badge",
    delimiters: ["(@", ")"],
  },
  tableCellList: true,
  tableColumnLayout: [
    {
      section: { depth: 5, titles: ["Requirements"] },
      columnHeaders: ["Prerequisites"],
      split: { minItems: 4, columns: 2 },
    },
  ],
}
